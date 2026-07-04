import { useState } from "react";
import { useListCheques, useCreateCheque, useUpdateCheque, useListTenants, useGetExchangeRates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExcelExportButton } from "@/components/ExcelExportButton";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { usePrint, PrintButton, fmtMoney, fmtDate } from "@/lib/print";
import { ReportTable } from "@/lib/print/documents";
import { formatAmount, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  deposited: "secondary",
  cleared: "default",
  bounced: "destructive",
  cancelled: "outline",
};
const statusLabels: Record<string, string> = { pending: "معلق", deposited: "مودع", cleared: "محصل", bounced: "مرتجع", cancelled: "ملغى" };
const typeLabels: Record<string, string> = { incoming: "وارد", outgoing: "صادر" };

const emptyForm = { chequeNumber: "", type: "incoming", amount: "", currency: "ILS", exchangeRate: "1", bankName: "", chequeDate: new Date().toISOString().split("T")[0], dueDate: new Date().toISOString().split("T")[0], drawerName: "", tenantId: "", notes: "" };

export default function Cheques() {
  const [typeFilter, setTypeFilter] = useState("all");
  const { data: cheques = [], isLoading } = useListCheques(typeFilter !== "all" ? { type: typeFilter as any } : undefined);
  const { data: tenants = [] } = useListTenants();
  const { data: rates } = useGetExchangeRates();
  const create = useCreateCheque();
  const update = useUpdateCheque();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const rateForCurrency = (cur: string) => cur === "USD" ? Number(rates?.usdToILS ?? 3.7) : cur === "JOD" ? Number(rates?.jodToILS ?? 5.22) : 1;
  const amountILS = Number(form.amount) * Number(form.exchangeRate);

  const handleSave = async () => {
    try {
      await create.mutateAsync({
        data: {
          ...form,
          amount: Number(form.amount),
          exchangeRate: Number(form.exchangeRate),
          amountILS,
          tenantId: form.tenantId ? Number(form.tenantId) : undefined,
          notes: form.notes || undefined,
        } as any
      });
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      toast({ title: "تمت إضافة الشيك" });
      setOpen(false);
      setForm({ ...emptyForm });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const changeStatus = async (id: number, status: string) => {
    try {
      await update.mutateAsync({ id, data: { status } as any });
      qc.invalidateQueries({ queryKey: ["/api/cheques"] });
      toast({ title: "تم تحديث الحالة" });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const print = usePrint();
  const printList = () => print(
    <ReportTable
      columns={[
        { label: "رقم الشيك", render: (c: any) => <span className="ltr-nums">{c.chequeNumber}</span> },
        { label: "النوع", render: (c: any) => typeLabels[c.type] ?? c.type },
        { label: "البنك", render: (c: any) => c.bankName },
        { label: "الاستحقاق", render: (c: any) => <span className="ltr-nums">{fmtDate(c.dueDate)}</span> },
        { label: "المبلغ (شيكل)", render: (c: any) => <span className="ltr-nums">{fmtMoney(c.amountILS, "ILS")}</span> },
        { label: "الحالة", render: (c: any) => statusLabels[c.status] ?? c.status },
      ]}
      rows={cheques as any[]}
    />,
    { title: "قائمة الشيكات" },
  );

  if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">الشيكات</h1><p className="text-muted-foreground mt-1">إدارة الشيكات الواردة والصادرة</p></div>
        <div className="flex items-center gap-2">
          <ExcelExportButton filename="cheques" headers={["رقم الشيك","النوع","الساحب","البنك","تاريخ الاستحقاق","المبلغ (شيكل)","الحالة"]}
            getRows={() => (cheques as any[]).map((c: any) => [c.chequeNumber, c.type, c.drawerName, c.bankName, c.dueDate, Number(c.amountILS), c.status])} />
          <PrintButton onClick={printList} label="طباعة القائمة" size="default" />
          <Button onClick={() => { setForm({ ...emptyForm }); setOpen(true); }} className="flex items-center gap-2"><Plus size={16} />إضافة شيك</Button>
        </div>
      </div>

      <div className="flex gap-2">
        {["all", "incoming", "outgoing"].map(t => (
          <Button key={t} variant={typeFilter === t ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(t)}>
            {t === "all" ? "الكل" : typeLabels[t]}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الشيك</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المسحوب عليه/المستفيد</TableHead>
                <TableHead>البنك</TableHead>
                <TableHead>تاريخ الاستحقاق</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cheques as any[]).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono ltr-nums text-sm">{c.chequeNumber}</TableCell>
                  <TableCell><Badge variant={c.type === "incoming" ? "default" : "outline"}>{typeLabels[c.type]}</Badge></TableCell>
                  <TableCell>{c.drawerName}{c.tenantName ? ` (${c.tenantName})` : ""}</TableCell>
                  <TableCell>{c.bankName}</TableCell>
                  <TableCell className="ltr-nums">{formatDate(c.dueDate)}</TableCell>
                  <TableCell className="font-semibold ltr-nums">{formatAmount(c.amountILS, "ILS")}</TableCell>
                  <TableCell><Badge variant={statusColors[c.status] ?? "outline"}>{statusLabels[c.status] ?? c.status}</Badge></TableCell>
                  <TableCell>
                    {c.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="text-emerald-600 text-xs" onClick={() => changeStatus(c.id, "cleared")}>محصل</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600 text-xs" onClick={() => changeStatus(c.id, "bounced")}>مرتجع</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {cheques.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد شيكات</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>إضافة شيك جديد</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>رقم الشيك *</Label><Input value={form.chequeNumber} onChange={e => setForm(f => ({ ...f, chequeNumber: e.target.value }))} className="mt-1 ltr-nums" /></div>
              <div>
                <Label>النوع *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="incoming">وارد</SelectItem><SelectItem value="outgoing">صادر</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>اسم المسحوب عليه *</Label><Input value={form.drawerName} onChange={e => setForm(f => ({ ...f, drawerName: e.target.value }))} className="mt-1" /></div>
              <div><Label>البنك *</Label><Input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تاريخ الشيك *</Label><Input type="date" value={form.chequeDate} onChange={e => setForm(f => ({ ...f, chequeDate: e.target.value }))} className="mt-1" /></div>
              <div><Label>تاريخ الاستحقاق *</Label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>العملة *</Label>
                <Select value={form.currency} onValueChange={c => setForm(f => ({ ...f, currency: c, exchangeRate: String(rateForCurrency(c)) }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ILS">₪ ILS</SelectItem><SelectItem value="USD">$ USD</SelectItem><SelectItem value="JOD">JD JOD</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>المبلغ *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="mt-1 ltr-nums" /></div>
              <div><Label>سعر الصرف</Label><Input type="number" step="0.0001" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} className="mt-1 ltr-nums" /></div>
            </div>
            <div>
              <Label>المستأجر (إن وجد)</Label>
              <Select value={form.tenantId || "__none__"} onValueChange={v => setForm(f => ({ ...f, tenantId: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر مستأجراً" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">بدون</SelectItem>{(tenants as any[]).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={create.isPending}>إضافة</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
