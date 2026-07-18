import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
  LayoutGrid,
} from "lucide-react";
import { getUser, clearToken } from "@/lib/auth";

type Item = { name: string; path: string; icon: any };

// The four primary destinations shown directly in the bottom bar. Everything
// else lives one tap away behind "المزيد" (the fold-up sheet).
const primaryItems: Item[] = [
  { name: "الرئيسية", path: "/dashboard", icon: LayoutDashboard },
  { name: "الوحدات", path: "/units", icon: Home },
  { name: "المستأجرون", path: "/tenants", icon: Users },
  { name: "القبض", path: "/receipt-vouchers", icon: Receipt },
];

const moreGroups: { label: string; items: Item[] }[] = [
  {
    label: "الرئيسية",
    items: [
      { name: "لوحة التحكم", path: "/dashboard", icon: LayoutDashboard },
      { name: "الوحدات", path: "/units", icon: Home },
      { name: "المستأجرون", path: "/tenants", icon: Users },
      { name: "العقود", path: "/contracts", icon: FileText },
    ],
  },
  {
    label: "المالية",
    items: [
      { name: "سندات القبض", path: "/receipt-vouchers", icon: Receipt },
      { name: "سندات الصرف", path: "/payment-vouchers", icon: CreditCard },
      { name: "الصندوق", path: "/cash-fund", icon: Wallet },
      { name: "الحسابات البنكية", path: "/bank-accounts", icon: Landmark },
      { name: "الشيكات", path: "/cheques", icon: Files },
      { name: "كشف الحساب", path: "/account-statements", icon: ScrollText },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { name: "المستندات", path: "/documents", icon: FileBox },
      { name: "التقارير", path: "/reports", icon: BarChart3 },
      { name: "سجل التدقيق", path: "/audit-log", icon: History },
      { name: "الإعدادات", path: "/settings", icon: Settings },
    ],
  },
];

const isActivePath = (location: string, path: string) =>
  location === path || location.startsWith(`${path}/`);

/**
 * Mobile navigation (< lg). A floating glossy-black bottom bar with the four
 * primary destinations plus a "المزيد" button that folds up a bottom sheet
 * containing every page — matching the bottom-nav pattern of leading Arabic
 * business apps. Desktop keeps the full side sidebar untouched.
 */
export function BottomNav() {
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const user = getUser();
  const initial = (user?.name || user?.username || "U").charAt(0);

  // "المزيد" is highlighted whenever the current route isn't one of the four
  // primary tabs (i.e. it lives inside the fold-up sheet).
  const onPrimary = primaryItems.some((it) => isActivePath(location, it.path));

  const handleLogout = () => {
    setMoreOpen(false);
    clearToken();
    setLocation("/login");
  };

  const go = () => setMoreOpen(false);

  return (
    <>
      {/* Floating bottom bar — mobile/tablet only */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1"
        aria-label="التنقل"
      >
        <div className="rv-bar ring-1 ring-white/5 shadow-lg rounded-[22px] h-[62px] flex items-stretch justify-around px-1.5">
          {primaryItems.map((item) => {
            const active = isActivePath(location, item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 w-[62px] rounded-[16px] transition-colors cursor-pointer select-none",
                    active ? "text-secondary" : "text-white/70",
                  )}
                >
                  <Icon size={21} className={active ? "text-secondary" : ""} />
                  <span className="text-[10px] font-semibold leading-none">{item.name}</span>
                </div>
              </Link>
            );
          })}

          {/* More — folds up the full sheet */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 w-[62px] rounded-[16px] transition-colors select-none",
              !onPrimary ? "text-secondary" : "text-white/70",
            )}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <LayoutGrid size={21} className={!onPrimary ? "text-secondary" : ""} />
            <span className="text-[10px] font-semibold leading-none">المزيد</span>
          </button>
        </div>
      </nav>

      {/* Fold-up sheet with every page, grouped */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="lg:hidden rv-bar text-sidebar-foreground border-0 rounded-t-[26px] p-0 max-h-[85vh] overflow-y-auto scrollbar-none [&>button]:text-white/60 [&>button]:top-5 [&>button]:right-5"
        >
          <SheetTitle className="sr-only">قائمة التنقّل</SheetTitle>

          {/* grabber + profile */}
          <div className="pt-3 flex flex-col items-center">
            <span className="w-10 h-1 rounded-full bg-white/20" aria-hidden="true" />
          </div>
          <div className="px-5 pt-3 pb-1 flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-[17px] font-extrabold ring-4 ring-white/10 shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(158 62% 56%), hsl(158 66% 42%))", color: "hsl(158 60% 12%)" }}
            >
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-white truncate">{user?.name || user?.username || "المستخدم"}</div>
              <div className="text-[11px] text-white/55 capitalize">{user?.role || "admin"}</div>
            </div>
          </div>

          <div className="px-4 pt-2 pb-5 space-y-4">
            {moreGroups.map((group) => (
              <div key={group.label}>
                <div className="px-1.5 mb-2 text-[10.5px] font-bold text-white/45 tracking-[0.14em]">{group.label}</div>
                <div className="grid grid-cols-3 gap-2">
                  {group.items.map((item) => {
                    const active = isActivePath(location, item.path);
                    const Icon = item.icon;
                    return (
                      <Link key={item.path} href={item.path}>
                        <div
                          onClick={go}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-[16px] text-center transition-colors cursor-pointer select-none",
                            active
                              ? "bg-white/[0.14] text-white ring-1 ring-white/10"
                              : "bg-white/[0.04] text-white/80 hover:bg-white/[0.08]",
                          )}
                        >
                          <Icon size={20} className={active ? "text-secondary" : "text-white/70"} />
                          <span className="text-[11px] font-medium leading-tight">{item.name}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 text-[13px] font-semibold text-white/85 bg-white/[0.06] hover:bg-white/[0.12] rounded-[16px] transition-colors"
            >
              <LogOut size={16} />
              <span>تسجيل خروج</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
