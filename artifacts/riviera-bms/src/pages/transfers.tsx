import { useState } from "react";
import { useListTransfers, useCreateTransfer, useDeleteTransfer, useListLedgerAccounts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invalidateFinancial } from "@/lib/invalidate";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = { fromAccountId: "", toAccountId: "", amount: "", txnDate: new Date().toISOString().split("T")[0], reference: "" };

export default function Transfers() {
  const { data: transfers = [], isLoading } = useListTransfers();
  const { data: accounts = [] } = useListLedgerAccounts();
  const create = useCreateTransfer();
  const del = useDeleteTransfer();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const accountOptions = (accounts as any[]).map((a) => ({
    value: String(a.id),
    label: `${a.name} (${a.kind === "cash" ? "صندوق" : "بنك"}) — ${formatAmount(Number(a.balanceILS))}`,
  }));

  const handleSave = async () => {
    if (!form.fromAccountId || !form.toAccountId) { toast({ title: "اختر الحسابين", variant: "destructive" }); return; }
    if (form.fromAccountId === form.toAccountId) { toast({ title: "لا يمكن التحويل إلى نفس الحساب", variant: "destructive" }); return; }
    if (!(Number(form.amount) > 0)) { toast({ title: "أدخل مبلغاً أكبر من صفر", variant: "destructive" }); return; }
    try {
      await create.mutateAsync({ data: {
        fromAccountId: Number(form.fromAccountId), toAccountId: Number(form.toAccountId),
        amountILS: Number(form.amount), txnDate: form.txnDate, reference: form.reference || null,
      } as any });
      invalidateFinancial(qc);
      toast({ title: "تم تسجيل التحويل" });
      setOpen(false);
      setForm({ ...emptyForm });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await del.mutateAsync({ id: deleteId });
      invalidateFinancial(qc);
      toast({ title: "تم حذف التحويل" });
    } catch (e: any) { toast({ title: "تعذّر الحذف", description: e.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const rows = transfers as any[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">التحويلات بين الحسابات</h1>
          <p className="text-muted-foreground text-sm">نقل الأموال بين الصندوق والحسابات البنكية</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="ms-1 h-4 w-4" /> تحويل جديد</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>مرجع</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">جارٍ التحميل…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا تحويلات بعد</TableCell></TableRow>
                ) : rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{formatDate(t.txnDate)}</TableCell>
                    <TableCell>{t.fromAccountName ?? `#${t.fromAccountId}`}</TableCell>
                    <TableCell className="flex items-center gap-1"><ArrowLeftRight className="h-3 w-3 text-muted-foreground" />{t.toAccountName ?? `#${t.toAccountId}`}</TableCell>
                    <TableCell className="font-medium ltr-nums">{formatAmount(Number(t.amountILS))}</TableCell>
                    <TableCell className="text-muted-foreground">{t.reference ?? ""}</TableCell>
                    <TableCell className="text-end">
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(t.id)} aria-label="حذف"><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تحويل بين الحسابات</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>من حساب</Label>
              <SearchableSelect className="mt-1" value={form.fromAccountId} onChange={(v) => setForm((f) => ({ ...f, fromAccountId: v }))} options={accountOptions} placeholder="اختر الحساب المصدر" />
            </div>
            <div>
              <Label>إلى حساب</Label>
              <SearchableSelect className="mt-1" value={form.toAccountId} onChange={(v) => setForm((f) => ({ ...f, toAccountId: v }))} options={accountOptions} placeholder="اختر الحساب الوجهة" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المبلغ (شيكل)</Label>
                <Input className="mt-1 ltr-nums" type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label>التاريخ</Label>
                <SmartDateInput className="mt-1" value={form.txnDate} onChange={(v) => setForm((f) => ({ ...f, txnDate: v }))} />
              </div>
            </div>
            <div>
              <Label>مرجع (اختياري)</Label>
              <Input className="mt-1" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={create.isPending}>تحويل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التحويل</AlertDialogTitle>
            <AlertDialogDescription>سيُعكس أثر التحويل على أرصدة الحسابات. لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
