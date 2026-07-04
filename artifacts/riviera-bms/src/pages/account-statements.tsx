import { useState } from "react";
import { PrintExportButton } from "@/components/PrintExportButton";
import { useListAccountStatements, useListTenants } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import { usePrint, PrintButton } from "@/lib/print";
import { AccountStatementDoc } from "@/lib/print/documents";

export default function AccountStatements() {
  const { data: tenants = [] } = useListTenants();
  const [tenantId, setTenantId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [queryParams, setQueryParams] = useState<any>({});

  const { data: statement, isLoading } = useListAccountStatements(queryParams);

  const handleSearch = () => {
    const params: any = {};
    if (tenantId) params.tenantId = Number(tenantId);
    if (from) params.from = from;
    if (to) params.to = to;
    setQueryParams(params);
  };

  const entries = (statement as any)?.entries ?? [];
  const print = usePrint();
  const isBuilding = !(statement as any)?.tenantName;
  const printStatement = () => print(
    <AccountStatementDoc statement={statement} from={queryParams.from} to={queryParams.to} />,
    { title: isBuilding ? "كشف حساب العمارة" : `كشف حساب: ${(statement as any).tenantName}` },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2"><ScrollText size={28} />كشف الحساب</h1>
          <p className="text-muted-foreground mt-1 text-[12.5px]">عرض حركات الحساب لكل مستأجر</p>
        </div>
        {statement && <PrintExportButton
          prints={[{ label: "طباعة الكشف", onClick: printStatement }]}
          exportSpec={{ filename: "account-statement", headers: ["التاريخ","البيان","مدين","دائن","الرصيد"],
            getRows: () => entries.map((e: any) => [e.date, e.description, e.debit, e.credit, e.balance]) }}
        />}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">فلاتر البحث</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label>المستأجر</Label>
              <Select value={tenantId || "__none__"} onValueChange={v => setTenantId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">الكل</SelectItem>{(tenants as any[]).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>من تاريخ</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1" /></div>
            <div><Label>إلى تاريخ</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1" /></div>
            <Button onClick={handleSearch} className="w-full">بحث</Button>
          </div>
        </CardContent>
      </Card>

      {statement && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30">
            <CardContent className="pt-4"><p className="text-sm text-muted-foreground">إجمالي المقبوضات</p>
              <p className="text-xl font-bold text-emerald-600 ltr-nums">{formatAmount(Number((statement as any).totalCredit), "ILS")}</p></CardContent>
          </Card>
          <Card className="bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30">
            <CardContent className="pt-4"><p className="text-sm text-muted-foreground">إجمالي المدفوعات</p>
              <p className="text-xl font-bold text-rose-600 ltr-nums">{formatAmount(Number((statement as any).totalDebit), "ILS")}</p></CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4"><p className="text-sm text-muted-foreground">الرصيد الختامي</p>
              <p className={`text-xl font-bold ltr-nums ${Number((statement as any).closingBalance) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatAmount(Number((statement as any).closingBalance), "ILS")}</p></CardContent>
          </Card>
        </div>
      )}

      {statement && (
        <Card>
          <CardHeader><CardTitle>{(statement as any).tenantName ? `كشف حساب: ${(statement as any).tenantName}` : "كشف الحساب"}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>البيان</TableHead>
                    <TableHead>مدين</TableHead>
                    <TableHead>دائن</TableHead>
                    <TableHead>الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="ltr-nums text-muted-foreground">{e.id}</TableCell>
                      <TableCell className="ltr-nums">{formatDate(e.date)}</TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell className="text-rose-600 ltr-nums">{e.debit > 0 ? formatAmount(e.debit, "ILS") : "-"}</TableCell>
                      <TableCell className="text-emerald-600 ltr-nums">{e.credit > 0 ? formatAmount(e.credit, "ILS") : "-"}</TableCell>
                      <TableCell className={`font-bold ltr-nums ${e.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatAmount(e.balance, "ILS")}</TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد حركات</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
