import { useState } from "react";
import { PrintExportButton } from "@/components/PrintExportButton";
import { useGetDashboardSummary, useListReceiptVouchers, useListPaymentVouchers, useListContracts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/format";
import { BarChart3, TrendingUp, TrendingDown, Building2, FileText, Wallet } from "lucide-react";
import { usePrint, PrintButton, fmtMoney, fmtDate } from "@/lib/print";
import { ReportTable, FinancialSummaryDoc } from "@/lib/print/documents";

export default function Reports() {
  const { data: summary } = useGetDashboardSummary();
  const { data: receipts = [] } = useListReceiptVouchers();
  const { data: payments = [] } = useListPaymentVouchers();
  const { data: contracts = [] } = useListContracts();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");

  const handleApply = () => {
    setAppliedFrom(from);
    setAppliedTo(to);
  };
  const handleReset = () => {
    setFrom("");
    setTo("");
    setAppliedFrom("");
    setAppliedTo("");
  };

  const receiptList = receipts as any[];
  const paymentList = payments as any[];
  const contractList = contracts as any[];

  const filteredReceipts = receiptList.filter((v: any) => {
    if (appliedFrom && v.date < appliedFrom) return false;
    if (appliedTo && v.date > appliedTo) return false;
    return true;
  });
  const filteredPayments = paymentList.filter((v: any) => {
    if (appliedFrom && v.date < appliedFrom) return false;
    if (appliedTo && v.date > appliedTo) return false;
    return true;
  });

  const totalReceipts = filteredReceipts.reduce((s: number, v: any) => s + Number(v.amountILS), 0);
  const totalPayments = filteredPayments.reduce((s: number, v: any) => s + Number(v.amountILS), 0);

  const paymentsByCategory: Record<string, number> = {};
  filteredPayments.forEach((p: any) => {
    paymentsByCategory[p.category] = (paymentsByCategory[p.category] ?? 0) + Number(p.amountILS);
  });

  const receiptsByMethod: Record<string, number> = {};
  filteredReceipts.forEach((r: any) => {
    const label =
      r.paymentMethod === "cash" ? "نقداً" :
      r.paymentMethod === "cheque" ? "شيك" :
      r.paymentMethod === "bank_transfer" ? "تحويل بنكي" : r.paymentMethod;
    receiptsByMethod[label] = (receiptsByMethod[label] ?? 0) + Number(r.amountILS);
  });

  // Period-aware occupancy: contracts whose period overlaps [appliedFrom, appliedTo]
  const periodContracts = contractList.filter((c: any) => {
    if (!appliedFrom && !appliedTo) return c.status === "active";
    const start = c.startDate ?? "";
    const end = c.endDate ?? "9999-12-31";
    if (appliedFrom && end < appliedFrom) return false;
    if (appliedTo && start > appliedTo) return false;
    return true;
  });
  const periodOccupiedUnitIds = new Set(periodContracts.map((c: any) => c.unitId).filter(Boolean));
  const totalMonthlyRent = periodContracts.reduce((s: number, c: any) => s + Number(c.rentAmountILS), 0);

  const isFiltered = appliedFrom || appliedTo;

  // Contracts expiring within the next 60 days (active).
  const today = new Date().toISOString().split("T")[0];
  const horizon = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
  const expiring = contractList
    .filter((c: any) => c.status === "active" && c.endDate >= today && c.endDate <= horizon)
    .sort((a: any, b: any) => a.endDate.localeCompare(b.endDate));

  const print = usePrint();
  const periodLabel = isFiltered ? `${appliedFrom || "البداية"} — ${appliedTo || "النهاية"}` : "كل الفترات";
  const occupancyPct = (summary?.totalUnits ?? 0) > 0 ? Math.round((periodOccupiedUnitIds.size / (summary?.totalUnits ?? 1)) * 100) : 0;
  const printSummary = () => print(
    <FinancialSummaryDoc
      periodLabel={periodLabel}
      totalReceipts={totalReceipts}
      totalPayments={totalPayments}
      totalMonthlyRent={totalMonthlyRent}
      occupancyPct={occupancyPct}
      cashBalance={Number(summary?.cashBalanceILS ?? 0)}
      paymentsByCategory={Object.entries(paymentsByCategory).sort((a, b) => b[1] - a[1])}
      receiptsByMethod={Object.entries(receiptsByMethod).sort((a, b) => b[1] - a[1])}
    />,
    { title: "الملخص المالي" },
  );
  const printExpiring = () => print(
    <ReportTable
      columns={[
        { label: "رقم العقد", render: (c: any) => <span className="ltr-nums">{c.contractNumber}</span> },
        { label: "المستأجر", render: (c: any) => c.tenantName },
        { label: "الوحدة", render: (c: any) => <span className="ltr-nums">{c.unitNumber}</span> },
        { label: "تاريخ الانتهاء", render: (c: any) => <span className="ltr-nums">{fmtDate(c.endDate)}</span> },
        { label: "الإيجار (شيكل)", render: (c: any) => <span className="ltr-nums">{fmtMoney(c.rentAmountILS, "ILS")}</span> },
      ]}
      rows={expiring}
      emptyText="لا توجد عقود تنتهي خلال 60 يوماً"
    />,
    { title: "العقود المنتهية خلال 60 يوماً" },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2"><BarChart3 size={28} />التقارير</h1>
          <p className="text-muted-foreground mt-1 text-[12.5px]">ملخص إحصائي شامل للعمارة</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintExportButton
            prints={[
              { label: "طباعة الملخص", onClick: printSummary },
              { label: "العقود المنتهية", onClick: printExpiring },
            ]}
          />
        </div>
      </div>

      {/* Date range filter */}
      <Card>
        <CardHeader><CardTitle className="text-base">فترة التقرير</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div><Label>من تاريخ</Label><SmartDateInput value={from} onChange={setFrom} className="mt-1" /></div>
            <div><Label>إلى تاريخ</Label><SmartDateInput value={to} onChange={setTo} className="mt-1" /></div>
            <Button onClick={handleApply} className="w-full">تطبيق</Button>
            <Button onClick={handleReset} variant="outline" className="w-full">إعادة تعيين</Button>
          </div>
          {isFiltered && (
            <p className="text-xs text-muted-foreground mt-2">
              تقرير الفترة: {appliedFrom || "البداية"} — {appliedTo || "النهاية"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Overview KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">إجمالي المقبوضات</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 ltr-nums">{formatAmount(totalReceipts, "ILS")}</div>
            <p className="text-xs text-muted-foreground">{filteredReceipts.length} سند قبض</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 ltr-nums">{formatAmount(totalPayments, "ILS")}</div>
            <p className="text-xs text-muted-foreground">{filteredPayments.length} سند صرف</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">صافي الحركة</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ltr-nums ${totalReceipts - totalPayments >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatAmount(totalReceipts - totalPayments, "ILS")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">الإيجار الشهري المتوقع</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ltr-nums">{formatAmount(totalMonthlyRent, "ILS")}</div>
            <p className="text-xs text-muted-foreground">{periodContracts.length} عقد {isFiltered ? "خلال الفترة" : "نشط"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">نسبة الإشغال</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ltr-nums">
              {(summary?.totalUnits ?? 0) > 0 ? Math.round((periodOccupiedUnitIds.size / (summary?.totalUnits ?? 1)) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">{periodOccupiedUnitIds.size} من {summary?.totalUnits ?? 0} وحدة</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">رصيد الصندوق</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ltr-nums ${Number(summary?.cashBalanceILS ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatAmount(Number(summary?.cashBalanceILS ?? 0), "ILS")}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>المصروفات حسب البند</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(paymentsByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
                const pct = totalPayments > 0 ? Math.round((amount / totalPayments) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1"><span>{cat}</span><span className="font-medium ltr-nums">{formatAmount(amount, "ILS")}</span></div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
              {Object.keys(paymentsByCategory).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>المقبوضات حسب طريقة الدفع</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(receiptsByMethod).sort((a, b) => b[1] - a[1]).map(([method, amount]) => {
                const pct = totalReceipts > 0 ? Math.round((amount / totalReceipts) * 100) : 0;
                return (
                  <div key={method}>
                    <div className="flex justify-between text-sm mb-1"><span>{method}</span><span className="font-medium ltr-nums">{formatAmount(amount, "ILS")}</span></div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
              {Object.keys(receiptsByMethod).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
