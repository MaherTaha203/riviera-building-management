import { useGetCashFund, useListCashTransactions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import { usePrint, PrintButton, fmtMoney, fmtDate } from "@/lib/print";
import { ReportTable } from "@/lib/print/documents";

export default function CashFund() {
  const { data: fund, isLoading } = useGetCashFund();
  const { data: transactions = [], isLoading: txLoading } = useListCashTransactions();
  const print = usePrint();

  if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>;

  const txList = transactions as any[];

  const printCashFund = () => {
    const totalCredit = txList.reduce((s: number, t: any) => s + t.credit, 0);
    const totalDebit = txList.reduce((s: number, t: any) => s + t.debit, 0);
    print(
      <div>
        <div className="print-meta">
          <span className="ltr-nums">رصيد الصندوق: {fmtMoney(fund?.balanceILS, "ILS")}</span>
          <span className="ltr-nums">إجمالي المقبوضات: {fmtMoney(totalCredit, "ILS")}</span>
          <span className="ltr-nums">إجمالي المصروفات: {fmtMoney(totalDebit, "ILS")}</span>
        </div>
        <ReportTable
          columns={[
            { label: "التاريخ", render: (t: any) => <span className="ltr-nums">{fmtDate(t.date)}</span> },
            { label: "البيان", render: (t: any) => t.description },
            { label: "مدين (قبض)", render: (t: any) => <span className="ltr-nums">{t.credit > 0 ? fmtMoney(t.credit, "ILS") : "-"}</span> },
            { label: "دائن (صرف)", render: (t: any) => <span className="ltr-nums">{t.debit > 0 ? fmtMoney(t.debit, "ILS") : "-"}</span> },
            { label: "الرصيد", render: (t: any) => <span className="ltr-nums">{fmtMoney(t.balance, "ILS")}</span> },
          ]}
          rows={txList}
          emptyText="لا توجد حركات"
          footer={<tr><td colSpan={3}>الإجمالي</td><td className="ltr-nums">{fmtMoney(totalCredit, "ILS")}</td><td className="ltr-nums">{fmtMoney(totalDebit, "ILS")}</td></tr>}
        />
      </div>,
      { title: "كشف حساب الصندوق النقدي" },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الصندوق النقدي</h1>
          <p className="text-muted-foreground mt-1">كشف حساب الصندوق</p>
        </div>
        <PrintButton onClick={printCashFund} label="طباعة الصندوق" size="default" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">رصيد الصندوق</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ltr-nums ${Number(fund?.balanceILS ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatAmount(Number(fund?.balanceILS ?? 0), "ILS")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المقبوضات</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 ltr-nums">
              {formatAmount(txList.reduce((s: number, t: any) => s + t.credit, 0), "ILS")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 ltr-nums">
              {formatAmount(txList.reduce((s: number, t: any) => s + t.debit, 0), "ILS")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>حركات الصندوق</CardTitle></CardHeader>
        <CardContent className="p-0">
          {txLoading ? <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>البيان</TableHead>
                  <TableHead className="text-emerald-600">مدين (قبض)</TableHead>
                  <TableHead className="text-rose-600">دائن (صرف)</TableHead>
                  <TableHead>الرصيد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txList.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground ltr-nums">{t.id}</TableCell>
                    <TableCell className="ltr-nums">{formatDate(t.date)}</TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell className="text-emerald-600 font-medium ltr-nums">{t.credit > 0 ? formatAmount(t.credit, "ILS") : "-"}</TableCell>
                    <TableCell className="text-rose-600 font-medium ltr-nums">{t.debit > 0 ? formatAmount(t.debit, "ILS") : "-"}</TableCell>
                    <TableCell className={`font-bold ltr-nums ${t.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatAmount(t.balance, "ILS")}</TableCell>
                  </TableRow>
                ))}
                {txList.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد حركات</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
