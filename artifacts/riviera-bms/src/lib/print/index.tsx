import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { getUser, getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import "./print.css";

// ---------------------------------------------------------------------------
// Formatting helpers (shared so every printed document is consistent)
// ---------------------------------------------------------------------------
export function fmtMoney(value: unknown, currency = "ILS"): string {
  const n = Number(value ?? 0);
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} ${currency}`;
}

// Plain tabular number (no currency suffix) — used inside ledger/summary tables
// where the column header already implies the currency, so cells stay on one
// line and align cleanly.
export function fmtNum(value: unknown): string {
  return Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(value: unknown): string {
  if (!value) return "-";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB"); // dd/mm/yyyy, locale-stable
}

// ---------------------------------------------------------------------------
// Print context
// ---------------------------------------------------------------------------
interface PrintOptions {
  title: string;
  refNumber?: string;
}

type PrintFn = (body: ReactNode, opts: PrintOptions) => void;

const PrintContext = createContext<PrintFn | null>(null);

export function usePrint(): PrintFn {
  const ctx = useContext(PrintContext);
  if (!ctx) throw new Error("usePrint must be used within <PrintProvider>");
  return ctx;
}

// A single #print-root element appended to <body>, a sibling of #root.
function usePrintRoot(): HTMLElement | null {
  const ref = useRef<HTMLElement | null>(null);
  if (!ref.current && typeof document !== "undefined") {
    let el = document.getElementById("print-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-root";
      document.body.appendChild(el);
    }
    ref.current = el;
  }
  return ref.current;
}

export function PrintProvider({ children }: { children: ReactNode }) {
  const printRoot = usePrintRoot();
  // Only fetch settings (for the print masthead) when authenticated — otherwise
  // this provider, which is mounted above the router, fires an unauthenticated
  // GET /settings (401) on the login page.
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), enabled: !!getToken() },
  });
  const [doc, setDoc] = useState<{ body: ReactNode; opts: PrintOptions } | null>(null);

  // Clear the print document once the print dialog closes.
  useEffect(() => {
    const after = () => setDoc(null);
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  const print = useCallback<PrintFn>((body, opts) => {
    setDoc({ body, opts });
    // Wait for the portal to render, then open the browser print dialog.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }, []);

  const value = useMemo(() => print, [print]);

  return (
    <PrintContext.Provider value={value}>
      {children}
      {doc && printRoot
        ? createPortal(
            <PrintLayout title={doc.opts.title} refNumber={doc.opts.refNumber} settings={settings}>
              {doc.body}
            </PrintLayout>,
            printRoot,
          )
        : null}
    </PrintContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Shared document chrome — masthead, title, meta, footer. Applied centrally so
// there is exactly one print template across the whole system.
// ---------------------------------------------------------------------------
function PrintLayout({
  title,
  refNumber,
  settings,
  children,
}: {
  title: string;
  refNumber?: string;
  settings: unknown;
  children: ReactNode;
}) {
  const s = (settings ?? {}) as Record<string, unknown>;
  const buildingName = (s.buildingName as string) || "Riviera Building Management";
  const buildingAddress = (s.buildingAddress as string) || "";
  const phone = (s.phone as string) || "";
  const taxNumber = (s.taxNumber as string) || "";
  const user = getUser();
  const printedBy = user?.name || user?.username || "—";
  const now = new Date();
  const printedAt = `${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  // Brand monogram derived from the building name (the system has no stored
  // logo asset). Takes the first letter of up to two words.
  const monogram = buildingName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "R";

  return (
    <div className="print-doc">
      <div className="print-masthead">
        <div className="brand">
          <div className="print-logo">{monogram}</div>
          <div>
            <div className="building-name">{buildingName}</div>
            {buildingAddress && <div className="building-meta">{buildingAddress}</div>}
            {(phone || taxNumber) && (
              <div className="building-meta">
                {phone && <span>هاتف: <span className="ltr-nums">{phone}</span></span>}
                {phone && taxNumber && <span> • </span>}
                {taxNumber && <span>الرقم الضريبي: <span className="ltr-nums">{taxNumber}</span></span>}
              </div>
            )}
          </div>
        </div>
        <div className="building-meta docmeta text-end">
          {refNumber && <div>رقم المستند: <b className="ltr-nums">{refNumber}</b></div>}
          <div>تاريخ الطباعة: <b className="ltr-nums">{printedAt}</b></div>
        </div>
      </div>

      <div className="print-title"><span>{title}</span></div>

      {children}

      <div className="print-footer">
        <span>{buildingName}</span>
        <span>طُبع بواسطة: {printedBy}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable print button
// ---------------------------------------------------------------------------
export function PrintButton(props: { onClick: () => void; label?: string; size?: "sm" | "default"; variant?: "outline" | "default" }) {
  return (
    <Button type="button" variant={props.variant ?? "outline"} size={props.size ?? "sm"} onClick={props.onClick} className="flex items-center gap-1 no-print">
      <Printer size={14} />
      {props.label ?? "طباعة"}
    </Button>
  );
}
