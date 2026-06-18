import { useState } from "react";
import { useListContracts, useCreateContract, useUpdateContract, useDeleteContract, useListTenants, useListUnits, useGetExchangeRates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "نشط", variant: "default" },
  expired: { label: "منتهي", variant: "secondary" },
  terminated: { label: "ملغى", variant: "destructive" },
};

const empty = { tenantId: "", unitId: "", startDate: "", endDate: "", rentAmount: "", currency: "ILS", exchangeRate: "1", paymentFrequency: "monthly", notes: "" };

export default function Contracts() {
  const { data: contracts = [], isLoading } = useListContracts();
  const { data: tenants = [] } = useListTenants();
  const { data: units = [] } = useListUnits();
  const { data: rates } = useGetExchangeRates();
  const create = useCreateContract();
  const update = useUpdateContract();
  const del = useDeleteContract();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...empty });

  const rateForCurrency = (cur: string) =>
    cur === "USD" ? Number(rates?.usdToILS ?? 3.7) :
    cur === "JOD" ? Number(rates?.jodToILS ?? 5.22) : 1;

  const onCurrencyChange = (c: string) => {
    const r = rateForCurrency(c);
    setForm(f => ({ ...f, currency: c, exchangeRate: String(r) }));
  };

  const amountILS = Number(form.rentAmount) * Number(form.exchangeRate);

  const openNew = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const openEdit = (c: any) => {
    setEditing(c.id);
    setForm({
      tenantId: String(c.tenantId), unitId: String(c.unitId),
      startDate: c.startDate, endDate: c.endDate,
      rentAmount: String(c.rentAmount), currency: c.currency,
      exchangeRate: String(c.exchangeRate), paymentFrequency: c.paymentFrequency,
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      tenantId: Number(form.tenantId),
      unitId: Number(form.unitId),
      rentAmount: Number(form.rentAmount),
      exchangeRate: Number(form.exchangeRate),
      rentAmountILS: amountILS,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing, data: payload as any });
        toast({ title: "تم التحديث" });
      } else {
        await create.mutateAsync({ data: payload as any });
        toast({ title: "تمت الإضافة" });
      }
      qc.invalidateQueries({ queryKey: ["/api/contracts"] });
      qc.invalidateQueries({ queryKey: ["/api/units"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await del.mutateAsync({ id: deleteId });
      qc.invalidateQueries({ queryKey: ["/api/contracts"] });
      qc.invalidateQueries({ queryKey: ["/api/units"] });
      toast({ title: "تم الحذف" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">العقود</h1><p className="text-muted-foreground mt-1">إدارة عقود الإيجار</p></div>
        <Button onClick={openNew} className="flex items-center gap-2"><Plus size={16} />إضافة عقد</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {(contracts as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="p-4 bg-muted rounded-full"><FileText size={32} className="text-muted-foreground" /></div>
              <div className="text-center">
                <p className="font-medium">لا توجد عقود حالياً</p>
                <p className="text-sm text-muted-foreground mt-1">ابدأ بإضافة عقود الإيجار</p>
              </div>
              <Button onClick={openNew} className="flex items-center gap-2">
                <Plus size={16} />إضافة عقد
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم العقد</TableHead>
                  <TableHead>المستأجر</TableHead>
                  <TableHead>الوحدة</TableHead>
                  <TableHead>تاريخ البداية</TableHead>
                  <TableHead>تاريخ الانتهاء</TableHead>
                  <TableHead>الإيجار</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contracts as any[]).map((c: any) => {
                  const st = statusLabels[c.status] ?? { label: c.status, variant: "outline" as const };
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm ltr-nums">{c.contractNumber}</TableCell>
                      <TableCell>{c.tenantName}</TableCell>
                      <TableCell className="ltr-nums">{c.unitNumber}</TableCell>
                      <TableCell className="ltr-nums">{formatDate(c.startDate)}</TableCell>
                      <TableCell className="ltr-nums">{formatDate(c.endDate)}</TableCell>
                      <TableCell className="ltr-nums">{formatAmount(Number(c.rentAmountILS), "ILS")}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>{editing ? "تعديل عقد" : "إضافة عقد جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المستأجر *</Label>
                <Select value={form.tenantId} onValueChange={v => setForm(f => ({ ...f, tenantId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر مستأجراً" /></SelectTrigger>
                  <SelectContent>{(tenants as any[]).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>الوحدة *</Label>
                <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر وحدة" /></SelectTrigger>
                  <SelectContent>
                    {(units as any[]).filter((u: any) => u.status !== "occupied" || String(u.id) === form.unitId).map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>وحدة {u.unitNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تاريخ البداية *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" /></div>
              <div><Label>تاريخ الانتهاء *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>العملة *</Label>
                <Select value={form.currency} onValueChange={onCurrencyChange}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ ILS</SelectItem>
                    <SelectItem value="USD">$ USD</SelectItem>
                    <SelectItem value="JOD">JD JOD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>مبلغ الإيجار *</Label><Input type="number" value={form.rentAmount} onChange={e => setForm(f => ({ ...f, rentAmount: e.target.value }))} className="mt-1 ltr-nums" /></div>
              <div><Label>سعر الصرف</Label><Input type="number" step="0.0001" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} className="mt-1 ltr-nums" /></div>
            </div>
            {form.currency !== "ILS" && (
              <p className="text-sm text-muted-foreground ltr-nums">المبلغ بالشيقل: {formatAmount(amountILS, "ILS")}</p>
            )}
            <div>
              <Label>دورية الدفع</Label>
              <Select value={form.paymentFrequency} onValueChange={v => setForm(f => ({ ...f, paymentFrequency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="quarterly">ربع سنوي</SelectItem>
                  <SelectItem value="annually">سنوي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>{editing ? "حفظ" : "إضافة"}</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا العقد؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">حذف</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
