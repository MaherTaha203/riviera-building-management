import { useState } from "react";
import { PrintExportButton } from "@/components/PrintExportButton";
import { useListBankAccounts, useCreateBankAccount, useUpdateBankAccount, useDeleteBankAccount } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Landmark } from "lucide-react";
import { usePrint, PrintButton, fmtMoney } from "@/lib/print";
import { ReportTable } from "@/lib/print/documents";
import { formatAmount } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = { bankName: "", accountNumber: "", accountName: "", currency: "ILS", notes: "" };

export default function BankAccounts() {
  const { data: accounts = [], isLoading } = useListBankAccounts();
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const del = useDeleteBankAccount();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (a: any) => {
    setEditing(a.id);
    setForm({ bankName: a.bankName, accountNumber: a.accountNumber, accountName: a.accountName, currency: a.currency, notes: a.notes ?? "" });
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing, data: form as any });
        toast({ title: "تم التحديث" });
      } else {
        await create.mutateAsync({ data: form as any });
        toast({ title: "تمت الإضافة" });
      }
      qc.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setOpen(false);
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا الحساب؟")) return;
    try {
      await del.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      toast({ title: "تم الحذف" });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const totalBalance = (accounts as any[]).reduce((s: number, a: any) => s + a.balanceILS, 0);

  const print = usePrint();
  const printList = () => print(
    <ReportTable
      columns={[
        { label: "البنك", render: (b: any) => b.bankName },
        { label: "رقم الحساب", render: (b: any) => <span className="ltr-nums">{b.accountNumber}</span> },
        { label: "اسم الحساب", render: (b: any) => b.accountName },
        { label: "الرصيد (شيكل)", render: (b: any) => <span className="ltr-nums">{fmtMoney(b.balanceILS, "ILS")}</span> },
      ]}
      rows={accounts as any[]}
      footer={<tr><td colSpan={4}>إجمالي الأرصدة: {fmtMoney((accounts as any[]).reduce((s, b) => s + Number(b.balanceILS), 0), "ILS")}</td></tr>}
    />,
    { title: "تقرير الحسابات البنكية" },
  );

  if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold tracking-tight">الحسابات البنكية</h1><p className="text-muted-foreground mt-1 text-[12.5px]">إدارة الحسابات المصرفية</p></div>
        <div className="flex items-center gap-2">
          <PrintExportButton
            prints={[{ label: "طباعة التقرير", onClick: printList }]}
            exportSpec={{ filename: "bank-accounts", headers: ["اسم الحساب","البنك","رقم الحساب","العملة","الرصيد (شيكل)"],
              getRows: () => (accounts as any[]).map((a: any) => [a.accountName, a.bankName, a.accountNumber, a.currency, Number(a.balanceILS)]) }}
          />
          <Button onClick={openNew} className="flex items-center gap-2"><Plus size={16} />إضافة حساب</Button>
        </div>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">إجمالي الأرصدة البنكية</p>
          <p className="text-3xl font-bold text-primary ltr-nums mt-1">{formatAmount(totalBalance, "ILS")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(accounts as any[]).map((a: any) => (
          <Card key={a.id} className="transition-colors hover:border-[hsl(214,32%,84%)]">
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-md text-primary"><Landmark size={18} /></div>
                <div>
                  <CardTitle className="text-base">{a.bankName}</CardTitle>
                  <p className="text-xs text-muted-foreground ltr-nums">{a.accountNumber}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{a.accountName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{a.currency}</p>
              <p className="text-xl font-bold text-emerald-600 ltr-nums mt-2">{formatAmount(a.balanceILS, "ILS")}</p>
              {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => openEdit(a)} className="flex-1"><Pencil size={14} className="ml-1" />تعديل</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(a.id)}><Trash2 size={14} /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && <div className="col-span-3 text-center py-12 text-muted-foreground">لا توجد حسابات بنكية</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>{editing ? "تعديل حساب" : "إضافة حساب بنكي"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>اسم البنك *</Label><Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} className="mt-1" /></div>
              <div><Label>رقم الحساب *</Label><Input value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} className="mt-1 ltr-nums" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>اسم الحساب *</Label><Input value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>العملة *</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ILS">₪ ILS</SelectItem><SelectItem value="USD">$ USD</SelectItem><SelectItem value="JOD">JD JOD</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>{editing ? "حفظ" : "إضافة"}</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
