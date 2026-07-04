import { useMemo, useState, useRef } from "react";
import { ExcelExportButton } from "@/components/ExcelExportButton";
import { FilterBar } from "@/components/FilterBar";

import { useListDocuments, useCreateDocument, useDeleteDocument, useListTenants, useListContracts, useListUnits } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FileBox, FileText, Eye } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const entityTypeLabels: Record<string, string> = { general: "عام", tenant: "مستأجر", contract: "عقد", unit: "وحدة" };
const emptyForm = { name: "", entityType: "general", entityId: "", fileType: "pdf", notes: "", fileUrl: "" };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

export default function Documents() {
  const { data: tenants = [] } = useListTenants();
  const { data: contracts = [] } = useListContracts();
  const { data: units = [] } = useListUnits();
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const { data: docs = [], isLoading } = useListDocuments(entityTypeFilter !== "all" ? { entityType: entityTypeFilter } : undefined);
  const create = useCreateDocument();
  const del = useDeleteDocument();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [fileLabel, setFileLabel] = useState("");

  // Document center filters (V1.1 §10): search + file type + date + linked entity.
  const [fSearch, setFSearch] = useState("");
  const [fFileType, setFFileType] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fEntity, setFEntity] = useState("all");
  const resetFilters = () => { setFSearch(""); setFFileType("all"); setFFrom(""); setFTo(""); setFEntity("all"); };
  const filterEntityOptions =
    entityTypeFilter === "tenant" ? (tenants as any[]).map((t: any) => ({ value: String(t.id), label: t.name })) :
    entityTypeFilter === "contract" ? (contracts as any[]).map((c: any) => ({ value: String(c.id), label: c.contractNumber })) :
    entityTypeFilter === "unit" ? (units as any[]).map((u: any) => ({ value: String(u.id), label: u.unitNumber })) : [];
  const filteredDocs = useMemo(() => (docs as any[]).filter((d: any) => {
    if (fSearch && !String(d.name ?? "").toLowerCase().includes(fSearch.toLowerCase()) && !String(d.notes ?? "").toLowerCase().includes(fSearch.toLowerCase())) return false;
    if (fFileType !== "all" && d.fileType !== fFileType) return false;
    const day = String(d.createdAt ?? "").slice(0, 10);
    if (fFrom && day < fFrom) return false;
    if (fTo && day > fTo) return false;
    if (fEntity !== "all" && String(d.entityId ?? "") !== fEntity) return false;
    return true;
  }), [docs, fSearch, fFileType, fFrom, fTo, fEntity]);

  const entityOptions =
    form.entityType === "tenant" ? (tenants as any[]) :
    form.entityType === "contract" ? (contracts as any[]) :
    form.entityType === "unit" ? (units as any[]) : [];
  const getEntityLabel = (e: any) =>
    form.entityType === "tenant" ? e.name :
    form.entityType === "contract" ? e.contractNumber : e.unitNumber;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm(f => ({ ...f, fileUrl: dataUrl, fileType: file.name.split(".").pop()?.toLowerCase() || "other" }));
      setFileLabel(file.name);
    } catch {
      toast({ title: "خطأ", description: "فشل قراءة الملف", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    try {
      await create.mutateAsync({
        data: {
          name: form.name,
          entityType: form.entityType,
          entityId: form.entityId ? Number(form.entityId) : undefined,
          fileType: form.fileType,
          fileUrl: form.fileUrl || undefined,
          notes: form.notes || undefined,
        } as any
      });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "تم حفظ المستند" });
      setOpen(false);
      setForm({ ...emptyForm });
      setFileLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستند؟")) return;
    try {
      await del.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "تم الحذف" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleView = (doc: any) => {
    if (!doc.fileUrl) return;
    const w = window.open();
    if (w) {
      w.document.write(`<html><body style="margin:0"><iframe src="${doc.fileUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`);
      w.document.close();
    }
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">المستندات</h1>
          <p className="text-muted-foreground mt-1">إدارة الملفات والوثائق</p>
        </div>
        <ExcelExportButton filename="documents" headers={["الاسم","النوع","المرتبط بـ","نوع الملف","التاريخ","ملاحظات"]}
          getRows={() => filteredDocs.map((d: any) => [d.name, d.entityType, d.entityName ?? "", d.fileType, d.createdAt, d.notes ?? ""])} />
        <Button onClick={() => { setForm({ ...emptyForm }); setFileLabel(""); setOpen(true); }} className="flex items-center gap-2">
          <Plus size={16} />إضافة مستند
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", ...Object.keys(entityTypeLabels)].map(t => (
          <Button key={t} variant={entityTypeFilter === t ? "default" : "outline"} size="sm" onClick={() => setEntityTypeFilter(t)}>
            {t === "all" ? "الكل" : entityTypeLabels[t]}
          </Button>
        ))}
        {entityTypeFilter !== "all" && entityTypeFilter !== "general" && (
          <div className="w-56">
            <Select value={fEntity} onValueChange={setFEntity}>
              <SelectTrigger className="h-9"><SelectValue placeholder="الكيان المرتبط" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الكيانات</SelectItem>
                {filterEntityOptions.map((o: any) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <FilterBar
        from={fFrom} to={fTo} onFrom={setFFrom} onTo={setFTo} dateLabel="تاريخ الإضافة"
        search={fSearch} onSearch={setFSearch} searchLabel="بحث بالاسم/الملاحظات"
        selects={[
          { key: "ftype", label: "نوع الملف", value: fFileType, onChange: setFFileType,
            options: [{ value: "all", label: "الكل" }, ...["pdf","docx","jpg","png","xlsx","other"].map(t => ({ value: t, label: t.toUpperCase() }))] },
        ]}
        onReset={resetFilters}
        resultCount={filteredDocs.length}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المرتبط بـ</TableHead>
                <TableHead>نوع الملف</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocs.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-muted-foreground" />{d.name}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{entityTypeLabels[d.entityType] ?? d.entityType}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.entityName ?? "-"}</TableCell>
                  <TableCell className="uppercase text-xs font-mono">{d.fileType}</TableCell>
                  <TableCell className="ltr-nums">{formatDate(d.createdAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.notes ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {d.fileUrl && (
                        <Button size="sm" variant="ghost" onClick={() => handleView(d)} title="عرض الملف">
                          <Eye size={14} />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(d.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredDocs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد مستندات</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle><FileBox className="inline ml-2" size={18} />إضافة مستند</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label>اسم المستند *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>نوع الكيان</Label>
                <Select value={form.entityType} onValueChange={v => setForm(f => ({ ...f, entityType: v, entityId: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(entityTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>نوع الملف *</Label>
                <Select value={form.fileType} onValueChange={v => setForm(f => ({ ...f, fileType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["pdf","docx","jpg","png","xlsx","other"].map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.entityType !== "general" && (
              <div>
                <Label>الكيان المرتبط</Label>
                <Select value={form.entityId} onValueChange={v => setForm(f => ({ ...f, entityId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>{entityOptions.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{getEntityLabel(e)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>رفع ملف (اختياري)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="text-sm"
                />
              </div>
              {fileLabel && <p className="text-xs text-muted-foreground mt-1">تم اختيار: {fileLabel}</p>}
            </div>
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={create.isPending || !form.name}>إضافة</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
