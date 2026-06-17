import { useState } from "react";
import { useListReceiptVouchers, useCreateReceiptVoucher, useListTenants, useListContracts, useGetExchangeRates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Receipt } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = { date: new Date().toISOString().split("T")[0], payerName: "", tenantId: "", contractId: "", amount: "", currency: "ILS", exchangeRate: "1", paymentMethod: "cash", chequeNumber: "", bankName: "", chequeDate: "", dueDate: "", accountHolderName: "", notes: "" };

const payMethodLabels: Record<string, string> = { cash: "نقداً", bank_transfer: "حوالة بنكية", cheque: "شيك", other: "أخرى" };

export default function ReceiptVouchers() {
  const { data: vouchers = [], isLoading } = useListReceiptVouchers();
  const { data: tenants = [] } = useListTenants();
  const { data: contracts = [] } = useListContracts();
  const { data: rates } = useGetExchangeRates();
  const create = useCreateReceiptVoucher();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const rateForCurrency = (cur: string) => cur === "USD" ? Number(rates?.usdToILS ?? 3.7) : cur === "JOD" ? Number(rates?.jodToILS ?? 5.22) : 1;
  const amountILS = Number(form.amount) * Number(form.exchangeRate);

  const onCurrencyChange = (c: string) => setForm(f => ({ ...f, currency: c, exchangeRate: String(rateForCurrency(c)) }));

  const handleSave = async () => {
    try {
      await create.mutateAsync({
        data: {
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
        } as any
      });
      qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "تم إصدار السند" });
      setOpen(false);
      setForm({ ...emptyForm });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const tenantContracts = form.tenantId ? (contracts as any[]).filter((c: any) => String(c.tenantId) === form.tenantId) : [];

  if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">سندات القبض</h1><p className="text-muted-foreground mt-1">تسجيل المبالغ المقبوضة</p></div>
        <Button onClick={() => { setForm({ ...emptyForm }); setOpen(true); }} className="flex items-center gap-2"><Plus size={16} />إصدار سند قبض</Button>
      </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {(vouchers as any[]).map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-sm ltr-nums">{v.voucherNumber}</TableCell>
                  <TableCell className="ltr-nums">{formatDate(v.date)}</TableCell>
                  <TableCell>{v.payerName}{v.tenantName ? ` (${v.tenantName})` : ""}</TableCell>
                  <TableCell><Badge variant="outline">{payMethodLabels[v.paymentMethod] ?? v.paymentMethod}</Badge></TableCell>
                  <TableCell className="ltr-nums font-semibold text-emerald-600">{formatAmount(v.amountILS, "ILS")}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{v.notes ?? "-"}</TableCell>
                </TableRow>
              ))}
              {vouchers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد سندات</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle><Receipt className="inline ml-2" size={18} />إصدار سند قبض جديد</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>التاريخ *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>طريقة الدفع *</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(payMethodLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>اسم الدافع *</Label><Input value={form.payerName} onChange={e => setForm(f => ({ ...f, payerName: e.target.value }))} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المستأجر</Label>
                <Select value={form.tenantId || "__none__"} onValueChange={v => setForm(f => ({ ...f, tenantId: v === "__none__" ? "" : v, contractId: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر مستأجراً" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">بدون</SelectItem>{(tenants as any[]).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>العقد</Label>
                <Select value={form.contractId || "__none__"} onValueChange={v => setForm(f => ({ ...f, contractId: v === "__none__" ? "" : v }))} disabled={!form.tenantId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر عقداً" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">بدون</SelectItem>{tenantContracts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.contractNumber}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>العملة *</Label>
                <Select value={form.currency} onValueChange={onCurrencyChange}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ILS">₪ ILS</SelectItem><SelectItem value="USD">$ USD</SelectItem><SelectItem value="JOD">JD JOD</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>المبلغ *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1 ltr-nums" /></div>
              <div><Label>سعر الصرف</Label><Input type="number" step="0.0001" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} className="mt-1 ltr-nums" /></div>
            </div>
            {form.currency !== "ILS" && <p className="text-sm text-muted-foreground ltr-nums">المبلغ بالشيقل: {formatAmount(amountILS, "ILS")}</p>}
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
            <Button onClick={handleSave} disabled={create.isPending}>إصدار السند</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
