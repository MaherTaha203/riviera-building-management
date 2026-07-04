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
  Building2
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
            "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer text-sm font-medium",
            isActive 
              ? "bg-primary text-primary-foreground" 
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
        >
          <Icon size={18} />
          <span>{item.name}</span>
        </div>
      </Link>
    );
  };

  return (
    <div className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground shrink-0">
          <Building2 size={18} />
        </div>
        <div className="font-bold text-lg text-sidebar-foreground tracking-tight leading-tight">عمارة الريفييرا</div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin">
        <div className="space-y-1">
          {navItems.map((item) => <NavLink key={item.path} item={item} />)}
        </div>
        
        <div>
          <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">المالية</div>
          <div className="space-y-1">
            {financialItems.map((item) => <NavLink key={item.path} item={item} />)}
          </div>
        </div>
        
        <div>
          <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">الإدارة</div>
          <div className="space-y-1">
            {adminItems.map((item) => <NavLink key={item.path} item={item} />)}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border shrink-0 bg-sidebar-accent/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-sidebar-foreground font-bold text-sm">
            {user?.name?.charAt(0) || "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-semibold text-sidebar-foreground truncate">{user?.name || "المستخدم"}</div>
            <div className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role || "Admin"}</div>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
        >
          <LogOut size={16} />
          <span>تسجيل خروج</span>
        </button>
      </div>
    </div>
  );
}
