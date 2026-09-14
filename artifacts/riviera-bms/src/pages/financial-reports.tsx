import { useState } from "react";
import {
  useGetTrialBalance, useGetIncomeStatement, useGetBalanceSheet,
  useGetAgingReport, useGetAccountLedger, useListLedgerAccounts,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatAmount, formatDate } from "@/lib/format";
import { Scale, TrendingUp, Building2, Clock, ScrollText } from "lucide-react";

const money = (n: number) => <span className="ltr-nums">{formatAmount(Number(n || 0), "ILS")}</span>;

/** Financial statements built on the double-entry ledger (Phase 2). */
export default function FinancialReports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2"><Scale size={26} /> القوائم المالية</h1>
        <p className="text-muted-foreground mt-1 text-[12.5px]">تقارير محاسبية مشتقّة من دفتر الأستاذ (القيد المزدوج)</p>
      </div>

      <Tabs defaultValue="trial-balance">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="trial-balance"><Scale className="ms-1 h-4 w-4" /> ميزان المراجعة</TabsTrigger>
          <TabsTrigger value="income"><TrendingUp className="ms-1 h-4 w-4" /> قائمة الدخل</TabsTrigger>
          <TabsTrigger value="balance-sheet"><Building2 className="ms-1 h-4 w-4" /> الميزانية العمومية</TabsTrigger>
          <TabsTrigger value="aging"><Clock className="ms-1 h-4 w-4" /> أعمار الذمم</TabsTrigger>
          <TabsTrigger value="ledger"><ScrollText className="ms-1 h-4 w-4" /> كشف حساب</TabsTrigger>
        </TabsList>

        <TabsContent value="trial-balance" className="mt-4"><TrialBalanceTab /></TabsContent>
        <TabsContent value="income" className="mt-4"><IncomeStatementTab /></TabsContent>
        <TabsContent value="balance-sheet" className="mt-4"><BalanceSheetTab /></TabsContent>
        <TabsContent value="aging" className="mt-4"><AgingTab /></TabsContent>
        <TabsContent value="ledger" className="mt-4"><AccountLedgerTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AsOfBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div className="w-48"><Label>حتى تاريخ</Label><SmartDateInput value={value} onChange={onChange} className="mt-1" /></div>
      {value && <Button variant="outline" size="sm" onClick={() => onChange("")}>اليوم</Button>}
    </div>
  );
}

function TrialBalanceTab() {
  const [asOf, setAsOf] = useState("");
  const { data, isLoading } = useGetTrialBalance(asOf ? { asOf } : undefined);
  const tb = data as any;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">ميزان المراجعة {tb?.balanced === false && <span className="text-rose-600 text-xs">(غير متوازن!)</span>}</CardTitle>
        <AsOfBar value={asOf} onChange={setAsOf} />
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرمز</TableHead><TableHead>الحساب</TableHead>
                <TableHead className="text-end">مدين</TableHead><TableHead className="text-end">دائن</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">جارٍ التحميل…</TableCell></TableRow>
              ) : (tb?.lines ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا حركات</TableCell></TableRow>
              ) : (tb.lines as any[]).map((l) => (
                <TableRow key={l.accountId}>
                  <TableCell className="ltr-nums text-muted-foreground">{l.code ?? "—"}</TableCell>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-end">{l.debit ? money(l.debit) : "—"}</TableCell>
                  <TableCell className="text-end">{l.credit ? money(l.credit) : "—"}</TableCell>
                </TableRow>
              ))}
              {tb?.lines?.length > 0 && (
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={2}>الإجمالي</TableCell>
                  <TableCell className="text-end">{money(tb.totalDebit)}</TableCell>
                  <TableCell className="text-end">{money(tb.totalCredit)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatementSection({ title, lines, total, totalLabel }: { title: string; lines: any[]; total: number; totalLabel: string }) {
  return (
    <div>
      <h3 className="font-bold text-sm mb-2">{title}</h3>
      <Table>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow><TableCell className="text-muted-foreground text-sm py-3">لا بنود</TableCell><TableCell /></TableRow>
          ) : lines.map((l) => (
            <TableRow key={l.accountId}>
              <TableCell>{l.name}</TableCell>
              <TableCell className="text-end">{money(l.amount)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-bold border-t"><TableCell>{totalLabel}</TableCell><TableCell className="text-end">{money(total)}</TableCell></TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function IncomeStatementTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const { data } = useGetIncomeStatement(Object.keys(params).length ? params : undefined);
  const is = data as any;
  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <CardTitle className="text-base">قائمة الدخل</CardTitle>
        <div className="flex items-end gap-2">
          <div className="w-40"><Label>من</Label><SmartDateInput value={from} onChange={setFrom} className="mt-1" /></div>
          <div className="w-40"><Label>إلى</Label><SmartDateInput value={to} onChange={setTo} className="mt-1" /></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <StatementSection title="الإيرادات" lines={is?.revenue ?? []} total={is?.totalRevenue ?? 0} totalLabel="إجمالي الإيرادات" />
        <StatementSection title="المصروفات" lines={is?.expenses ?? []} total={is?.totalExpenses ?? 0} totalLabel="إجمالي المصروفات" />
        <div className="flex justify-between items-center border-t-2 pt-3 font-extrabold text-lg">
          <span>صافي الدخل</span>
          <span className={Number(is?.netIncome ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(is?.netIncome ?? 0)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceSheetTab() {
  const [asOf, setAsOf] = useState("");
  const { data } = useGetBalanceSheet(asOf ? { asOf } : undefined);
  const bs = data as any;
  const equityLines = [...(bs?.equity ?? []), { accountId: -1, name: "صافي الدخل الجاري", amount: bs?.netIncome ?? 0 }];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">الميزانية العمومية {bs?.balanced === false && <span className="text-rose-600 text-xs">(غير متوازنة!)</span>}</CardTitle>
        <AsOfBar value={asOf} onChange={setAsOf} />
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <StatementSection title="الأصول" lines={bs?.assets ?? []} total={bs?.totalAssets ?? 0} totalLabel="إجمالي الأصول" />
        <div className="space-y-5">
          <StatementSection title="الخصوم" lines={bs?.liabilities ?? []} total={bs?.totalLiabilities ?? 0} totalLabel="إجمالي الخصوم" />
          <StatementSection title="حقوق الملكية" lines={equityLines} total={(bs?.totalEquity ?? 0) + (bs?.netIncome ?? 0)} totalLabel="إجمالي حقوق الملكية" />
          <div className="flex justify-between items-center border-t-2 pt-2 font-bold">
            <span>إجمالي الخصوم وحقوق الملكية</span>{money(bs?.totalLiabilitiesAndEquity ?? 0)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgingTab() {
  const [asOf, setAsOf] = useState("");
  const { data } = useGetAgingReport(asOf ? { asOf } : undefined);
  const ag = data as any;
  const cols = [
    ["المستأجر", (r: any) => r.tenantName ?? `#${r.tenantId}`],
    ["جارٍ", (r: any) => money(r.current)],
    ["1–30", (r: any) => money(r.d1_30)],
    ["31–60", (r: any) => money(r.d31_60)],
    ["61–90", (r: any) => money(r.d61_90)],
    ["90+", (r: any) => money(r.d90_plus)],
    ["الإجمالي", (r: any) => <span className="font-bold">{money(r.total)}</span>],
  ] as const;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">أعمار الذمم المدينة</CardTitle>
        <AsOfBar value={asOf} onChange={setAsOf} />
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{cols.map((c, i) => <TableHead key={i} className={i === 0 ? "" : "text-end"}>{c[0]}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {(ag?.rows ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground py-8">لا ذمم مستحقة</TableCell></TableRow>
              ) : (ag.rows as any[]).map((r) => (
                <TableRow key={r.tenantId}>{cols.map((c, i) => <TableCell key={i} className={i === 0 ? "font-medium" : "text-end"}>{c[1](r)}</TableCell>)}</TableRow>
              ))}
              {ag?.rows?.length > 0 && (
                <TableRow className="font-bold border-t-2">
                  <TableCell>الإجمالي</TableCell>
                  {(["current", "d1_30", "d31_60", "d61_90", "d90_plus", "total"] as const).map((k) => <TableCell key={k} className="text-end">{money(ag.totals[k])}</TableCell>)}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountLedgerTab() {
  const { data: accounts = [] } = useListLedgerAccounts();
  const [accountId, setAccountId] = useState("");
  const { data } = useGetAccountLedger({ accountId: Number(accountId) }, { query: { enabled: !!accountId } } as any);
  const led = data as any;
  const options = (accounts as any[]).map((a) => ({ value: String(a.id), label: `${a.code ? a.code + " — " : ""}${a.name}` }));
  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <CardTitle className="text-base">كشف حساب</CardTitle>
        <div className="w-full sm:w-72"><Label>الحساب</Label><SearchableSelect value={accountId} onChange={setAccountId} options={options} placeholder="اختر حساباً" className="mt-1" /></div>
      </CardHeader>
      <CardContent className="p-0">
        {!accountId ? (
          <p className="text-center text-muted-foreground py-8 text-sm">اختر حساباً لعرض كشفه</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead><TableHead>المرجع</TableHead>
                  <TableHead className="text-end">مدين</TableHead><TableHead className="text-end">دائن</TableHead><TableHead className="text-end">الرصيد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="text-muted-foreground"><TableCell colSpan={4}>الرصيد الافتتاحي</TableCell><TableCell className="text-end">{money(led?.openingBalance ?? 0)}</TableCell></TableRow>
                {(led?.entries ?? []).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="ltr-nums">{formatDate(e.txnDate)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.sourceType}{e.sourceId ? ` #${e.sourceId}` : ""}</TableCell>
                    <TableCell className="text-end">{e.debit ? money(e.debit) : "—"}</TableCell>
                    <TableCell className="text-end">{e.credit ? money(e.credit) : "—"}</TableCell>
                    <TableCell className="text-end font-medium">{money(e.balance)}</TableCell>
                  </TableRow>
                ))}
                {led && led.entries.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">لا حركات في هذا الحساب</TableCell></TableRow>}
                {led?.entries?.length > 0 && (
                  <TableRow className="font-bold border-t-2"><TableCell colSpan={4}>الرصيد الختامي</TableCell><TableCell className="text-end">{money(led.closingBalance)}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
