"use client";

import { usePathname } from "next/navigation";
import { formatUSD, formatPnL } from '@/lib/formatters';
import { useEffect, useState } from "react";
import { getModeConfig } from "@/lib/tradingModes";

// Helper to determine day of week and hour
const checkMarketStatus = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  // Monday = 1, Friday = 5
  if (day >= 1 && day <= 5) {
    if (hour >= 9 && hour < 16) {
      return { open: true, text: "IDX OPEN", color: "text-[#00D4AA] bg-[#00D4AA]/10 border-[#00D4AA]/20" };
    }
  }
  return { open: false, text: "IDX CLOSED", color: "text-[#FF4757] bg-[#FF4757]/10 border-[#FF4757]/20" };
};

interface TopBarProps {
  onToggleSidebar?: () => void;
  isCollapsed?: boolean;
}

export function TopBar({ onToggleSidebar, isCollapsed }: TopBarProps) {
  const pathname = usePathname();
  const [marketStatus, setMarketStatus] = useState(checkMarketStatus());

  // In a real app, these values would come from context or SWR/RQ hooks
  const [statusData, setStatusData] = useState({
    totalCapital: 0,
    dailyPnl: 0,
    dailyPnlPct: 0,
    dailyLossUsed: 0,
    dailyLossLimit: 10,
    isLocked: false,
    lockedUntil: null as string | null,
    drawdownPct: 0,
    riskStatus: 'SAFE',
    activeMode: 'SAFE',
    engineVersion: 'v1'
  });

  useEffect(() => {
    // Keep market status updated
    const interval = setInterval(() => {
      setMarketStatus(checkMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = () => {
    Promise.all([
      fetch('/api/portfolio').then(res => res.json()),
      fetch('/api/performance/today').then(res => res.json()),
      fetch('/api/risk/status').then(res => res.json()),
      fetch('/api/engine/version').then(res => res.json())
    ]).then(([portfolio, perf, risk, engine]) => {
      setStatusData({
        totalCapital: portfolio?.totalCapital || 0,
        dailyPnl: perf?.dailyPnl || 0,
        dailyPnlPct: perf?.dailyPnlPct || 0,
        dailyLossUsed: perf?.dailyLossUsed || 0,
        dailyLossLimit: perf?.dailyLossLimit || 10,
        isLocked: perf?.isLocked || false,
        lockedUntil: perf?.lockedUntil || null,
        drawdownPct: risk?.drawdownPct || 0,
        riskStatus: perf?.isLocked ? 'LOCKED' : (risk?.status || 'SAFE'),
        activeMode: risk?.rules?.activeMode || 'SAFE',
        engineVersion: engine?.version || 'v1'
      });
    }).catch(console.error);
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh setiap 30 detik agar Today P&L dan Capital selalu update
    const refreshInterval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(refreshInterval);
  }, []);


  const getPageTitle = (path: string) => {
    if (path === "/") return "Dashboard";
    const segment = path.split('/')[1];
    if (segment) {
      return segment.charAt(0).toUpperCase() + segment.slice(1).replace("-", " ");
    }
    return "TradeCore";
  };

  const activeModeData = getModeConfig(statusData.activeMode);

  return (
    <div className="fixed top-0 left-0 right-0 h-[var(--header-height,60px)] bg-[#0E1628]/95 backdrop-blur z-[100] border-b border-[#1a2540] flex items-center justify-between px-4 md:px-6 transition-all duration-300">
      
      {/* MOBILE LEFT: Hamburger */}
      <button onClick={onToggleSidebar} className="md:hidden text-white p-2 -ml-2">
        <svg fill="currentColor" viewBox="0 0 20 20" className="w-6 h-6"><path fillRule="evenodd" d="M3 5h14a1 1 0 110 2H3a1 1 0 010-2zM3 10h14a1 1 0 110 2H3a1 1 0 010-2zM3 15h14a1 1 0 110 2H3a1 1 0 010-2z" clipRule="evenodd" /></svg>
      </button>

      {/* FULL WIDTH CENTER/LEFT: Logo */}
      <div className="font-bold tracking-wider text-white text-md absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0 flex items-center gap-2 pointer-events-none md:pointer-events-auto md:w-[240px]">
         <span className="text-[#00D4AA]">⬡</span>
         TRADE CORE
      </div>

      {/* DESKTOP Title (Optional, hidden on mobile) */}
      <div className="hidden md:flex flex-1 pl-4 border-l border-[#1a2540]/30 ml-4">
        <h1 className="text-lg font-semibold text-white">
          {getPageTitle(pathname)}
        </h1>
      </div>

      {/* Status Chips */}
      <div className="flex items-center gap-2 md:gap-4 flex-none ml-auto">
        
        {/* Total Capital */}
        <div className="hidden md:flex flex-col text-right">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total Capital</span>
          <span className="text-sm font-mono text-white font-medium">{formatUSD(statusData.totalCapital)}</span>
        </div>

        <div className="hidden md:block w-[1px] h-8 bg-[#1a2540]" />

        {/* Today P&L */}
        <div className="hidden md:flex flex-col text-right">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Today P&L</span>
          <span className={`text-sm font-mono font-medium ${statusData.dailyPnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4757]"}`}>
             {formatPnL(statusData.dailyPnl)}
          </span>
        </div>

        <div className="hidden md:block w-[1px] h-8 bg-[#1a2540]" />

        {/* Drawdown */}
        <div className="hidden md:flex flex-col items-center gap-1 w-24">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider w-full text-center">Drawdown</span>
          <div className="w-full bg-[#0A0E1A] h-1.5 rounded-full overflow-hidden flex items-center">
            <div 
              className={`h-full ${statusData.drawdownPct > 10 ? 'bg-[#FF4757]' : 'bg-[#FFA502]'}`}
              style={{ width: `${Math.min(statusData.drawdownPct, 100)}%` }}
            />
          </div>
        </div>

        <div className="hidden md:block w-[1px] h-8 bg-[#1a2540]" />

        {/* Trading Mode */}
        <div className="flex flex-col text-right cursor-pointer" onClick={() => window.location.href='/risk'}>
          <span className="hidden md:block text-[10px] text-gray-400 font-medium uppercase tracking-wider">Risk Mode</span>
          <div className="text-[10px] md:text-[11px] px-2 py-0.5 md:mt-0.5 rounded font-bold tracking-widest text-center" 
               style={{ 
                 color: activeModeData.color, 
                 backgroundColor: activeModeData.color + '20' 
               }}>
            {activeModeData.badge}
          </div>
        </div>

        <div className="hidden md:block w-[1px] h-8 bg-[#1a2540]" />

        {/* Engine Version */}
        <div className="flex flex-col text-right cursor-pointer" onClick={async () => {
          const cycle: Record<string, string> = { v1: 'v2', v2: 'v3', v3: 'v4', v4: 'v1' };
          const newV = cycle[statusData.engineVersion] || 'v1';
          setStatusData({...statusData, engineVersion: newV});
          await fetch('/api/engine/version', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({version: newV}) 
          });
        }}>
          <span className="hidden md:block text-[10px] text-gray-400 font-medium uppercase tracking-wider">AI Engine</span>
          <div className="text-[10px] md:text-[11px] px-2 py-0.5 md:mt-0.5 rounded font-bold tracking-widest text-center hover:bg-opacity-40 transition-all border border-transparent" 
               style={{ 
                 color: statusData.engineVersion === 'v3' ? '#10b981' : statusData.engineVersion === 'v2' ? '#a855f7' : '#3b82f6', 
                 backgroundColor: statusData.engineVersion === 'v3' ? 'rgba(16, 185, 129, 0.15)' : statusData.engineVersion === 'v2' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
               }}>
            {statusData.engineVersion === 'v3' ? '🎯 V3 (SNIPER)' : statusData.engineVersion === 'v2' ? '🚀 V2 (SMC)' : '⚡ V1 (CLASSIC)'}
          </div>
        </div>

        <div className="hidden md:block w-[1px] h-8 bg-[#1a2540]" />

        {/* Risk Status */}
        <div className="flex flex-col text-right">
          <span className="hidden md:block text-[10px] text-gray-400 font-medium uppercase tracking-wider">Risk Status</span>
          <div className={`text-[10px] md:text-[11px] px-2 py-0.5 md:mt-0.5 rounded font-bold tracking-widest text-center ${
            statusData.riskStatus === 'SAFE' ? 'text-[#00D4AA] bg-[#00D4AA]/10' :
            statusData.riskStatus === 'WARNING' ? 'text-[#FFA502] bg-[#FFA502]/10' :
            'text-[#FF4757] bg-[#FF4757]/10'
          }`}>
            {statusData.riskStatus}
          </div>
        </div>
      </div>

      {/* Market Badges */}
      <div className="hidden md:flex flex-1 justify-end gap-3">
        <div className={`px-2 py-1 flex items-center gap-1.5 rounded border text-[11px] font-bold tracking-wider ${marketStatus.color}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          {marketStatus.text}
        </div>
        <div className="px-2 py-1 flex items-center gap-1.5 rounded border border-[#00D4AA]/20 bg-[#00D4AA]/10 text-[#00D4AA] text-[11px] font-bold tracking-wider">
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
          CRYPTO 24/7
        </div>
      </div>

    </div>
  );
}
