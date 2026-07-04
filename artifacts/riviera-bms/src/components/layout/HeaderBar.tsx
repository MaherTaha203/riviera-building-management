import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useListTenants, useListUnits, useListContracts, useListReceiptVouchers,
  useListPaymentVouchers, useListCheques, useListBankAccounts,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Search, Bell, Users, Home, FileText, Receipt, CreditCard, Files, Landmark,
} from "lucide-react";
import { formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Global search (V1.1 §1) — searches tenants / units / contracts / receipt
// vouchers / payment vouchers / cheques / bank accounts as you type, and
// navigates to the module on selection. Data comes from the existing list
// hooks (shared react-query cache with the pages; no new APIs).
// ---------------------------------------------------------------------------

interface Hit {
  group: string;
  icon: any;
  path: string;
  title: string;
  subtitle?: string;
  key: string;
}

function matches(q: string, ...fields: Array<unknown>): boolean {
  return fields.some(f => f != null && String(f).toLowerCase().includes(q));
}

function GlobalSearch() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [armed, setArmed] = useState(false); // fetch lists only once the box is used
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const enabled = { query: { enabled: armed } } as any;
  const { data: tenants = [] } = useListTenants(enabled);
  const { data: units = [] } = useListUnits(enabled);
  const { data: contracts = [] } = useListContracts(enabled);
  const { data: receipts = [] } = useListReceiptVouchers(enabled);
  const { data: payments = [] } = useListPaymentVouchers(enabled);
  const { data: cheques = [] } = useListCheques(undefined, enabled);
  const { data: banks = [] } = useListBankAccounts(enabled);

  // Close the results panel when clicking anywhere else.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const out: Hit[] = [];
    const take = <T,>(rows: T[], f: (r: T) => Hit | null) => {
      let n = 0;
      for (const r of rows) {
        const h = f(r);
        if (h) { out.push(h); if (++n >= 5) break; }
      }
    };
    take(tenants as any[], (t: any) =>
      matches(query, t.name, t.phone, t.idNumber) ? { group: "المستأجرون", icon: Users, path: "/tenants", title: t.name, subtitle: t.phone ?? "", key: `t${t.id}` } : null);
    take(units as any[], (u: any) =>
      matches(query, u.unitNumber, u.floor, u.type) ? { group: "الوحدات", icon: Home, path: "/units", title: `وحدة ${u.unitNumber}`, subtitle: u.status === "occupied" ? "مؤجرة" : "شاغرة", key: `u${u.id}` } : null);
    take(contracts as any[], (c: any) =>
      matches(query, c.contractNumber, c.tenantName, c.unitNumber) ? { group: "العقود", icon: FileText, path: "/contracts", title: c.contractNumber, subtitle: c.tenantName ?? "", key: `c${c.id}` } : null);
    take(receipts as any[], (v: any) =>
      matches(query, v.voucherNumber, v.payerName) ? { group: "سندات القبض", icon: Receipt, path: "/receipt-vouchers", title: v.voucherNumber, subtitle: v.payerName ?? "", key: `r${v.id}` } : null);
    take(payments as any[], (v: any) =>
      matches(query, v.voucherNumber, v.beneficiaryName, v.category) ? { group: "سندات الصرف", icon: CreditCard, path: "/payment-vouchers", title: v.voucherNumber, subtitle: v.beneficiaryName ?? "", key: `p${v.id}` } : null);
    take(cheques as any[], (ch: any) =>
      matches(query, ch.chequeNumber, ch.drawerName, ch.bankName) ? { group: "الشيكات", icon: Files, path: "/cheques", title: `شيك ${ch.chequeNumber}`, subtitle: ch.bankName ?? "", key: `q${ch.id}` } : null);
    take(banks as any[], (b: any) =>
      matches(query, b.accountName, b.accountNumber, b.bankName) ? { group: "الحسابات البنكية", icon: Landmark, path: "/bank-accounts", title: b.accountName, subtitle: b.bankName ?? "", key: `b${b.id}` } : null);
    return out;
  }, [q, tenants, units, contracts, receipts, payments, cheques, banks]);

  const groups = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const h of hits) {
      if (!m.has(h.group)) m.set(h.group, []);
      m.get(h.group)!.push(h);
    }
    return [...m.entries()];
  }, [hits]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    navigate(h.path);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setArmed(true); setOpen(true); }}
        placeholder="بحث شامل... (مستأجر، وحدة، عقد، سند، شيك)"
        className="pr-9 h-9"
        data-global-search
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute top-full mt-1 right-0 left-0 z-50 rounded-md border bg-popover text-popover-foreground shadow-md max-h-96 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
          ) : groups.map(([group, rows]) => (
            <div key={group} className="py-1">
              <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground">{group}</div>
              {rows.map(h => {
                const Icon = h.icon;
                return (
                  <button
                    key={h.key}
                    onClick={() => go(h)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-start"
                  >
                    <Icon size={14} className="text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{h.title}</span>
                    {h.subtitle && <span className="text-xs text-muted-foreground truncate mr-auto">{h.subtitle}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications center (V1.1 §3) — derived live from existing data:
// contracts expiring within 30 days, cheques due within 7 days, bounced
// cheques, and tenants with an overdue (negative) balance.
// ---------------------------------------------------------------------------

interface Notice {
  key: string;
  icon: any;
  path: string;
  text: string;
  detail?: string;
  tone: "warn" | "danger";
}

function useNotices(): Notice[] {
  const { data: contracts = [] } = useListContracts();
  const { data: cheques = [] } = useListCheques();
  const { data: tenants = [] } = useListTenants();

  return useMemo(() => {
    const out: Notice[] = [];
    const today = new Date().toISOString().split("T")[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    for (const c of contracts as any[]) {
      if (c.status === "active" && c.endDate >= today && c.endDate <= in30) {
        out.push({ key: `ce${c.id}`, icon: FileText, path: "/contracts", tone: "warn", text: `عقد ${c.contractNumber} ينتهي قريباً`, detail: `${c.tenantName ?? ""} — ${formatDate(c.endDate)}` });
      }
    }
    for (const ch of cheques as any[]) {
      if (ch.status === "pending" && ch.dueDate <= in7) {
        out.push({ key: `cq${ch.id}`, icon: Files, path: "/cheques", tone: "warn", text: `شيك ${ch.chequeNumber} مستحق`, detail: `${ch.drawerName ?? ""} — ${formatDate(ch.dueDate)}` });
      } else if (ch.status === "bounced") {
        out.push({ key: `cb${ch.id}`, icon: Files, path: "/cheques", tone: "danger", text: `شيك ${ch.chequeNumber} مرتجع`, detail: ch.drawerName ?? "" });
      }
    }
    for (const t of tenants as any[]) {
      if (Number(t.balance) < 0) {
        out.push({ key: `tb${t.id}`, icon: Users, path: "/tenants", tone: "danger", text: `${t.name} — رصيد متأخر`, detail: `${Number(t.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })} ILS` });
      }
    }
    return out;
  }, [contracts, cheques, tenants]);
}

function NotificationsBell() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const notices = useNotices();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0" title="التنبيهات">
          <Bell size={17} />
          {notices.length > 0 && (
            <span className="absolute -top-0.5 -left-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none">
              {notices.length > 99 ? "99+" : notices.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" dir="rtl">
        <div className="px-3 py-2 border-b text-sm font-semibold">التنبيهات ({notices.length})</div>
        <div className="max-h-80 overflow-y-auto">
          {notices.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد تنبيهات</div>
          ) : notices.slice(0, 50).map(n => {
            const Icon = n.icon;
            return (
              <button
                key={n.key}
                onClick={() => { setOpen(false); navigate(n.path); }}
                className="w-full flex items-start gap-2 px-3 py-2 text-start hover:bg-accent hover:text-accent-foreground border-b last:border-b-0"
              >
                <Icon size={14} className={`mt-0.5 shrink-0 ${n.tone === "danger" ? "text-destructive" : "text-amber-600"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{n.text}</span>
                  {n.detail && <span className="block text-xs text-muted-foreground truncate ltr-nums">{n.detail}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HeaderBar() {
  return (
    <header className="h-14 shrink-0 border-b bg-background flex items-center gap-3 px-4">
      <GlobalSearch />
      <div className="mr-auto flex items-center gap-1">
        <NotificationsBell />
      </div>
    </header>
  );
}
