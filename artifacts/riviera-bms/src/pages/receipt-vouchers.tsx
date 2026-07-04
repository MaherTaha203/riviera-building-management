import { useMemo, useState } from "react";
import { useOpenNewSignal } from "@/lib/shortcuts";
import { useListReceiptVouchers, useCreateReceiptVoucher, useUpdateReceiptVoucher, useDeleteReceiptVoucher, useListTenants, useListContracts, useGetExchangeRates } from "@workspace/api-client-react";
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
import { FilterBar } from "@/components/FilterBar";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Receipt, Printer } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { usePrint, PrintButton, fmtMoney, fmtDate } from "@/lib/print";
import { ReceiptVoucherDoc, ReportTable } from "@/lib/print/documents";

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  payerName: "",
  tenantId: "",
  contractId: "",
  amount: "",
  currency: "ILS",
  exchangeRate: "1",
  paymentMethod: "cash",
  chequeNumber: "",
  bankName: "",
  chequeDate: "",
  dueDate: "",
  accountHolderName: "",
  notes: "",
};

const payMethodLabels: Record<string, string> = {
  cash: "نقداً",
  bank_transfer: "حوالة بنكية",
  cheque: "شيك",
  other: "أخرى",
};

export default function ReceiptVouchers() {
  const { data: vouchers = [], isLoading } = useListReceiptVouchers();
  const { data: tenants = [] } = useListTenants();
  const { data: contracts = [] } = useListContracts();
  const { data: rates } = useGetExchangeRates();
  const create = useCreateReceiptVoucher();
  const update = useUpdateReceiptVoucher();
  const del = useDeleteReceiptVoucher();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Advanced combinable filters (V1.1 §8) — client-side over the loaded list.
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fMethod, setFMethod] = useState("all");
  const [fCurrency, setFCurrency] = useState("all");
  const [fTenant, setFTenant] = useState("all");
  const resetFilters = () => { setFFrom(""); setFTo(""); setFMethod("all"); setFCurrency("all"); setFTenant("all"); };
  const filtered = useMemo(() => (vouchers as any[]).filter((v: any) => {
    if (fFrom && v.date < fFrom) return false;
    if (fTo && v.date > fTo) return false;
    if (fMethod !== "all" && v.paymentMethod !== fMethod) return false;
    if (fCurrency !== "all" && v.currency !== fCurrency) return false;
    if (fTenant !== "all" && String(v.tenantId) !== fTenant) return false;
    return true;
  }), [vouchers, fFrom, fTo, fMethod, fCurrency, fTenant]);

  const rateForCurrency = (cur: string) =>
    cur === "USD" ? Number(rates?.usdToILS ?? 3.7) :
    cur === "JOD" ? Number(rates?.jodToILS ?? 5.22) : 1;

  const amountILS = Number(form.amount) * Number(form.exchangeRate);
  const onCurrencyChange = (c: string) => setForm(f => ({ ...f, currency: c, exchangeRate: String(rateForCurrency(c)) }));

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (v: any) => {
    setEditing(v.id);
    setForm({
      date: v.date,
      payerName: v.payerName,
      tenantId: v.tenantId ? String(v.tenantId) : "",
      contractId: v.contractId ? String(v.contractId) : "",
      amount: String(v.amount),
      currency: v.currency,
      exchangeRate: String(v.exchangeRate),
      paymentMethod: v.paymentMethod,
      chequeNumber: v.chequeNumber ?? "",
      bankName: v.bankName ?? "",
      chequeDate: v.chequeDate ?? "",
      dueDate: v.dueDate ?? "",
      accountHolderName: v.accountHolderName ?? "",
      notes: v.notes ?? "",
    });
    setOpen(true);
  };

  // F-key / header shortcut: open the "add new" dialog (V1.1 §2)
  useOpenNewSignal("/receipt-vouchers", openNew);

  const handleSave = async () => {
    const payload = {
      ...form,
      tenantId: form.tenantId ? Number(form.tenantId) : undefined,
      contractId: form.contractId ? Number(form.contractId) : undefined,
      amount: Number(form.amount),
      exchangeRate: Number(form.exchangeRate),
      amountILS,
      chequeNumber: form.chequeNumber || undefined,
      bankName: form.bankName || undefined,
      chequeDate: form.chequeDate || undefined,
      dueDate: form.dueDate || undefined,
      accountHolderName: form.accountHolderName || undefined,
      notes: form.notes || undefined,
    } as any;

    try {
      if (editing) {
        await update.mutateAsync({ id: editing, data: payload });
        toast({ title: "تم التحديث" });
      } else {
        await create.mutateAsync({ data: payload });
        toast({ title: "تم إصدار السند" });
      }
      qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/tenants"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await del.mutateAsync({ id: deleteId });
      qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "تم حذف السند" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const tenantContracts = form.tenantId
    ? (contracts as any[]).filter((c: any) => String(c.tenantId) === form.tenantId)
    : [];

  const print = usePrint();
  const printRegister = () => print(
    <ReportTable
      columns={[
        { label: "رقم السند", render: (v: any) => <span className="ltr-nums">{v.voucherNumber}</span> },
        { label: "التاريخ", render: (v: any) => <span className="ltr-nums">{fmtDate(v.date)}</span> },
        { label: "الدافع", render: (v: any) => v.payerName },
        { label: "المبلغ (شيكل)", render: (v: any) => <span className="ltr-nums">{fmtMoney(v.amountILS, "ILS")}</span> },
      ]}
      rows={filtered}
      footer={<tr><td colSpan={4}>الإجمالي</td><td className="ltr-nums">{fmtMoney(filtered.reduce((s, v) => s + Number(v.amountILS), 0), "ILS")}</td></tr>}
    />,
    { title: "سجل سندات القبض" },
  );

  if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">سندات القبض</h1>
          <p className="text-muted-foreground mt-1">تسجيل المبالغ المقبوضة</p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton filename="receipt-vouchers" headers={["رقم السند","التاريخ","المستلم من","المستأجر","المبلغ","العملة","المبلغ (شيكل)","طريقة الدفع"]}
            getRows={() => filtered.map((v: any) => [v.voucherNumber, v.date, v.payerName, v.tenantName ?? "", Number(v.amount), v.currency, Number(v.amountILS), v.paymentMethod])} />
          <PrintButton onClick={printRegister} label="طباعة السجل" size="default" />
          <Button onClick={openNew} className="flex items-center gap-2">
            <Plus size={16} />إصدار سند قبض
          </Button>
        </div>
      </div>

      <FilterBar
        from={fFrom} to={fTo} onFrom={setFFrom} onTo={setFTo}
        selects={[
          { key: "method", label: "طريقة الدفع", value: fMethod, onChange: setFMethod,
            options: [{ value: "all", label: "الكل" }, { value: "cash", label: "نقداً" }, { value: "bank_transfer", label: "حوالة بنكية" }, { value: "cheque", label: "شيك" }] },
          { key: "currency", label: "العملة", value: fCurrency, onChange: setFCurrency,
            options: [{ value: "all", label: "الكل" }, { value: "ILS", label: "ILS" }, { value: "USD", label: "USD" }, { value: "JOD", label: "JOD" }] },
          { key: "tenant", label: "المستأجر", value: fTenant, onChange: setFTenant,
            options: [{ value: "all", label: "الكل" }, ...(tenants as any[]).map((t: any) => ({ value: String(t.id), label: t.name }))] },
        ]}
        onReset={resetFilters}
        resultCount={filtered.length}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم السند</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>الدافع</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-sm ltr-nums">{v.voucherNumber}</TableCell>
                  <TableCell className="ltr-nums">{formatDate(v.date)}</TableCell>
                  <TableCell>{v.payerName}{v.tenantName ? ` (${v.tenantName})` : ""}</TableCell>
                  <TableCell><Badge variant="outline">{payMethodLabels[v.paymentMethod] ?? v.paymentMethod}</Badge></TableCell>
                  <TableCell className="ltr-nums font-semibold text-emerald-600">{formatAmount(v.amountILS, "ILS")}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{v.notes ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" title="طباعة" onClick={() => print(<ReceiptVoucherDoc v={v} />, { title: `سند قبض ${v.voucherNumber}`, refNumber: v.voucherNumber })}>
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
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <p className="text-sm">لا توجد سندات قبض حالياً</p>
                      <Button size="sm" variant="outline" onClick={openNew}>
                        <Plus size={14} className="ml-1" />إصدار سند قبض
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
            <DialogTitle>
              <Receipt className="inline ml-2" size={18} />
              {editing ? "تعديل سند القبض" : "إصدار سند قبض جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>التاريخ *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
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
            <div><Label>اسم الدافع *</Label><Input value={form.payerName} onChange={e => setForm(f => ({ ...f, payerName: e.target.value }))} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المستأجر</Label>
                <Select value={form.tenantId || "__none__"} onValueChange={v => setForm(f => ({ ...f, tenantId: v === "__none__" ? "" : v, contractId: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر مستأجراً" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون</SelectItem>
                    {(tenants as any[]).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>العقد</Label>
                <Select value={form.contractId || "__none__"} onValueChange={v => setForm(f => ({ ...f, contractId: v === "__none__" ? "" : v }))} disabled={!form.tenantId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر عقداً" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون</SelectItem>
                    {tenantContracts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.contractNumber}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
              <div><Label>المبلغ *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1 ltr-nums" /></div>
              <div><Label>سعر الصرف</Label><Input type="number" step="0.0001" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} className="mt-1 ltr-nums" /></div>
            </div>
            {form.currency !== "ILS" && (
              <p className="text-sm text-muted-foreground ltr-nums">المبلغ بالشيقل: {formatAmount(amountILS, "ILS")}</p>
            )}
            {form.paymentMethod === "cheque" && (
              <div className="grid gap-3 p-3 border rounded-lg">
                <p className="text-sm font-medium">بيانات الشيك</p>
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
              {editing ? "حفظ التعديلات" : "إصدار السند"}
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
