"use client";

import { useRiskStatus } from "@/hooks/useRiskStatus";
import { AlertTriangle } from "lucide-react";

export function RiskMeters() {
  const { status, loading } = useRiskStatus();
  if (loading || !status) return <div className="animate-pulse h-40 bg-white/5 rounded-xl w-full" />;

  const { rules } = status;

  const getMeterColor = (current: number, max: number) => {
    const ratio = max > 0 ? current / max : 0;
    if (current >= max) return 'bg-[#FF4757]';
    if (ratio >= 0.8) return 'bg-[#FF4757] animate-pulse';
    if (ratio >= 0.5) return 'bg-[#FFA502] animate-pulse';
    return 'bg-[#00D4AA]';
  };

  const getPercentage = (current: number, max: number) => {
    if (max === 0) return 0;
    return Math.min(100, (current / max) * 100);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      {/* 1. Daily Loss Meter */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 shadow-lg relative overflow-hidden">
        {status.dailyLossPct >= rules.maxDailyLossPct && (
          <div className="absolute inset-0 bg-[#FF4757]/10 animate-pulse pointer-events-none" />
        )}
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Today's Loss</h3>
        <div className="text-3xl font-mono font-bold text-white mb-4">
          -{status.dailyLossPct.toFixed(2)}%
        </div>
        
        <div className="h-2 w-full bg-[#0A0E1A] rounded overflow-hidden mb-2">
          <div 
            className={`h-full transition-all duration-1000 ${getMeterColor(status.dailyLossPct, rules.maxDailyLossPct)}`} 
            style={{ width: `${getPercentage(status.dailyLossPct, rules.maxDailyLossPct)}%` }} 
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 font-bold mb-4">
          <span>{status.dailyLossPct.toFixed(1)}% used</span>
          <span>{rules.maxDailyLossPct}% limit</span>
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider bg-[#1a2540] inline-block px-2 py-1 rounded">
          Resets at 00:00 WIB
        </div>
      </div>

      {/* 2. Weekly Loss Meter */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 shadow-lg relative overflow-hidden">
         {status.weeklyLossPct >= rules.maxWeeklyLossPct && (
          <div className="absolute inset-0 bg-[#FFA502]/10 animate-pulse pointer-events-none" />
        )}
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Weekly Loss</h3>
        <div className="text-3xl font-mono font-bold text-white mb-4">
          -{status.weeklyLossPct.toFixed(2)}%
        </div>
        
        <div className="h-2 w-full bg-[#0A0E1A] rounded overflow-hidden mb-2">
          <div 
            className={`h-full transition-all duration-1000 ${getMeterColor(status.weeklyLossPct, rules.maxWeeklyLossPct)}`} 
            style={{ width: `${getPercentage(status.weeklyLossPct, rules.maxWeeklyLossPct)}%` }} 
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 font-bold mb-4">
          <span>{status.weeklyLossPct.toFixed(1)}% used</span>
          <span>{rules.maxWeeklyLossPct}% limit</span>
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider bg-[#1a2540] inline-block px-2 py-1 rounded">
          Resets Monday 00:00 WIB
        </div>
      </div>

      {/* 3. Total Drawdown Meter */}
      <div className={`rounded-xl p-5 shadow-lg relative overflow-hidden transition-colors duration-500 ${status.drawdownPct >= rules.maxDrawdownPct ? 'bg-[#FF4757] border-[#FF4757] animate-pulse text-white' : 'bg-[#0E1628] border border-[#1a2540]'}`}>
        
        {status.drawdownPct >= rules.maxDrawdownPct ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
             <AlertTriangle className="w-10 h-10 text-white" />
             <div className="font-bold tracking-widest text-[#0A0E1A]">🚨 MAX DRAWDOWN REACHED 🚨</div>
             <p className="text-xs text-white/90">Evaluate your system before continuing. Mandatory 2-week review.</p>
          </div>
        ) : (
          <>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Peak-to-Trough Drawdown</h3>
            <div className={`text-3xl font-mono font-bold mb-4 ${status.drawdownPct > (rules.maxDrawdownPct * 0.8) ? 'text-[#FF4757]' : 'text-white'}`}>
              -{status.drawdownPct.toFixed(2)}%
            </div>
            
            <div className="h-2 w-full bg-[#0A0E1A] rounded overflow-hidden mb-2">
              <div 
                className={`h-full transition-all duration-1000 ${getMeterColor(status.drawdownPct, rules.maxDrawdownPct)}`} 
                style={{ width: `${getPercentage(status.drawdownPct, rules.maxDrawdownPct)}%` }} 
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 font-bold mb-4">
              <span>{status.drawdownPct.toFixed(1)}% active</span>
              <span>{rules.maxDrawdownPct}% critical threshold</span>
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider bg-[#1a2540] inline-block px-2 py-1 rounded">
              High water mark tracker
            </div>
          </>
        )}
      </div>

    </div>
  );
}
