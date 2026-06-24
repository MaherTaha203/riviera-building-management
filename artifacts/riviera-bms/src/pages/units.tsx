import { useState } from "react";
import { useListUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (u: any) => {
    setEditing(u.id);
    setForm({ unitNumber: u.unitNumber, floor: u.floor, type: u.type, area: String(u.area), status: u.status, description: u.description ?? "" });
    setOpen(true);
  };

  const handleSave = async () => {
    const payload = { ...form, area: Number(form.area) };
    try {
      if (editing) {
        await updateUnit.mutateAsync({ id: editing, data: payload as any });
        toast({ title: "تم التحديث", description: "تم تحديث الوحدة بنجاح" });
      } else {
        await createUnit.mutateAsync({ data: payload as any });
        toast({ title: "تمت الإضافة", description: "تمت إضافة الوحدة بنجاح" });
      }
      await qc.invalidateQueries({ queryKey: ["/api/units"] });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "حدث خطأ أثناء حفظ البيانات", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteUnit.mutateAsync({ id: deleteId });
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
        <div>
          <h1 className="text-3xl font-bold">الوحدات</h1>
          <p className="text-muted-foreground mt-1">إدارة وحدات عمارة الريفييرا</p>
        </div>
        <Button onClick={openNew} className="flex items-center gap-2">
          <Plus size={16} />إضافة وحدة
        </Button>
      </div>

      {(units as any[]).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="p-4 bg-muted rounded-full"><Building2 size={32} className="text-muted-foreground" /></div>
            <div className="text-center">
              <p className="font-medium">لا توجد وحدات حالياً</p>
              <p className="text-sm text-muted-foreground mt-1">ابدأ بإضافة الوحدات في العمارة</p>
            </div>
            <Button onClick={openNew} className="flex items-center gap-2">
              <Plus size={16} />إضافة وحدة
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(units as any[]).map((u: any) => {
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
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)} className="flex-1">
                      <Pencil size={14} className="ml-1" />تعديل
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteId(u.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
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

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذه الوحدة؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
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
