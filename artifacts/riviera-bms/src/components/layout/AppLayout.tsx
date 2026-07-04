import React from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { HeaderBar } from "./HeaderBar";
import { useGlobalShortcuts } from "@/lib/shortcuts";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [, navigate] = useLocation();
  useGlobalShortcuts(navigate);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <HeaderBar />
        <div className="flex-1 overflow-auto p-6 scrollbar-thin">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
