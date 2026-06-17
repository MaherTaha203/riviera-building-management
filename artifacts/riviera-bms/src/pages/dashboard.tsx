import { useGetDashboardSummary, useGetDashboardRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatDate } from "@/lib/format";
import { Building2, Users, FileText, Wallet, Receipt, CreditCard, Activity } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activities, isLoading: isLoadingActivities } = useGetDashboardRecentActivity();

  if (isLoadingSummary) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>;
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-1">نظرة عامة على أداء عمارة الريفييرا</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الوحدات المؤجرة / الإجمالي</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ltr-nums">
              {summary.occupiedUnits} / {summary.totalUnits}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-500 font-medium ltr-nums">{summary.vacantUnits}</span> وحدات شاغرة
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المستأجرين</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ltr-nums">{summary.totalTenants}</div>
            <p className="text-xs text-muted-foreground mt-1">إجمالي المستأجرين</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">العقود النشطة</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ltr-nums">{summary.activeContracts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-amber-500 font-medium ltr-nums">{summary.expiringContractsSoon || 0}</span> تنتهي قريباً
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">رصيد الصندوق</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ltr-nums">{formatAmount(summary.cashBalanceILS, "ILS")}</div>
            <p className="text-xs text-muted-foreground mt-1">الرصيد النقدي المتوفر</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">حركة الشهر الحالي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-md text-emerald-600 dark:text-emerald-400">
                  <Receipt size={20} />
                </div>
                <span className="font-medium">المقبوضات</span>
              </div>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 ltr-nums">
                {formatAmount(summary.monthlyReceiptsILS, "ILS")}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-100 dark:border-rose-900/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/50 rounded-md text-rose-600 dark:text-rose-400">
                  <CreditCard size={20} />
                </div>
                <span className="font-medium">المصروفات</span>
              </div>
              <span className="text-lg font-bold text-rose-600 dark:text-rose-400 ltr-nums">
                {formatAmount(summary.monthlyPaymentsILS, "ILS")}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted rounded-lg border">
              <span className="font-medium">صافي الحركة</span>
              <span className="text-lg font-bold ltr-nums" dir="ltr">
                {formatAmount(summary.monthlyReceiptsILS - summary.monthlyPaymentsILS, "ILS")}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-muted-foreground" />
              أحدث الحركات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingActivities ? (
              <div className="text-center text-muted-foreground py-8 animate-pulse">جاري التحميل...</div>
            ) : activities && activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex flex-col gap-1 pb-4 border-b last:border-0 last:pb-0">
                    <p className="text-sm font-medium">{activity.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="ltr-nums">{formatDate(activity.createdAt)}</span>
                      <span>•</span>
                      <span className="capitalize">{activity.type.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">
                لا توجد حركات حديثة
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
