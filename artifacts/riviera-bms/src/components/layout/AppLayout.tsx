import React, { useState } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { HeaderBar } from "./HeaderBar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useGlobalShortcuts } from "@/lib/shortcuts";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [, navigate] = useLocation();
  useGlobalShortcuts(navigate);
  // Mobile navigation drawer (< lg). Desktop keeps the fixed sidebar untouched.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block h-full shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar drawer — same Sidebar component, slides from the right (RTL) */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="right" className="w-64 max-w-[80vw] p-0 border-0 lg:hidden [&>button]:left-4 [&>button]:right-auto [&>button]:text-sidebar-foreground [&>button]:bg-transparent [&>button]:opacity-90">
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <HeaderBar onMenuClick={() => setMobileNavOpen(true)} />
        <div className="flex-1 overflow-auto p-4 sm:p-6 scrollbar-thin">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
