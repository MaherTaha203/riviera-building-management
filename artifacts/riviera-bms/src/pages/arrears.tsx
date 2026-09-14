import { useState } from "react";
import { useGetNotices, usePreviewLateFees, useApplyLateFees, useGetSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { invalidateFinancial } from "@/lib/invalidate";
import { formatAmount, formatDate } from "@/lib/format";
import { BellRing, CalendarClock, AlertTriangle, Coins } from "lucide-react";

const money = (n: number) => <span className="ltr-nums">{formatAmount(Number(n || 0), "ILS")}</span>;

/** Arrears & collections dashboard: notices, overdue tenants, late-fee runner. */
export default function Arrears() {
  const { data: notices } = useGetNotices();
  const { data: settings } = useGetSettings();
  const { data: preview } = usePreviewLateFees();
  const apply = useApplyLateFees();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmApply, setConfirmApply] = useState(false);

  const n = notices as any;
  const s = settings as any;
  const pv = preview as any;
  const lateFeeOn = s?.lateFeeEnabled === "true";

  const doApply = async () => {
    try {
      const res: any = await apply.mutateAsync({ data: {} });
      invalidateFinancial(qc);
      toast({ title: "تم تطبيق رسوم التأخير", description: `${res?.count ?? 0} رسم — ${formatAmount(Number(res?.totalFeeILS ?? 0), "ILS")}` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message, variant: "destructive" });
    } finally { setConfirmApply(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2"><BellRing size={26} /> المتابعة والتحصيل</h1>
        <p className="text-muted-foreground mt-1 text-[12.5px]">تنبيهات العقود المنتهية والمستأجرين المتأخرين وإدارة رسوم التأخير</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm font-medium">عقود تنتهي قريباً</CardTitle><CalendarClock className="h-4 w-4 text-amber-600" /></CardHeader>
          <CardContent><div className="text-2xl font-bold ltr-nums">{n?.counts?.expiring ?? 0}</div><p className="text-xs text-muted-foreground">خلال {n?.expiryHorizonDays ?? 60} يوماً</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm font-medium">مستأجرون متأخرون</CardTitle><AlertTriangle className="h-4 w-4 text-rose-600" /></CardHeader>
          <CardContent><div className="text-2xl font-bold ltr-nums">{n?.counts?.overdue ?? 0}</div><p className="text-xs text-muted-foreground">لديهم ذمم متأخرة</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm font-medium">رسوم تأخير معلّقة</CardTitle><Coins className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent><div className="text-2xl font-bold ltr-nums">{formatAmount(Number(pv?.totalFeeILS ?? 0), "ILS")}</div><p className="text-xs text-muted-foreground">{pv?.count ?? 0} استحقاق مؤهّل</p></CardContent>
        </Card>
      </div>

      {/* Late-fee runner */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">رسوم التأخير {lateFeeOn ? <Badge variant="default">مفعّلة</Badge> : <Badge variant="secondary">معطّلة</Badge>}</CardTitle>
          <Button disabled={!lateFeeOn || (pv?.count ?? 0) === 0 || apply.isPending} onClick={() => setConfirmApply(true)}>تطبيق رسوم التأخير</Button>
        </CardHeader>
        <CardContent>
          {!lateFeeOn ? (
            <p className="text-sm text-muted-foreground">فعّل سياسة رسوم التأخير من الإعدادات لتطبيقها على الاستحقاقات المتأخرة.</p>
          ) : (pv?.candidates ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا استحقاقات مؤهّلة لرسوم تأخير حالياً.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>الاستحقاق</TableHead><TableHead>الفترة</TableHead><TableHead className="text-end">المتبقّي</TableHead><TableHead className="text-end">الرسم</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(pv.candidates as any[]).map((c) => (
                    <TableRow key={c.sourceChargeId}>
                      <TableCell className="ltr-nums">#{c.sourceChargeId}</TableCell>
                      <TableCell className="ltr-nums">{formatDate(c.periodStart)}</TableCell>
                      <TableCell className="text-end">{money(c.outstandingILS)}</TableCell>
                      <TableCell className="text-end font-medium">{money(c.feeILS)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Overdue tenants */}
        <Card>
          <CardHeader><CardTitle className="text-base">المستأجرون المتأخرون</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>المستأجر</TableHead><TableHead className="text-end">المتأخّر</TableHead><TableHead className="text-end">إجمالي المستحق</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(n?.overdueTenants ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">لا متأخرات</TableCell></TableRow>
                  ) : (n.overdueTenants as any[]).map((t) => (
                    <TableRow key={t.tenantId}>
                      <TableCell className="font-medium">{t.tenantName ?? `#${t.tenantId}`}</TableCell>
                      <TableCell className="text-end text-rose-600 font-medium">{money(t.overdueILS)}</TableCell>
                      <TableCell className="text-end">{money(t.totalDueILS)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Expiring contracts */}
        <Card>
          <CardHeader><CardTitle className="text-base">عقود تنتهي قريباً</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>العقد</TableHead><TableHead>المستأجر</TableHead><TableHead>الوحدة</TableHead><TableHead className="text-end">ينتهي</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(n?.expiringContracts ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا عقود تنتهي قريباً</TableCell></TableRow>
                  ) : (n.expiringContracts as any[]).map((c) => (
                    <TableRow key={c.contractId}>
                      <TableCell className="ltr-nums">{c.contractNumber}</TableCell>
                      <TableCell>{c.tenantName ?? `#${c.tenantId}`}</TableCell>
                      <TableCell className="ltr-nums">{c.unitNumber ?? `#${c.unitId}`}</TableCell>
                      <TableCell className="text-end"><span className="ltr-nums">{formatDate(c.endDate)}</span> <Badge variant={c.daysToExpiry <= 30 ? "destructive" : "secondary"}>{c.daysToExpiry} يوم</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تطبيق رسوم التأخير</AlertDialogTitle>
            <AlertDialogDescription>سيتم إنشاء {pv?.count ?? 0} رسم تأخير بإجمالي {formatAmount(Number(pv?.totalFeeILS ?? 0), "ILS")} وتسجيلها في دفتر الأستاذ. لا يمكن التراجع إلا بإلغاء كل رسم يدوياً.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={doApply}>تطبيق</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
