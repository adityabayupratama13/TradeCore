import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CircuitBreakerBanner } from "../CircuitBreakerBanner";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0A0E1A] text-gray-100 flex font-sans">
      
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Wrapper */}
      <div className="flex-1 ml-[240px] flex flex-col relative">
        
        {/* Subtle dot grid pattern on the background */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `radial-gradient(#1a2540 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />

        {/* Top Header */}
        <TopBar />

        {/* Scrollable Page Content */}
        <main className="flex-1 pt-16 mt-0 z-10 p-6 overflow-y-auto min-h-screen">
          <CircuitBreakerBanner />
          <div className="max-w-[1600px] mx-auto mt-6">
            {children}
          </div>
        </main>
        
      </div>
    </div>
  );
}
