import { useState } from "react";
import { useOpenNewSignal } from "@/lib/shortcuts";
import { useListPaymentVouchers, useCreatePaymentVoucher, useUpdatePaymentVoucher, useDeletePaymentVoucher, useGetExchangeRates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExcelExportButton } from "@/components/ExcelExportButton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";
import { usePrint, PrintButton, fmtMoney, fmtDate } from "@/lib/print";
import { PaymentVoucherDoc, ReportTable } from "@/lib/print/documents";
import { formatAmount, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  beneficiaryName: "",
  amount: "",
  currency: "ILS",
  exchangeRate: "1",
  paymentMethod: "cash",
  category: "",
  chequeNumber: "",
  bankName: "",
  chequeDate: "",
  dueDate: "",
  notes: "",
};

const payMethodLabels: Record<string, string> = {
  cash: "نقداً",
  bank_transfer: "حوالة بنكية",
  cheque: "شيك",
  other: "أخرى",
};

const categories = ["رواتب", "صيانة", "خدمات", "ضرائب", "تأمين", "كهرباء", "ماء", "نظافة", "أخرى"];

export default function PaymentVouchers() {
  const { data: vouchers = [], isLoading } = useListPaymentVouchers();
  const { data: rates } = useGetExchangeRates();
  const create = useCreatePaymentVoucher();
  const update = useUpdatePaymentVoucher();
  const del = useDeletePaymentVoucher();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const rateForCurrency = (cur: string) =>
    cur === "USD" ? Number(rates?.usdToILS ?? 3.7) :
    cur === "JOD" ? Number(rates?.jodToILS ?? 5.22) : 1;

  const amountILS = Number(form.amount) * Number(form.exchangeRate);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (v: any) => {
    setEditing(v.id);
    setForm({
      date: v.date,
      beneficiaryName: v.beneficiaryName,
      amount: String(v.amount),
      currency: v.currency,
      exchangeRate: String(v.exchangeRate),
      paymentMethod: v.paymentMethod,
      category: v.category,
      chequeNumber: v.chequeNumber ?? "",
      bankName: v.bankName ?? "",
      chequeDate: v.chequeDate ?? "",
      dueDate: v.dueDate ?? "",
      notes: v.notes ?? "",
    });
    setOpen(true);
  };

  // F-key / header shortcut: open the "add new" dialog (V1.1 §2)
  useOpenNewSignal("/payment-vouchers", openNew);

  const handleSave = async () => {
    const payload = {
      ...form,
      amount: Number(form.amount),
      exchangeRate: Number(form.exchangeRate),
      amountILS,
      chequeNumber: form.chequeNumber || undefined,
      bankName: form.bankName || undefined,
      chequeDate: form.chequeDate || undefined,
      dueDate: form.dueDate || undefined,
      notes: form.notes || undefined,
    } as any;

    try {
      if (editing) {
        await update.mutateAsync({ id: editing, data: payload });
        toast({ title: "تم التحديث" });
      } else {
        await create.mutateAsync({ data: payload });
        toast({ title: "تم إصدار سند الصرف" });
      }
      qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await del.mutateAsync({ id: deleteId });
      qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] });
      toast({ title: "تم حذف السند" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const print = usePrint();
  const printRegister = () => print(
    <ReportTable
      columns={[
        { label: "رقم السند", render: (v: any) => <span className="ltr-nums">{v.voucherNumber}</span> },
        { label: "التاريخ", render: (v: any) => <span className="ltr-nums">{fmtDate(v.date)}</span> },
        { label: "المستفيد", render: (v: any) => v.beneficiaryName },
        { label: "البند", render: (v: any) => v.category },
        { label: "المبلغ (شيكل)", render: (v: any) => <span className="ltr-nums">{fmtMoney(v.amountILS, "ILS")}</span> },
      ]}
      rows={vouchers as any[]}
      footer={<tr><td colSpan={5}>الإجمالي</td><td className="ltr-nums">{fmtMoney((vouchers as any[]).reduce((s, v) => s + Number(v.amountILS), 0), "ILS")}</td></tr>}
    />,
    { title: "سجل سندات الصرف" },
  );

  if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">سندات الصرف</h1>
          <p className="text-muted-foreground mt-1">تسجيل المصروفات والمدفوعات</p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton filename="payment-vouchers" headers={["رقم السند","التاريخ","المستفيد","البند","المبلغ","العملة","المبلغ (شيكل)","طريقة الدفع"]}
            getRows={() => (vouchers as any[]).map((v: any) => [v.voucherNumber, v.date, v.beneficiaryName, v.category, Number(v.amount), v.currency, Number(v.amountILS), v.paymentMethod])} />
          <PrintButton onClick={printRegister} label="طباعة السجل" size="default" />
          <Button onClick={openNew} className="flex items-center gap-2">
            <Plus size={16} />إصدار سند صرف
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم السند</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>المستفيد</TableHead>
                <TableHead>البند</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(vouchers as any[]).map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-sm ltr-nums">{v.voucherNumber}</TableCell>
                  <TableCell className="ltr-nums">{formatDate(v.date)}</TableCell>
                  <TableCell>{v.beneficiaryName}</TableCell>
                  <TableCell><Badge variant="outline">{v.category}</Badge></TableCell>
                  <TableCell>{payMethodLabels[v.paymentMethod] ?? v.paymentMethod}</TableCell>
                  <TableCell className="ltr-nums font-semibold text-rose-600">{formatAmount(v.amountILS, "ILS")}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{v.notes ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" title="طباعة" onClick={() => print(<PaymentVoucherDoc v={v} />, { title: `سند صرف ${v.voucherNumber}`, refNumber: v.voucherNumber })}>
                        <Printer size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(v.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {vouchers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <p className="text-sm">لا توجد سندات صرف حالياً</p>
                      <Button size="sm" variant="outline" onClick={openNew}>
                        <Plus size={14} className="ml-1" />إصدار سند صرف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل سند الصرف" : "إصدار سند صرف جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>التاريخ *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>طريقة الدفع *</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(payMethodLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المستفيد *</Label>
                <Input value={form.beneficiaryName} onChange={e => setForm(f => ({ ...f, beneficiaryName: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>بند الصرف *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر بنداً" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>العملة *</Label>
                <Select value={form.currency} onValueChange={c => setForm(f => ({ ...f, currency: c, exchangeRate: String(rateForCurrency(c)) }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ ILS</SelectItem>
                    <SelectItem value="USD">$ USD</SelectItem>
                    <SelectItem value="JOD">JD JOD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المبلغ *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1 ltr-nums" />
              </div>
              <div>
                <Label>سعر الصرف</Label>
                <Input type="number" step="0.0001" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} className="mt-1 ltr-nums" />
              </div>
            </div>
            {form.currency !== "ILS" && (
              <p className="text-sm text-muted-foreground ltr-nums">المبلغ بالشيقل: {formatAmount(amountILS, "ILS")}</p>
            )}
            {form.paymentMethod === "cheque" && (
              <div className="grid gap-3 p-3 border rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>رقم الشيك</Label><Input value={form.chequeNumber} onChange={e => setForm(f => ({ ...f, chequeNumber: e.target.value }))} className="mt-1 ltr-nums" /></div>
                  <div><Label>البنك</Label><Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} className="mt-1" /></div>
                  <div><Label>تاريخ الشيك</Label><Input type="date" value={form.chequeDate} onChange={e => setForm(f => ({ ...f, chequeDate: e.target.value }))} className="mt-1" /></div>
                  <div><Label>تاريخ الاستحقاق</Label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="mt-1" /></div>
                </div>
              </div>
            )}
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button data-save-btn onClick={handleSave} disabled={create.isPending || update.isPending}>
              {editing ? "حفظ التعديلات" : "إصدار"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا السند؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
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
