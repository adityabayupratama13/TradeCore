"use client";

import { usePathname } from "next/navigation";
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

export function TopBar() {
  const pathname = usePathname();
  const [marketStatus, setMarketStatus] = useState(checkMarketStatus());

  // In a real app, these values would come from context or SWR/RQ hooks
  const [statusData, setStatusData] = useState({
    totalCapital: 0,
    todayPnl: 0,
    todayPnlPct: 0,
    drawdownPct: 0,
    riskStatus: 'SAFE',
    activeMode: 'SAFE'
  });

  useEffect(() => {
    // Keep market status updated
    const interval = setInterval(() => {
      setMarketStatus(checkMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch top bar statuses
    Promise.all([
      fetch('/api/portfolio').then(res => res.json()),
      fetch('/api/performance/today').then(res => res.json()),
      fetch('/api/risk/status').then(res => res.json())
    ]).then(([portfolio, perf, risk]) => {
      setStatusData({
        totalCapital: portfolio?.totalCapital || 0,
        todayPnl: perf?.dailyPnl || 0,
        todayPnlPct: perf?.winRate || 0, // Using win rate as placeholder if pct not available
        drawdownPct: risk?.drawdownPct || 0,
        riskStatus: risk?.status || 'SAFE',
        activeMode: risk?.rules?.activeMode || 'SAFE'
      });
    }).catch(console.error);
  }, []);

  // Format currency
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val);
  };

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
    <div className="fixed top-0 left-[240px] right-0 h-16 bg-[#0E1628]/95 backdrop-blur z-10 border-b border-[#1a2540] flex items-center justify-between px-6">
      
      {/* Title */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-white">
          {getPageTitle(pathname)}
        </h1>
      </div>

      {/* Status Chips */}
      <div className="flex items-center gap-4 flex-none">
        
        {/* Total Capital */}
        <div className="flex flex-col text-right">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total Capital</span>
          <span className="text-sm font-mono text-white font-medium">{formatIDR(statusData.totalCapital)}</span>
        </div>

        <div className="w-[1px] h-8 bg-[#1a2540]" />

        {/* Today P&L */}
        <div className="flex flex-col text-right">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Today P&L</span>
          <span className={`text-sm font-mono font-medium ${statusData.todayPnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4757]"}`}>
            {statusData.todayPnl >= 0 ? "+" : ""}{formatIDR(statusData.todayPnl)}
          </span>
        </div>

        <div className="w-[1px] h-8 bg-[#1a2540]" />

        {/* Drawdown */}
        <div className="flex flex-col items-center gap-1 w-24">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider w-full text-center">Drawdown</span>
          <div className="w-full bg-[#0A0E1A] h-1.5 rounded-full overflow-hidden flex items-center">
            <div 
              className={`h-full ${statusData.drawdownPct > 10 ? 'bg-[#FF4757]' : 'bg-[#FFA502]'}`}
              style={{ width: `${Math.min(statusData.drawdownPct, 100)}%` }}
            />
          </div>
        </div>

        <div className="w-[1px] h-8 bg-[#1a2540]" />

        {/* Trading Mode */}
        <div className="flex flex-col text-right cursor-pointer" onClick={() => window.location.href='/risk'}>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Mode</span>
          <div className="text-[11px] px-2 py-0.5 mt-0.5 rounded font-bold tracking-widest text-center" 
               style={{ 
                 color: activeModeData.color, 
                 backgroundColor: activeModeData.color + '20' 
               }}>
            {activeModeData.badge}
          </div>
        </div>

        <div className="w-[1px] h-8 bg-[#1a2540]" />

        {/* Risk Status */}
        <div className="flex flex-col text-right">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Risk Status</span>
          <div className={`text-[11px] px-2 py-0.5 mt-0.5 rounded font-bold tracking-widest text-center ${
            statusData.riskStatus === 'SAFE' ? 'text-[#00D4AA] bg-[#00D4AA]/10' :
            statusData.riskStatus === 'WARNING' ? 'text-[#FFA502] bg-[#FFA502]/10' :
            'text-[#FF4757] bg-[#FF4757]/10'
          }`}>
            {statusData.riskStatus}
          </div>
        </div>
      </div>

      {/* Market Badges */}
      <div className="flex-1 flex justify-end gap-3">
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
