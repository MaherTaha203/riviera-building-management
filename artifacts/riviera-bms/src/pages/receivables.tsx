import { useMemo, useState } from "react";
import {
  useListRentCharges, useGenerateRentCharges, useCancelRentCharge,
  useListContracts, useListTenants,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { usePersistedView } from "@/lib/usePersistedView";
import { invalidateFinancial } from "@/lib/invalidate";
import { useToast } from "@/hooks/use-toast";
import { Plus, Ban } from "lucide-react";
import { formatAmount, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const statusLabel: Record<string, string> = { open: "مفتوح", settled: "مسدَّد", cancelled: "ملغى" };
const statusColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "secondary", settled: "default", cancelled: "destructive",
};

export default function Receivables() {
  const [view, setView] = usePersistedView("receivables", "filters", { tenantId: "all" });
  const tenantFilter = view.tenantId;
  const tenantIdNum = tenantFilter !== "all" ? Number(tenantFilter) : undefined;

  const { data: charges = [], isLoading } = useListRentCharges(tenantIdNum ? { tenantId: tenantIdNum } : undefined);
  const { data: tenants = [] } = useListTenants();
  const { data: contracts = [] } = useListContracts();
  const generate = useGenerateRentCharges();
  const cancel = useCancelRentCharge();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ contractId: "", upToDate: new Date().toISOString().split("T")[0] });
  const [cancelId, setCancelId] = useState<number | null>(null);

  const rows = charges as any[];
  const amountDue = useMemo(
    () => rows.filter((c) => c.status !== "cancelled").reduce((s, c) => s + (Number(c.amountILS) - Number(c.allocatedILS)), 0),
    [rows],
  );

  const handleGenerate = async () => {
    if (!genForm.contractId) { toast({ title: "اختر عقداً", variant: "destructive" }); return; }
    try {
      const created = await generate.mutateAsync({ data: { contractId: Number(genForm.contractId), upToDate: genForm.upToDate } });
      invalidateFinancial(qc);
      toast({ title: created.length ? `تم توليد ${created.length} استحقاق` : "لا استحقاقات جديدة (كلها مولّدة مسبقاً)" });
      setGenOpen(false);
      setGenForm({ contractId: "", upToDate: new Date().toISOString().split("T")[0] });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const handleCancel = async () => {
    if (cancelId == null) return;
    try {
      await cancel.mutateAsync({ id: cancelId });
      invalidateFinancial(qc);
      toast({ title: "تم إلغاء الاستحقاق" });
    } catch (e: any) { toast({ title: "تعذّر الإلغاء", description: e.message, variant: "destructive" }); }
    finally { setCancelId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الذمم والاستحقاقات</h1>
          <p className="text-muted-foreground text-sm">استحقاقات الإيجار وما هو مستحق على المستأجرين</p>
        </div>
        <Button onClick={() => setGenOpen(true)}>
          <Plus className="ms-1 h-4 w-4" /> توليد استحقاقات
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="min-w-56">
            <Label>المستأجر</Label>
            <SearchableSelect
              className="mt-1"
              value={tenantFilter}
              onChange={(v) => setView({ tenantId: v })}
              options={[{ value: "all", label: "كل المستأجرين" }, ...(tenants as any[]).map((t) => ({ value: String(t.id), label: t.name }))]}
              placeholder="اختر مستأجراً"
            />
          </div>
          {tenantIdNum ? (
            <div className="ms-auto text-end">
              <div className="text-muted-foreground text-xs">إجمالي المستحق</div>
              <div className="text-xl font-bold">{formatAmount(amountDue)}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المستأجر</TableHead>
                  <TableHead>الفترة</TableHead>
                  <TableHead>الاستحقاق</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>المسدَّد</TableHead>
                  <TableHead>المتبقّي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">جارٍ التحميل…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا استحقاقات — استخدم «توليد استحقاقات» لإنشائها من العقود</TableCell></TableRow>
                ) : rows.map((c) => {
                  const remaining = Number(c.amountILS) - Number(c.allocatedILS);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.tenantName ?? `#${c.tenantId}`}</TableCell>
                      <TableCell>{formatDate(c.periodStart)} — {formatDate(c.periodEnd)}</TableCell>
                      <TableCell>{formatDate(c.dueDate)}</TableCell>
                      <TableCell>{formatAmount(Number(c.amountILS))}</TableCell>
                      <TableCell>{formatAmount(Number(c.allocatedILS))}</TableCell>
                      <TableCell className="font-medium">{formatAmount(c.status === "cancelled" ? 0 : remaining)}</TableCell>
                      <TableCell><Badge variant={statusColor[c.status] ?? "secondary"}>{statusLabel[c.status] ?? c.status}</Badge></TableCell>
                      <TableCell className="text-end">
                        {c.status !== "cancelled" && Number(c.allocatedILS) === 0 ? (
                          <Button variant="ghost" size="sm" onClick={() => setCancelId(c.id)} aria-label="إلغاء">
                            <Ban className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>توليد استحقاقات الإيجار</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>العقد</Label>
              <SearchableSelect
                className="mt-1"
                value={genForm.contractId}
                onChange={(v) => setGenForm((f) => ({ ...f, contractId: v }))}
                options={(contracts as any[]).map((c) => ({ value: String(c.id), label: `${c.contractNumber} — ${c.tenantName ?? ""}` }))}
                placeholder="اختر عقداً"
              />
            </div>
            <div>
              <Label>حتى تاريخ</Label>
              <SmartDateInput className="mt-1" value={genForm.upToDate} onChange={(v) => setGenForm((f) => ({ ...f, upToDate: v }))} />
              <p className="text-muted-foreground mt-1 text-xs">تُولَّد استحقاقات دورية من بداية العقد حتى هذا التاريخ (لا تتكرر).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>إلغاء</Button>
            <Button onClick={handleGenerate} disabled={generate.isPending}>توليد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelId != null} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الاستحقاق</AlertDialogTitle>
            <AlertDialogDescription>سيُوسم الاستحقاق كملغى ويُستبعد من إجمالي المستحق. لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>إلغاء الاستحقاق</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
