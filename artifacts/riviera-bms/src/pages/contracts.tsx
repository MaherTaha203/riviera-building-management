import { useState, useRef } from "react";
import { PrintExportButton } from "@/components/PrintExportButton";
import { useListContracts, useCreateContract, useUpdateContract, useDeleteContract, useListTenants, useListUnits, useGetExchangeRates, useListDocuments, useCreateDocument, useDeleteDocument } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText, Printer, Paperclip, Eye, Download } from "lucide-react";
import { usePrint, PrintButton, fmtMoney, fmtDate } from "@/lib/print";
import { ContractDoc, ReportTable } from "@/lib/print/documents";
import { formatAmount, formatDate } from "@/lib/format";
import { invalidateFinancial } from "@/lib/invalidate";
import { useQueryClient } from "@tanstack/react-query";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "نشط", variant: "default" },
  expired: { label: "منتهي", variant: "secondary" },
  terminated: { label: "ملغى", variant: "destructive" },
};

const empty = { tenantId: "", unitId: "", startDate: "", endDate: "", rentAmount: "", currency: "ILS", exchangeRate: "1", paymentFrequency: "monthly", notes: "", depositAmount: "", paymentCount: "", paymentMethod: "", additionalTerms: "" };

const payMethodLabels: Record<string, string> = { cash: "نقداً", cheque: "شيك", bank_transfer: "تحويل بنكي" };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

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

  // Contract attachments — reuse the Documents module (entityType="contract").
  const [attachContract, setAttachContract] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createDoc = useCreateDocument();
  const delDoc = useDeleteDocument();
  const { data: attachments = [], isLoading: attachLoading } = useListDocuments(
    attachContract ? { entityType: "contract", entityId: attachContract.id } : undefined,
    { query: { enabled: !!attachContract } } as any,
  );
  // All contract attachments, grouped by contract id, so the printed contract
  // can list its attached files (reuses the existing Documents module).
  const { data: allContractDocs = [] } = useListDocuments({ entityType: "contract" });
  const attachmentsByContract = (allContractDocs as any[]).reduce((acc: Record<number, any[]>, d: any) => {
    if (d.entityId != null) (acc[d.entityId] ??= []).push(d);
    return acc;
  }, {} as Record<number, any[]>);

  const handleAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !attachContract) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      toast({ title: "نوع ملف غير مدعوم", description: "يُسمح فقط بـ PDF أو JPG أو PNG", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await createDoc.mutateAsync({
        data: {
          name: file.name,
          entityType: "contract",
          entityId: attachContract.id,
          fileType: ext === "jpeg" ? "jpg" : ext,
          fileUrl: dataUrl,
        } as any,
      });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "تم رفع المرفق" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAttachDelete = async (id: number) => {
    try {
      await delDoc.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "تم حذف المرفق" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  const viewAttachment = (doc: any) => {
    if (!doc.fileUrl) return;
    const w = window.open();
    if (w) {
      w.document.write(`<html><body style="margin:0"><iframe src="${doc.fileUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`);
      w.document.close();
    }
  };

  const downloadAttachment = (doc: any) => {
    if (!doc.fileUrl) return;
    const a = document.createElement("a");
    a.href = doc.fileUrl;
    a.download = doc.name || "attachment";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

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
      depositAmount: c.depositAmount != null ? String(c.depositAmount) : "",
      paymentCount: c.paymentCount != null ? String(c.paymentCount) : "",
      paymentMethod: c.paymentMethod ?? "",
      additionalTerms: c.additionalTerms ?? "",
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
      depositAmount: form.depositAmount !== "" ? Number(form.depositAmount) : null,
      paymentCount: form.paymentCount !== "" ? Number(form.paymentCount) : null,
      paymentMethod: form.paymentMethod || null,
      additionalTerms: form.additionalTerms || null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing, data: payload as any });
        toast({ title: "تم التحديث" });
      } else {
        await create.mutateAsync({ data: payload as any });
        toast({ title: "تمت الإضافة" });
      }
      invalidateFinancial(qc);
      setOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await del.mutateAsync({ id: deleteId });
      invalidateFinancial(qc);
      toast({ title: "تم الحذف" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const print = usePrint();
  // Bulk print (V1.1 §7): every contract as a full lease document, one per page.
  const printAllContracts = () => print(
    <div>
      {(contracts as any[]).map((c: any) => (
        <div key={c.id} className="print-break">
          <ContractDoc c={c} attachments={attachmentsByContract[c.id] ?? []} />
        </div>
      ))}
    </div>,
    { title: "جميع عقود الإيجار" },
  );

  const printList = () => print(
    <ReportTable
      columns={[
        { label: "رقم العقد", render: (c: any) => <span className="ltr-nums">{c.contractNumber}</span> },
        { label: "المستأجر", render: (c: any) => c.tenantName },
        { label: "الوحدة", render: (c: any) => <span className="ltr-nums">{c.unitNumber}</span> },
        { label: "البداية", render: (c: any) => <span className="ltr-nums">{fmtDate(c.startDate)}</span> },
        { label: "الانتهاء", render: (c: any) => <span className="ltr-nums">{fmtDate(c.endDate)}</span> },
        { label: "الإيجار (شيكل)", render: (c: any) => <span className="ltr-nums">{fmtMoney(c.rentAmountILS, "ILS")}</span> },
      ]}
      rows={contracts as any[]}
    />,
    { title: "قائمة العقود" },
  );

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold tracking-tight">العقود</h1><p className="text-muted-foreground mt-1 text-[12.5px]">إدارة عقود الإيجار</p></div>
        <div className="flex items-center gap-2">
          <PrintExportButton
            prints={[
              { label: "طباعة القائمة", onClick: printList },
              { label: "طباعة كل العقود", onClick: printAllContracts },
            ]}
            exportSpec={{ filename: "contracts", headers: ["رقم العقد","المستأجر","الوحدة","البداية","الانتهاء","الإيجار (شيكل)","الحالة"],
              getRows: () => (contracts as any[]).map((c: any) => [c.contractNumber, c.tenantName, c.unitNumber, c.startDate, c.endDate, Number(c.rentAmountILS), c.status]) }}
          />
          <Button onClick={openNew} className="flex items-center gap-2"><Plus size={16} />إضافة عقد</Button>
        </div>
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
                          <Button size="sm" variant="ghost" title="طباعة" onClick={() => print(<ContractDoc c={c} attachments={attachmentsByContract[c.id] ?? []} />, { title: `عقد إيجار ${c.contractNumber}`, refNumber: c.contractNumber })}><Printer size={14} /></Button>
                          <Button size="sm" variant="ghost" title="المرفقات" onClick={() => setAttachContract(c)}><Paperclip size={14} /></Button>
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
                <SearchableSelect
                  className="mt-1"
                  value={form.tenantId}
                  onChange={v => setForm(f => ({ ...f, tenantId: v }))}
                  options={(tenants as any[]).map((t: any) => ({ value: String(t.id), label: t.name }))}
                  placeholder="اختر مستأجراً"
                  clearable={false}
                />
              </div>
              <div>
                <Label>الوحدة *</Label>
                <SearchableSelect
                  className="mt-1"
                  value={form.unitId}
                  onChange={v => setForm(f => ({ ...f, unitId: v }))}
                  options={(units as any[]).filter((u: any) => u.status !== "occupied" || String(u.id) === form.unitId).map((u: any) => ({ value: String(u.id), label: `وحدة ${u.unitNumber}` }))}
                  placeholder="اختر وحدة"
                  clearable={false}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تاريخ البداية *</Label><SmartDateInput value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} className="mt-1" /></div>
              <div><Label>تاريخ الانتهاء *</Label><SmartDateInput value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} className="mt-1" /></div>
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
            <div className="grid grid-cols-3 gap-3">
              <div><Label>مبلغ التأمين</Label><Input type="number" value={form.depositAmount} onChange={e => setForm(f => ({ ...f, depositAmount: e.target.value }))} className="mt-1 ltr-nums" /></div>
              <div><Label>عدد الدفعات</Label><Input type="number" value={form.paymentCount} onChange={e => setForm(f => ({ ...f, paymentCount: e.target.value }))} className="mt-1 ltr-nums" /></div>
              <div>
                <Label>طريقة الدفع</Label>
                <Select value={form.paymentMethod || "none"} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="cash">نقداً</SelectItem>
                    <SelectItem value="cheque">شيك</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>شروط إضافية</Label><Input value={form.additionalTerms} onChange={e => setForm(f => ({ ...f, additionalTerms: e.target.value }))} className="mt-1" /></div>
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

      {/* Contract Attachments */}
      <Dialog open={attachContract !== null} onOpenChange={o => { if (!o) setAttachContract(null); }}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip size={18} />مرفقات العقد {attachContract?.contractNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>رفع مرفق (PDF أو JPG أو PNG)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleAttachUpload}
                disabled={createDoc.isPending}
                className="mt-1 text-sm"
              />
              {createDoc.isPending && <p className="text-xs text-muted-foreground mt-1">جاري الرفع...</p>}
            </div>
            <div className="border rounded-md">
              {attachLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground animate-pulse">جاري التحميل...</div>
              ) : (attachments as any[]).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">لا توجد مرفقات لهذا العقد</div>
              ) : (
                <ul className="divide-y">
                  {(attachments as any[]).map((d: any) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className="text-muted-foreground shrink-0" />
                        <span className="truncate text-sm">{d.name}</span>
                        <Badge variant="outline" className="uppercase text-[10px]">{d.fileType}</Badge>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {d.fileUrl && <Button size="sm" variant="ghost" title="عرض" onClick={() => viewAttachment(d)}><Eye size={14} /></Button>}
                        {d.fileUrl && <Button size="sm" variant="ghost" title="تنزيل" onClick={() => downloadAttachment(d)}><Download size={14} /></Button>}
                        <Button size="sm" variant="ghost" className="text-destructive" title="حذف" onClick={() => handleAttachDelete(d.id)}><Trash2 size={14} /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter className="flex-row-reverse">
            <Button variant="outline" onClick={() => setAttachContract(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
