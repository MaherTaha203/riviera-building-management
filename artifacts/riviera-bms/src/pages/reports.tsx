import { useGetDashboardSummary, useListReceiptVouchers, useListPaymentVouchers, useListContracts, useListCashTransactions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/format";
import { BarChart3, TrendingUp, TrendingDown, Building2, FileText, Wallet } from "lucide-react";

export default function Reports() {
  const { data: summary } = useGetDashboardSummary();
  const { data: receipts = [] } = useListReceiptVouchers();
  const { data: payments = [] } = useListPaymentVouchers();
  const { data: contracts = [] } = useListContracts();
  const { data: txs = [] } = useListCashTransactions();

  const receiptList = receipts as any[];
  const paymentList = payments as any[];
  const contractList = contracts as any[];
  const txList = txs as any[];

  const totalReceipts = receiptList.reduce((s: number, v: any) => s + v.amountILS, 0);
  const totalPayments = paymentList.reduce((s: number, v: any) => s + v.amountILS, 0);

  const paymentsByCategory: Record<string, number> = {};
  paymentList.forEach((p: any) => {
    paymentsByCategory[p.category] = (paymentsByCategory[p.category] ?? 0) + p.amountILS;
  });

  const receiptsByMethod: Record<string, number> = {};
  receiptList.forEach((r: any) => {
    const label = r.paymentMethod === "cash" ? "نقداً" : r.paymentMethod === "cheque" ? "شيك" : r.paymentMethod === "bank_transfer" ? "تحويل بنكي" : r.paymentMethod;
    receiptsByMethod[label] = (receiptsByMethod[label] ?? 0) + r.amountILS;
  });

  const activeContracts = contractList.filter((c: any) => c.status === "active");
  const totalMonthlyRent = activeContracts.reduce((s: number, c: any) => s + c.rentAmountILS, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 size={28} />التقارير</h1>
        <p className="text-muted-foreground mt-1">ملخص إحصائي شامل للعمارة</p>
      </div>

      {/* Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">إجمالي المقبوضات</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600 ltr-nums">{formatAmount(totalReceipts, "ILS")}</div><p className="text-xs text-muted-foreground">{receiptList.length} سند قبض</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-rose-600 ltr-nums">{formatAmount(totalPayments, "ILS")}</div><p className="text-xs text-muted-foreground">{paymentList.length} سند صرف</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">صافي الحركة</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ltr-nums ${totalReceipts - totalPayments >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatAmount(totalReceipts - totalPayments, "ILS")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">الإيجار الشهري المتوقع</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold ltr-nums">{formatAmount(totalMonthlyRent, "ILS")}</div><p className="text-xs text-muted-foreground">{activeContracts.length} عقد نشط</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">نسبة الإشغال</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ltr-nums">
              {summary && summary.totalUnits > 0 ? Math.round((summary.occupiedUnits / summary.totalUnits) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">{summary?.occupiedUnits ?? 0} من {summary?.totalUnits ?? 0} وحدة</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">رصيد الصندوق</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ltr-nums ${Number(summary?.cashBalanceILS ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatAmount(Number(summary?.cashBalanceILS ?? 0), "ILS")}</div>
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
