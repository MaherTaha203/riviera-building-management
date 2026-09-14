import { useState } from "react";
import { useListFinancialPeriods, useCreateFinancialPeriod, useCloseFinancialPeriod, useReopenFinancialPeriod } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { invalidateFinancial } from "@/lib/invalidate";
import { useToast } from "@/hooks/use-toast";
import { Plus, Lock, LockOpen } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = { label: "", startDate: "", endDate: "" };

export default function FinancialPeriods() {
  const { data: periods = [], isLoading } = useListFinancialPeriods();
  const create = useCreateFinancialPeriod();
  const close = useCloseFinancialPeriod();
  const reopen = useReopenFinancialPeriod();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [closeId, setCloseId] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!form.label.trim() || !form.startDate || !form.endDate) { toast({ title: "أكمل الحقول المطلوبة", variant: "destructive" }); return; }
    if (form.startDate > form.endDate) { toast({ title: "تاريخ البداية بعد النهاية", variant: "destructive" }); return; }
    try {
      await create.mutateAsync({ data: { label: form.label.trim(), startDate: form.startDate, endDate: form.endDate } as any });
      invalidateFinancial(qc);
      toast({ title: "تم إنشاء الفترة" });
      setOpen(false); setForm({ ...emptyForm });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const doClose = async () => {
    if (closeId == null) return;
    try { await close.mutateAsync({ id: closeId }); invalidateFinancial(qc); toast({ title: "تم إقفال الفترة" }); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setCloseId(null); }
  };

  const doReopen = async (id: number) => {
    try { await reopen.mutateAsync({ id }); invalidateFinancial(qc); toast({ title: "تمت إعادة فتح الفترة" }); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const rows = periods as any[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الفترات المالية</h1>
          <p className="text-muted-foreground text-sm">إقفال الفترات يمنع تسجيل أو تعديل أي حركة بتاريخها</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="ms-1 h-4 w-4" /> فترة جديدة</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفترة</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">جارٍ التحميل…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا فترات معرّفة</TableCell></TableRow>
                ) : rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.label}</TableCell>
                    <TableCell>{formatDate(p.startDate)}</TableCell>
                    <TableCell>{formatDate(p.endDate)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "closed" ? "destructive" : "default"}>{p.status === "closed" ? "مقفلة" : "مفتوحة"}</Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {p.status === "closed" ? (
                        <Button variant="ghost" size="sm" onClick={() => doReopen(p.id)}><LockOpen className="ms-1 h-4 w-4" /> إعادة فتح</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setCloseId(p.id)}><Lock className="ms-1 h-4 w-4" /> إقفال</Button>
                      )}
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
          <DialogHeader><DialogTitle>فترة مالية جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الاسم</Label>
              <Input className="mt-1" placeholder="مثال: سبتمبر 2026" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>من تاريخ</Label><SmartDateInput className="mt-1" value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} /></div>
              <div><Label>إلى تاريخ</Label><SmartDateInput className="mt-1" value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={create.isPending}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={closeId != null} onOpenChange={(o) => !o && setCloseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إقفال الفترة</AlertDialogTitle>
            <AlertDialogDescription>بعد الإقفال لا يمكن تسجيل أو تعديل أي حركة بتاريخٍ ضمن الفترة حتى إعادة فتحها.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={doClose}>إقفال</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
