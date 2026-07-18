import React from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { HeaderBar } from "./HeaderBar";
import { BottomNav } from "./BottomNav";
import { useGlobalShortcuts } from "@/lib/shortcuts";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [, navigate] = useLocation();
  useGlobalShortcuts(navigate);

  return (
    <div className="flex h-screen w-full rv-floor overflow-hidden">
      {/* Desktop sidebar — floating rounded panel with breathing room */}
      <div className="hidden lg:block h-full shrink-0 py-3 ps-3">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <HeaderBar />
        {/* Extra bottom padding on mobile so content clears the floating bottom nav */}
        <div className="flex-1 overflow-auto px-3 sm:px-5 pt-0 pb-24 lg:pb-5 scrollbar-thin">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile navigation — floating glossy-black bottom bar + fold-up "more" sheet */}
      <BottomNav />
    </div>
  );
}
