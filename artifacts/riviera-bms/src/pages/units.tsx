import { useState } from "react";
import { useListUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  occupied: { label: "مؤجرة", variant: "default" },
  vacant: { label: "شاغرة", variant: "secondary" },
  maintenance: { label: "صيانة", variant: "destructive" },
};

const typeLabels: Record<string, string> = {
  office: "مكتب",
  shop: "محل تجاري",
  warehouse: "مستودع",
  apartment: "شقة",
  other: "أخرى",
};

const emptyForm = { unitNumber: "", floor: "", type: "office", area: "", status: "vacant", description: "" };

export default function Units() {
  const { data: units = [], isLoading } = useListUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (u: any) => {
    setEditing(u.id);
    setForm({ unitNumber: u.unitNumber, floor: u.floor, type: u.type, area: String(u.area), status: u.status, description: u.description ?? "" });
    setOpen(true);
  };

  const handleSave = async () => {
    const payload = { ...form, area: String(form.area) };
    try {
      if (editing) {
        await updateUnit.mutateAsync({ id: editing, data: payload as any });
        toast({ title: "تم التحديث", description: "تم تحديث الوحدة بنجاح" });
      } else {
        await createUnit.mutateAsync({ data: payload as any });
        toast({ title: "تمت الإضافة", description: "تمت إضافة الوحدة بنجاح" });
      }
      qc.invalidateQueries({ queryKey: ["/api/units"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه الوحدة؟")) return;
    try {
      await deleteUnit.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["/api/units"] });
      toast({ title: "تم الحذف" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الوحدات</h1>
          <p className="text-muted-foreground mt-1">إدارة وحدات عمارة الريفييرا</p>
        </div>
        <Button onClick={openNew} className="flex items-center gap-2">
          <Plus size={16} />
          إضافة وحدة
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {units.map((u: any) => {
          const st = statusLabels[u.status] ?? { label: u.status, variant: "outline" as const };
          return (
            <Card key={u.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-md text-primary"><Building2 size={18} /></div>
                  <div>
                    <CardTitle className="text-base ltr-nums">وحدة {u.unitNumber}</CardTitle>
                    <p className="text-xs text-muted-foreground">الطابق {u.floor} • {typeLabels[u.type] ?? u.type}</p>
                  </div>
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground ltr-nums">المساحة: {u.area} م²</p>
                {u.description && <p className="text-sm mt-1 text-muted-foreground truncate">{u.description}</p>}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)} className="flex-1"><Pencil size={14} className="ml-1" />تعديل</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(u.id)}><Trash2 size={14} /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل وحدة" : "إضافة وحدة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>رقم الوحدة *</Label><Input value={form.unitNumber} onChange={e => setForm(f => ({ ...f, unitNumber: e.target.value }))} className="mt-1" /></div>
              <div><Label>الطابق *</Label><Input value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>النوع *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الحالة *</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacant">شاغرة</SelectItem>
                    <SelectItem value="occupied">مؤجرة</SelectItem>
                    <SelectItem value="maintenance">صيانة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>المساحة (م²) *</Label><Input type="number" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} className="mt-1 ltr-nums" /></div>
            <div><Label>الوصف</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={createUnit.isPending || updateUnit.isPending}>
              {editing ? "حفظ التعديلات" : "إضافة"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
