import { useGetDashboardSummary, useGetDashboardRecentActivity, useGetDashboardLatestReceipts } from "@workspace/api-client-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { pmark, pmarkInteractive } from "@/lib/perf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatAmount, formatDate } from "@/lib/format";
import { Building2, Users, FileText, Activity, AlertTriangle } from "lucide-react";
import { useNotices } from "@/components/layout/HeaderBar";

// Approved dashboard design — Concept 4 "خط السيولة":
// navy liquidity hero (cash / banks / pending cheques / monthly net) with a
// gold edge, then KPIs + month flow + latest receipts, and a permanent
// "يتطلب انتباهك" attention rail. Same data, same endpoints — UI only.
//
// Phase 1 (perceived performance): shell-first rendering. The full layout —
// hero frame, card frames, headers, static labels — paints immediately on
// mount; only the data-bound numbers show a subtle skeleton until their query
// resolves. No full-page blocker. Client-only; no data/endpoint change.

const methodLabels: Record<string, string> = { cash: "نقدي", cheque: "شيك", bank_transfer: "حوالة بنكية", other: "أخرى" };

// Subtle skeleton placeholder (opacity pulse, not a sweeping shimmer). `light`
// tunes contrast for the navy hero vs. the white cards.
function Sk({ className = "", light = false }: { className?: string; light?: boolean }) {
  return <span aria-hidden="true" className={`inline-block rounded-md animate-pulse align-middle ${light ? "bg-white/15" : "bg-foreground/10"} ${className}`} />;
}

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary();
  const { data: activities, isLoading: isLoadingActivities } = useGetDashboardRecentActivity();
  // Phase 3 — lightweight top-5 endpoint (~1KB) instead of the full ~620KB list.
  const { data: latestData = [], isLoading: isLoadingReceipts } = useGetDashboardLatestReceipts();
  const notices = useNotices();
  const [, navigate] = useLocation();

  // Diagnostics marks (no-op unless the diag flag is on). Pure observation —
  // these read existing state only; they do not alter dashboard behaviour.
  useEffect(() => { pmark("dash:mounted"); }, []);
  useEffect(() => { if (summary) pmark("dash:kpis"); }, [summary]);
  useEffect(() => { if (!isLoadingReceipts) pmark("dash:charts"); }, [isLoadingReceipts]);
  useEffect(() => { if (!isLoadingActivities) pmark("dash:activity"); }, [isLoadingActivities]);
  useEffect(() => {
    if (summary && !isLoadingReceipts && !isLoadingActivities) pmarkInteractive();
  }, [summary, isLoadingReceipts, isLoadingActivities]);

  // Shell-first: never blank the whole page. `ready` gates only the numbers.
  const ready = !!summary;
  const s = (summary ?? {}) as any;
  const monthlyNet = Number(s.monthlyReceiptsILS) - Number(s.monthlyPaymentsILS);
  const totalFlow = Number(s.monthlyReceiptsILS) + Number(s.monthlyPaymentsILS);
  const netPct = totalFlow > 0 ? Math.max(4, Math.round((Number(s.monthlyReceiptsILS) / totalFlow) * 100)) : 0;
  const occPct = s.totalUnits > 0 ? Math.round((s.occupiedUnits / s.totalUnits) * 100) : 0;
  const monthLabel = new Date().toLocaleDateString("ar", { month: "long", year: "numeric" });
  const latestReceipts = latestData as any[];

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-1 text-[12.5px]">خط السيولة أولاً — ثم ما يتطلب انتباهك</p>
      </div>

      {/* ── Liquidity hero (glossy black, mint edge) ── */}
      <div className="relative overflow-hidden rounded-[14px] rv-bar ring-1 ring-white/5 text-white shadow-lg grid grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.1fr] py-[22px] px-2 lg:px-[26px]">
        <span className="absolute inset-y-0 right-0 w-1 bg-secondary" aria-hidden="true" />
        <div className="px-4 lg:px-[22px] lg:border-l border-white/12">
          <div className="text-[10.5px] font-bold text-white/55 mb-1.5">رصيد الصندوق</div>
          <div className="text-[24px] font-semibold text-secondary ltr-nums text-left">{ready ? formatAmount(Number(s.cashBalanceILS), "ILS") : <Sk light className="h-6 w-28" />}</div>
          <div className="text-[10.5px] text-white/50 mt-1">الرصيد النقدي المتوفر</div>
        </div>
        <div className="px-4 lg:px-[22px] lg:border-l border-white/12">
          <div className="text-[10.5px] font-bold text-white/55 mb-1.5">الحسابات البنكية</div>
          <div className="text-[24px] font-semibold ltr-nums text-left">{ready ? formatAmount(Number(s.totalBankBalanceILS), "ILS") : <Sk light className="h-6 w-28" />}</div>
          <div className="text-[10.5px] text-white/50 mt-1">إجمالي الأرصدة</div>
        </div>
        <div className="px-4 lg:px-[22px] lg:border-l border-white/12 mt-4 lg:mt-0">
          <div className="text-[10.5px] font-bold text-white/55 mb-1.5">شيكات معلّقة</div>
          <div className="text-[24px] font-semibold ltr-nums text-left">{ready ? s.pendingCheques : <Sk light className="h-6 w-10" />}</div>
          <div className="text-[10.5px] text-white/50 mt-1">بانتظار الاستحقاق</div>
        </div>
        <div className="px-4 lg:px-[22px] mt-4 lg:mt-0">
          <div className="text-[10.5px] font-bold text-white/55 mb-1.5">صافي حركة الشهر — {monthLabel}</div>
          <div className="text-[24px] font-semibold text-secondary ltr-nums text-left">{ready ? formatAmount(monthlyNet, "ILS") : <Sk light className="h-6 w-28" />}</div>
          <div className="mt-2 h-[5px] rounded-[3px] bg-white/15 overflow-hidden flex">
            <div className="bg-secondary rounded-[3px]" style={{ width: ready ? `${netPct}%` : "0%" }} />
          </div>
          <div className="text-[10.5px] text-white/50 mt-1.5">
            {ready ? (
              <>مقبوضات <span className="ltr-nums">{formatAmount(Number(s.monthlyReceiptsILS), "ILS")}</span> · مصروفات <span className="ltr-nums">{formatAmount(Number(s.monthlyPaymentsILS), "ILS")}</span></>
            ) : <Sk light className="h-3 w-40" />}
          </div>
        </div>
      </div>

      {/* ── Body: main column + attention rail ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="transition-colors hover:border-primary/30">
              <CardContent className="pt-3.5 pb-3.5 px-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground mb-2"><Building2 size={14} />الإشغال</div>
                <div className="text-[23px] font-semibold ltr-nums text-left tracking-tight">{ready ? <>{s.occupiedUnits} / {s.totalUnits}</> : <Sk className="h-6 w-20" />}</div>
                <div className="mt-2.5 h-1.5 rounded-[3px] bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-[3px]" style={{ width: ready ? `${occPct}%` : "0%" }} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  {ready ? (
                    <><span className="text-emerald-600 font-medium ltr-nums">{s.vacantUnits}</span> وحدات شاغرة · <span className="ltr-nums">{occPct}٪</span> إشغال</>
                  ) : <Sk className="h-3 w-32" />}
                </div>
              </CardContent>
            </Card>
            <Card className="transition-colors hover:border-primary/30">
              <CardContent className="pt-3.5 pb-3.5 px-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground mb-2"><Users size={14} />المستأجرين</div>
                <div className="text-[23px] font-semibold ltr-nums text-left tracking-tight">{ready ? s.totalTenants : <Sk className="h-6 w-12" />}</div>
                <div className="text-[11px] text-muted-foreground mt-2">إجمالي المستأجرين</div>
              </CardContent>
            </Card>
            <Card className="transition-colors hover:border-primary/30">
              <CardContent className="pt-3.5 pb-3.5 px-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground mb-2"><FileText size={14} />العقود النشطة</div>
                <div className="text-[23px] font-semibold ltr-nums text-left tracking-tight">{ready ? s.activeContracts : <Sk className="h-6 w-12" />}</div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  {ready ? (
                    <><span className="text-amber-600 font-medium ltr-nums">{s.expiringContractsSoon || 0}</span> تنتهي خلال 30 يوماً</>
                  ) : <Sk className="h-3 w-28" />}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Month flow */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3.5 px-5">
              <CardTitle className="text-[13.5px] font-extrabold">حركة الشهر الحالي</CardTitle>
              <span className="text-[11px] text-muted-foreground">{monthLabel}</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-3 text-center py-3.5 px-5">
                <div className="border-l px-2">
                  <div className="text-[10.5px] text-muted-foreground font-bold mb-1">المقبوضات</div>
                  <div className="text-base font-semibold text-emerald-600 ltr-nums">{ready ? formatAmount(Number(s.monthlyReceiptsILS), "ILS") : <Sk className="h-4 w-20" />}</div>
                </div>
                <div className="border-l px-2">
                  <div className="text-[10.5px] text-muted-foreground font-bold mb-1">المصروفات</div>
                  <div className="text-base font-semibold text-rose-600 ltr-nums">{ready ? formatAmount(Number(s.monthlyPaymentsILS), "ILS") : <Sk className="h-4 w-20" />}</div>
                </div>
                <div className="px-2">
                  <div className="text-[10.5px] text-muted-foreground font-bold mb-1">صافي الحركة</div>
                  <div className="text-base font-semibold ltr-nums">{ready ? formatAmount(monthlyNet, "ILS") : <Sk className="h-4 w-20" />}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Latest receipt vouchers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3.5 px-5">
              <CardTitle className="text-[13.5px] font-extrabold">آخر سندات القبض</CardTitle>
              <span className="text-[11px] text-muted-foreground">أحدث 5 سندات</span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم السند</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الدافع</TableHead>
                    <TableHead className="text-left">المبلغ</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingReceipts ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell><Sk className="h-4 w-24" /></TableCell>
                        <TableCell><Sk className="h-4 w-20" /></TableCell>
                        <TableCell><Sk className="h-4 w-28" /></TableCell>
                        <TableCell className="text-left"><Sk className="h-4 w-16" /></TableCell>
                        <TableCell><Sk className="h-4 w-14" /></TableCell>
                      </TableRow>
                    ))
                  ) : latestReceipts.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد سندات</TableCell></TableRow>
                  ) : latestReceipts.map((v: any) => (
                    <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate("/receipt-vouchers")}>
                      <TableCell className="font-mono text-sm ltr-nums">{v.voucherNumber}</TableCell>
                      <TableCell className="ltr-nums">{formatDate(v.date)}</TableCell>
                      <TableCell>{v.payerName}</TableCell>
                      <TableCell className="text-left font-medium ltr-nums">{formatAmount(Number(v.amountILS), "ILS")}</TableCell>
                      <TableCell><Badge variant="outline">{methodLabels[v.paymentMethod] ?? v.paymentMethod}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Attention rail */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b py-3.5 px-5">
              <CardTitle className="text-[12px] font-extrabold flex items-center gap-2"><Activity size={14} />أحدث الحركات</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingActivities ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={`ska-${i}`} className="flex gap-2.5 px-4 py-2.5 border-b last:border-b-0">
                    <span className="w-[7px] h-[7px] rounded-full mt-1.5 shrink-0 bg-foreground/10 animate-pulse" />
                    <span className="min-w-0 flex-1 space-y-1.5"><Sk className="h-3 w-full max-w-[180px]" /><Sk className="h-2.5 w-24" /></span>
                  </div>
                ))
              ) : ((activities as any[]) ?? []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">لا توجد حركات</div>
              ) : ((activities as any[]) ?? []).slice(0, 8).map((a: any) => (
                <div key={a.id} className="flex gap-2.5 px-4 py-2.5 border-b last:border-b-0">
                  <span className={`w-[7px] h-[7px] rounded-full mt-1.5 shrink-0 ${a.type === "CREATE" ? "bg-emerald-600" : a.type === "DELETE" ? "bg-rose-600" : "bg-primary"}`} />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold truncate">{a.description}</span>
                    <span className="block text-[10.5px] text-muted-foreground ltr-nums" style={{ direction: "ltr", textAlign: "right" }}>
                      {a.type} · {formatDate(a.createdAt)}
                    </span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b py-3.5 px-5">
              <CardTitle className="text-[12px] font-extrabold flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600" />
                يتطلب انتباهك
                <span className="ltr-nums bg-secondary text-primary text-[10px] font-extrabold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1.5">
                  {notices.length > 99 ? "99+" : notices.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[340px] overflow-y-auto">
              {notices.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">لا توجد تنبيهات</div>
              ) : notices.slice(0, 30).map(n => (
                <button
                  key={n.key}
                  onClick={() => navigate(n.path)}
                  className="w-full flex gap-2.5 px-4 py-3 border-b last:border-b-0 text-start hover:bg-accent transition-colors"
                >
                  <span className={`w-[3px] self-stretch rounded-[2px] shrink-0 ${n.tone === "danger" ? "bg-destructive" : "bg-secondary"}`} />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold truncate">{n.text}</span>
                    {n.detail && <span className="block text-[10.5px] text-muted-foreground truncate ltr-nums">{n.detail}</span>}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
