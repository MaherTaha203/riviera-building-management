import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, useGetExchangeRates, useUpdateExchangeRates, useListUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Settings as SettingsIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const emptyUserForm = { username: "", name: "", password: "", role: "viewer" };

export default function Settings() {
  const { data: settings } = useGetSettings();
  const { data: rates } = useGetExchangeRates();
  const { data: users = [] } = useListUsers();
  const updateSettings = useUpdateSettings();
  const updateRates = useUpdateExchangeRates();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [settingsForm, setSettingsForm] = useState({ buildingName: "", buildingAddress: "", defaultCurrency: "ILS", phone: "", email: "", taxNumber: "" });
  const [ratesForm, setRatesForm] = useState({ usdToILS: "3.70", jodToILS: "5.22" });
  const [userOpen, setUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({ ...emptyUserForm });

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        buildingName: (settings as any).buildingName ?? "",
        buildingAddress: (settings as any).buildingAddress ?? "",
        defaultCurrency: (settings as any).defaultCurrency ?? "ILS",
        phone: (settings as any).phone ?? "",
        email: (settings as any).email ?? "",
        taxNumber: (settings as any).taxNumber ?? "",
      });
    }
  }, [settings]);

  useEffect(() => {
    if (rates) setRatesForm({ usdToILS: String((rates as any).usdToILS), jodToILS: String((rates as any).jodToILS) });
  }, [rates]);

  const saveSettings = async () => {
    try {
      await updateSettings.mutateAsync({ data: settingsForm as any });
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "تم حفظ الإعدادات" });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const saveRates = async () => {
    try {
      await updateRates.mutateAsync({ data: { usdToILS: Number(ratesForm.usdToILS), jodToILS: Number(ratesForm.jodToILS) } });
      qc.invalidateQueries({ queryKey: ["/api/settings/exchange-rates"] });
      toast({ title: "تم تحديث أسعار الصرف" });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const openNewUser = () => { setEditingUser(null); setUserForm({ ...emptyUserForm }); setUserOpen(true); };
  const openEditUser = (u: any) => {
    setEditingUser(u.id);
    setUserForm({ username: u.username, name: u.name, password: "", role: u.role });
    setUserOpen(true);
  };

  const saveUser = async () => {
    try {
      if (editingUser) {
        const payload: any = { name: userForm.name, role: userForm.role };
        if (userForm.password) payload.password = userForm.password;
        await updateUser.mutateAsync({ id: editingUser, data: payload });
        toast({ title: "تم التحديث" });
      } else {
        await createUser.mutateAsync({ data: userForm as any });
        toast({ title: "تمت الإضافة" });
      }
      qc.invalidateQueries({ queryKey: ["/api/settings/users"] });
      setUserOpen(false);
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const deleteUserHandler = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟")) return;
    try {
      await deleteUser.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["/api/settings/users"] });
      toast({ title: "تم الحذف" });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const roleLabels: Record<string, string> = { admin: "مدير", manager: "مشرف", viewer: "مشاهد" };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold flex items-center gap-2"><SettingsIcon size={28} />الإعدادات</h1><p className="text-muted-foreground mt-1">إعدادات النظام والمستخدمين</p></div>

      {/* Building Settings */}
      <Card>
        <CardHeader><CardTitle>بيانات العمارة</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>اسم العمارة</Label><Input value={settingsForm.buildingName} onChange={e => setSettingsForm(f => ({ ...f, buildingName: e.target.value }))} className="mt-1" /></div>
            <div><Label>العنوان</Label><Input value={settingsForm.buildingAddress} onChange={e => setSettingsForm(f => ({ ...f, buildingAddress: e.target.value }))} className="mt-1" /></div>
            <div><Label>رقم الهاتف</Label><Input value={settingsForm.phone} onChange={e => setSettingsForm(f => ({ ...f, phone: e.target.value }))} className="mt-1 ltr-nums" /></div>
            <div><Label>البريد الإلكتروني</Label><Input value={settingsForm.email} onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
            <div><Label>الرقم الضريبي</Label><Input value={settingsForm.taxNumber} onChange={e => setSettingsForm(f => ({ ...f, taxNumber: e.target.value }))} className="mt-1 ltr-nums" /></div>
            <div>
              <Label>العملة الافتراضية</Label>
              <Select value={settingsForm.defaultCurrency} onValueChange={v => setSettingsForm(f => ({ ...f, defaultCurrency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ILS">₪ ILS</SelectItem><SelectItem value="USD">$ USD</SelectItem><SelectItem value="JOD">JD JOD</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={saveSettings} className="mt-4" disabled={updateSettings.isPending}>حفظ الإعدادات</Button>
        </CardContent>
      </Card>

      {/* Exchange Rates */}
      <Card>
        <CardHeader><CardTitle>أسعار الصرف</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 max-w-md">
            <div><Label>دولار أمريكي → شيقل</Label><Input type="number" step="0.001" value={ratesForm.usdToILS} onChange={e => setRatesForm(f => ({ ...f, usdToILS: e.target.value }))} className="mt-1 ltr-nums" /></div>
            <div><Label>دينار أردني → شيقل</Label><Input type="number" step="0.001" value={ratesForm.jodToILS} onChange={e => setRatesForm(f => ({ ...f, jodToILS: e.target.value }))} className="mt-1 ltr-nums" /></div>
          </div>
          <Button onClick={saveRates} className="mt-4" disabled={updateRates.isPending}>تحديث الأسعار</Button>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>المستخدمون</CardTitle>
          <Button size="sm" onClick={openNewUser} className="flex items-center gap-1"><Plus size={14} />إضافة مستخدم</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم المستخدم</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users as any[]).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono ltr-nums">{u.username}</TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell><Badge variant={u.role === "admin" ? "default" : u.role === "manager" ? "secondary" : "outline"}>{roleLabels[u.role] ?? u.role}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEditUser(u)}><Pencil size={14} /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteUserHandler(u.id)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={userOpen} onOpenChange={setUserOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>{editingUser ? "تعديل مستخدم" : "إضافة مستخدم"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label>اسم المستخدم *</Label><Input value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} disabled={!!editingUser} className="mt-1 ltr-nums" /></div>
            <div><Label>الاسم الكامل *</Label><Input value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>{editingUser ? "كلمة المرور الجديدة" : "كلمة المرور *"}</Label><Input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>الدور *</Label>
              <Select value={userForm.role} onValueChange={v => setUserForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="admin">مدير</SelectItem><SelectItem value="manager">مشرف</SelectItem><SelectItem value="viewer">مشاهد</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={saveUser} disabled={createUser.isPending || updateUser.isPending}>{editingUser ? "حفظ" : "إضافة"}</Button>
            <Button variant="outline" onClick={() => setUserOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
