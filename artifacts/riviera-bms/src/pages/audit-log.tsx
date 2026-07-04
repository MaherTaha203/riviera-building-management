import { useState } from "react";
import { PrintExportButton } from "@/components/PrintExportButton";
import { useListAuditLog } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { formatDate } from "@/lib/format";

const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CREATE: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

const actionLabels: Record<string, string> = { CREATE: "إنشاء", UPDATE: "تعديل", DELETE: "حذف" };

const entityLabels: Record<string, string> = {
  unit: "وحدة", tenant: "مستأجر", contract: "عقد", receipt_voucher: "سند قبض",
  payment_voucher: "سند صرف", bank_account: "حساب بنكي", cheque: "شيك",
  document: "مستند", user: "مستخدم", settings: "إعدادات", exchange_rates: "أسعار صرف",
};

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListAuditLog({ page, limit: 50 });
  const result = data as any;
  const entries = result?.entries ?? [];
  const total = result?.total ?? 0;
  const pageCount = Math.ceil(total / 50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">سجل التدقيق</h1>
          <p className="text-muted-foreground mt-1">تتبع جميع العمليات المنجزة في النظام</p>
        </div>
        <PrintExportButton
          exportSpec={{ filename: "audit-log", headers: ["التاريخ","المستخدم","العملية","الكيان","المعرف","تفاصيل"],
            getRows: () => (entries as any[]).map((e: any) => [e.createdAt, e.userName ?? "", e.action, e.entityType, e.entityId ?? "", e.details ?? ""]) }}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>الإجراء</TableHead>
                  <TableHead>الكيان</TableHead>
                  <TableHead>الرقم</TableHead>
                  <TableHead>التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="ltr-nums text-sm text-muted-foreground">{formatDate(e.createdAt)} {new Date(e.createdAt).toLocaleTimeString("en-US", { hour12: false })}</TableCell>
                    <TableCell className="font-medium">{e.userName}</TableCell>
                    <TableCell><Badge variant={actionColors[e.action] ?? "outline"}>{actionLabels[e.action] ?? e.action}</Badge></TableCell>
                    <TableCell>{entityLabels[e.entityType] ?? e.entityType}</TableCell>
                    <TableCell className="ltr-nums text-muted-foreground">{e.entityId ?? "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.details ?? "-"}</TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد سجلات</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronRight size={16} /></Button>
          <span className="text-sm text-muted-foreground ltr-nums">صفحة {page} من {pageCount}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount}><ChevronLeft size={16} /></Button>
        </div>
      )}
    </div>
  );
}
