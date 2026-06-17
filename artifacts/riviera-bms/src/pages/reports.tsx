import { useState } from "react";
import { useGetDashboardSummary, useListReceiptVouchers, useListPaymentVouchers, useListContracts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/format";
import { BarChart3, TrendingUp, TrendingDown, Building2, FileText, Wallet } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 size={28} />التقارير</h1>
        <p className="text-muted-foreground mt-1">ملخص إحصائي شامل للعمارة</p>
      </div>

      {/* Date range filter */}
      <Card>
        <CardHeader><CardTitle className="text-base">فترة التقرير</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div><Label>من تاريخ</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1" /></div>
            <div><Label>إلى تاريخ</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1" /></div>
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
