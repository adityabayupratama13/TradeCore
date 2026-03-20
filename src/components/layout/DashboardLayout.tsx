"use client";

import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CircuitBreakerBanner } from "../CircuitBreakerBanner";

import { useSidebar } from "@/hooks/useSidebar";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isCollapsed, isMobileOpen, toggle, setIsMobileOpen } = useSidebar();

  return (
    <div 
      className="min-h-screen bg-[#0A0E1A] text-gray-100 flex font-sans"
      data-sidebar-collapsed={isCollapsed}
    >
      
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        isCollapsed={isCollapsed} 
        isMobileOpen={isMobileOpen} 
        toggle={toggle} 
      />

      {/* Main Content Wrapper */}
      <div 
        className="flex-1 flex flex-col relative transition-all duration-300 ease-in-out ml-0 md:ml-[var(--current-sidebar-width)] w-full overflow-hidden"
      >
        
        {/* Subtle dot grid pattern on the background */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `radial-gradient(#1a2540 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />

        {/* Top Header */}
        <TopBar onToggleSidebar={() => setIsMobileOpen(true)} isCollapsed={isCollapsed} />

        {/* Scrollable Page Content */}
        <main className="flex-1 pt-[var(--header-height)] z-10 p-3 md:p-6 overflow-y-auto min-h-screen w-full">
          <div className="w-full">
            <CircuitBreakerBanner />
          </div>
          <div className="max-w-[1600px] mx-auto mt-6">
            {children}
          </div>
        </main>
        
      </div>
    </div>
  );
}
