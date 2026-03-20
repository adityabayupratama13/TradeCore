"use client";

import { useRiskStatus } from "@/hooks/useRiskStatus";
import { AlertTriangle, CheckCircle, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function CircuitBreakerBanner() {
  const { status, loading } = useRiskStatus();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  const handleClearLock = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/risk/clear-lock', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('✅ Lock cleared! The dashboard will now reload.');
        window.location.reload();
      } else {
        alert('❌ Error clearing lock: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!status?.isLocked || !status.lockedUntil) return;

    const lockedDate = new Date(status.lockedUntil);
    
    const interval = setInterval(() => {
      const now = new Date();
      const diff = lockedDate.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft('00:00:00');
        return;
      }
      
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [status?.isLocked, status?.lockedUntil]);

  if (loading || !status) return <div className="h-10 bg-[#0E1628] animate-pulse w-full" />;

  const isWarning = status.warnings && status.warnings.length > 0 && !status.isLocked;

  if (status.isLocked) {
    return (
      <div className="w-full bg-[#FF4757]/10 border-2 border-[#FF4757] p-4 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4 z-50 text-center md:text-left">
        <div className="flex flex-col md:flex-row items-center gap-3 text-[#FF4757]">
          <Lock className="w-8 h-8 md:w-6 md:h-6 animate-pulse shrink-0" />
          <div>
            <div className="font-bold tracking-widest text-xl md:text-lg">TRADING LOCKED</div>
            <div className="text-sm opacity-90 mt-1 md:mt-0">{status.reason || 'Daily loss limit reached'}</div>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 w-full md:w-auto">
          <div className="text-center md:text-right w-full md:w-auto">
            <div className="font-mono font-bold text-2xl md:text-xl text-white">Unlocks in: {timeLeft}</div>
            <div className="text-xs text-[#FF4757]/80 mt-1 md:mt-0">Resumes at: {new Date(status.lockedUntil!).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
          <div className="flex flex-col w-full md:w-auto gap-2">
            <Link href="/journal" className="bg-[#FF4757] text-[#0A0E1A] font-bold px-6 py-3 md:py-2 rounded text-center hover:bg-[#FF4757]/80 transition-colors w-full">
              Review Journal
            </Link>
            <button
              onClick={handleClearLock}
              disabled={actionLoading}
              className="bg-transparent border border-[#FF4757] text-[#FF4757] font-bold px-6 py-3 md:py-2 rounded text-center hover:bg-[#FF4757]/10 transition-colors disabled:opacity-50 w-full"
            >
              🔓 Clear Lock (Manual Override)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isWarning) {
    return (
      <div className="w-full bg-[#FFA502]/10 border border-[#FFA502]/40 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-[#FFA502]">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFA502] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FFA502]"></span>
          </div>
          <span className="font-bold tracking-wider text-sm flex items-center gap-2">
            ⚠️ RISK WARNING — {status.warnings[0]}
          </span>
        </div>
      </div>
    );
  }

  // DEFAULT SAFE
  return (
    <div className="w-full bg-[#00D4AA]/5 border border-[#00D4AA]/20 px-6 py-3 flex items-center justify-between text-[#00D4AA]">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4" />
        <span className="font-bold text-xs tracking-widest">TRADING ACTIVE — All risk limits within safe range</span>
      </div>
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="bg-[#1a2540]/50 px-2 py-1 rounded">Dly: {status.dailyLossPct.toFixed(1)}%</span>
        <span className="bg-[#1a2540]/50 px-2 py-1 rounded">Wkly: {status.weeklyLossPct.toFixed(1)}%</span>
        <span className="bg-[#1a2540]/50 px-2 py-1 rounded">DD: {status.drawdownPct.toFixed(1)}%</span>
      </div>
    </div>
  );
}
