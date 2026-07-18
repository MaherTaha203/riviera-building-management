import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Home,
  Users,
  FileText,
  Receipt,
  CreditCard,
  Wallet,
  Landmark,
  Files,
  ScrollText,
  FileBox,
  BarChart3,
  History,
  Settings,
  LogOut,
  Building2,
} from "lucide-react";
import { getUser, clearToken } from "@/lib/auth";

const navItems = [
  { name: "لوحة التحكم", path: "/dashboard", icon: LayoutDashboard },
  { name: "الوحدات", path: "/units", icon: Home },
  { name: "المستأجرون", path: "/tenants", icon: Users },
  { name: "العقود", path: "/contracts", icon: FileText },
];

const financialItems = [
  { name: "سندات القبض", path: "/receipt-vouchers", icon: Receipt },
  { name: "سندات الصرف", path: "/payment-vouchers", icon: CreditCard },
  { name: "الصندوق", path: "/cash-fund", icon: Wallet },
  { name: "الحسابات البنكية", path: "/bank-accounts", icon: Landmark },
  { name: "الشيكات", path: "/cheques", icon: Files },
  { name: "كشف الحساب", path: "/account-statements", icon: ScrollText },
];

const adminItems = [
  { name: "المستندات", path: "/documents", icon: FileBox },
  { name: "التقارير", path: "/reports", icon: BarChart3 },
  { name: "سجل التدقيق", path: "/audit-log", icon: History },
  { name: "الإعدادات", path: "/settings", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location, setLocation] = useLocation();
  const user = getUser();
  const initial = (user?.name || user?.username || "U").charAt(0);

  const handleLogout = () => {
    clearToken();
    setLocation("/login");
  };

  const NavLink = ({ item }: { item: any }) => {
    const isActive = location === item.path || location.startsWith(`${item.path}/`);
    const Icon = item.icon;
    return (
      <Link href={item.path}>
        <div
          onClick={onNavigate}
          className={cn(
            "group relative flex items-center gap-3 px-3.5 py-[7px] rounded-[12px] transition-all cursor-pointer text-[13px] font-medium",
            isActive
              ? "bg-white/[0.14] text-white shadow-sm"
              : "text-sidebar-foreground/75 hover:bg-white/[0.07] hover:text-white",
          )}
        >
          {/* mint accent tab on the active item (reference cue) */}
          <span
            className={cn(
              "absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-secondary transition-opacity",
              isActive ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          />
          <Icon size={18} className={cn("shrink-0", isActive ? "text-secondary" : "")} />
          <span className="truncate">{item.name}</span>
        </div>
      </Link>
    );
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-3.5 mb-1 mt-0.5 text-[10px] font-bold text-sidebar-foreground/45 tracking-[0.14em]">{children}</div>
  );

  return (
    <div className="w-[244px] h-full rv-bar text-sidebar-foreground rounded-[22px] shadow-lg ring-1 ring-white/5 flex flex-col overflow-hidden shrink-0">
      {/* Brand */}
      <div className="pt-4 px-5 flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 bg-white/12 rounded-xl flex items-center justify-center text-sidebar-foreground shrink-0">
          <Building2 size={17} />
        </div>
        <div className="font-extrabold text-[15px] tracking-tight leading-tight">عمارة الريفييرا</div>
      </div>

      {/* Profile block — avatar-first, echoing the reference sidebar */}
      <div className="mt-3 mb-1 px-5 flex flex-col items-center text-center shrink-0">
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[19px] font-extrabold ring-4 ring-white/10"
          style={{ background: "linear-gradient(135deg, hsl(158 62% 56%), hsl(158 66% 42%))", color: "hsl(158 60% 12%)" }}
        >
          {initial}
        </div>
        <div className="mt-2 text-[13.5px] font-bold text-white leading-tight">{user?.name || user?.username || "المستخدم"}</div>
        <div className="text-[10.5px] text-sidebar-foreground/55 capitalize mt-0.5">{user?.role || "admin"}</div>
      </div>

      {/* Navigation — compact so all items fit; scrollbar hidden (no down-arrow) */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2.5 px-3 space-y-2.5 scrollbar-none">
        <div className="space-y-0.5">
          {navItems.map((item) => <NavLink key={item.path} item={item} />)}
        </div>
        <div>
          <SectionLabel>المالية</SectionLabel>
          <div className="space-y-0.5">
            {financialItems.map((item) => <NavLink key={item.path} item={item} />)}
          </div>
        </div>
        <div>
          <SectionLabel>الإدارة</SectionLabel>
          <div className="space-y-0.5">
            {adminItems.map((item) => <NavLink key={item.path} item={item} />)}
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="p-2.5 shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12.5px] font-medium text-white/85 bg-white/[0.06] hover:bg-white/[0.12] rounded-[12px] transition-colors"
        >
          <LogOut size={15} />
          <span>تسجيل خروج</span>
        </button>
      </div>
    </div>
  );
}
