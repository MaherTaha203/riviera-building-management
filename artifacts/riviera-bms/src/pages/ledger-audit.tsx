import { useGetAuditTrail, useGetCorrections } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatAmount, formatDate } from "@/lib/format";
import { ShieldCheck } from "lucide-react";

const money = (n: number) => <span className="ltr-nums">{formatAmount(Number(n || 0), "ILS")}</span>;

const SOURCE_AR: Record<string, string> = {
  receipt: "سند قبض", payment: "سند صرف", cheque: "شيك", transfer: "تحويل",
  rent_charge: "استحقاق", adjustment: "تسوية", opening: "افتتاحي", closing: "إقفال",
};

/** Ledger audit: the append-only movement trail and the corrections (reversals) log. */
export default function LedgerAudit() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2"><ShieldCheck size={26} /> تدقيق دفتر الأستاذ</h1>
        <p className="text-muted-foreground mt-1 text-[12.5px]">سجل الحركات (append-only) وسجل التصحيحات (العكوسات)</p>
      </div>
      <Tabs defaultValue="trail">
        <TabsList>
          <TabsTrigger value="trail">سجل الحركات</TabsTrigger>
          <TabsTrigger value="corrections">التصحيحات</TabsTrigger>
        </TabsList>
        <TabsContent value="trail" className="mt-4"><TrailTab /></TabsContent>
        <TabsContent value="corrections" className="mt-4"><CorrectionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function TrailTab() {
  const { data = [], isLoading } = useGetAuditTrail({ limit: 300 });
  const rows = data as any[];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">آخر الحركات</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead><TableHead>التاريخ</TableHead><TableHead>الحساب</TableHead><TableHead>المصدر</TableHead>
                <TableHead className="text-end">مدين</TableHead><TableHead className="text-end">دائن</TableHead><TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">جارٍ التحميل…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا حركات</TableCell></TableRow>
              ) : rows.map((m) => (
                <TableRow key={m.id} className={m.reversesId ? "opacity-70" : ""}>
                  <TableCell className="ltr-nums text-muted-foreground">{m.id}</TableCell>
                  <TableCell className="ltr-nums">{formatDate(m.txnDate)}</TableCell>
                  <TableCell>{m.code ? <span className="ltr-nums text-muted-foreground">{m.code} </span> : null}{m.accountName ?? `#${m.accountId}`}</TableCell>
                  <TableCell><span className="text-xs">{SOURCE_AR[m.sourceType] ?? m.sourceType}{m.sourceId ? ` #${m.sourceId}` : ""}</span></TableCell>
                  <TableCell className="text-end">{m.direction === "credit" ? money(m.amountILS) : "—"}</TableCell>
                  <TableCell className="text-end">{m.direction === "debit" ? money(m.amountILS) : "—"}</TableCell>
                  <TableCell>{m.reversesId ? <Badge variant="secondary">عكس #{m.reversesId}</Badge> : <Badge variant="outline">مُرحَّل</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CorrectionsTab() {
  const { data = [], isLoading } = useGetCorrections({ limit: 300 });
  const rows = data as any[];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">سجل التصحيحات (العكوسات)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>العكس #</TableHead><TableHead>الأصل #</TableHead><TableHead>التاريخ</TableHead><TableHead>الحساب</TableHead>
                <TableHead className="text-end">المبلغ</TableHead><TableHead>السبب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">جارٍ التحميل…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا تصحيحات</TableCell></TableRow>
              ) : rows.map((c) => (
                <TableRow key={c.reversalId}>
                  <TableCell className="ltr-nums">{c.reversalId}</TableCell>
                  <TableCell className="ltr-nums text-muted-foreground">{c.originalId}</TableCell>
                  <TableCell className="ltr-nums">{formatDate(c.txnDate)}</TableCell>
                  <TableCell>{c.accountName ?? `#${c.accountId}`}</TableCell>
                  <TableCell className="text-end">{money(c.amountILS)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
