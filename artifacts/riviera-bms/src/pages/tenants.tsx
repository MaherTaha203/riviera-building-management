import { useState } from "react";
import { useListTenants, useCreateTenant, useUpdateTenant, useDeleteTenant } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, Phone, Mail, CreditCard } from "lucide-react";
import { formatAmount } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = { name: "", type: "individual", phone: "", email: "", idNumber: "", address: "", notes: "" };

export default function Tenants() {
  const { data: tenants = [], isLoading } = useListTenants();
  const create = useCreateTenant();
  const update = useUpdateTenant();
  const del = useDeleteTenant();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t.id);
    setForm({ name: t.name, type: t.type, phone: t.phone, email: t.email ?? "", idNumber: t.idNumber ?? "", address: t.address ?? "", notes: t.notes ?? "" });
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
      qc.invalidateQueries({ queryKey: ["/api/tenants"] });
      setOpen(false);
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستأجر؟")) return;
    try {
      await del.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "تم الحذف" });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const filtered = tenants.filter((t: any) =>
    !search || t.name.includes(search) || t.phone.includes(search)
  );

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">المستأجرون</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات المستأجرين</p>
        </div>
        <Button onClick={openNew} className="flex items-center gap-2"><Plus size={16} />إضافة مستأجر</Button>
      </div>

      <div className="flex gap-3">
        <Input placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t: any) => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-md text-primary"><Users size={18} /></div>
                <div>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <Badge variant="outline" className="text-xs mt-0.5">{t.type === "company" ? "شركة" : "فرد"}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone size={13} /><span className="ltr-nums">{t.phone}</span></div>
              {t.email && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail size={13} /><span>{t.email}</span></div>}
              <div className="flex items-center gap-2 text-sm"><CreditCard size={13} />
                <span className={`font-medium ltr-nums ${Number(t.balance) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatAmount(Number(t.balance), "ILS")}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => openEdit(t)} className="flex-1"><Pencil size={14} className="ml-1" />تعديل</Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(t.id)}><Trash2 size={14} /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <div className="col-span-3 text-center py-12 text-muted-foreground">لا توجد نتائج</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>{editing ? "تعديل مستأجر" : "إضافة مستأجر جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>الاسم *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>النوع *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="individual">فرد</SelectItem><SelectItem value="company">شركة</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>رقم الهاتف *</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1 ltr-nums" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>البريد الإلكتروني</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
              <div><Label>رقم الهوية</Label><Input value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))} className="mt-1 ltr-nums" /></div>
            </div>
            <div><Label>العنوان</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="mt-1" /></div>
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>{editing ? "حفظ التعديلات" : "إضافة"}</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
