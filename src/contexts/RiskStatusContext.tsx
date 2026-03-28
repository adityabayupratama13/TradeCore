"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface RiskStatus {
  canTrade: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  reason: string | null;
  dailyLossPct: number;
  weeklyLossPct: number;
  drawdownPct: number;
  warnings: string[];
  rules: any;
  dailyProfitTarget?: number;
}

interface RiskContextType {
  status: RiskStatus | null;
  loading: boolean;
  refreshStatus: () => Promise<void>;
}

const RiskStatusContext = createContext<RiskContextType>({
  status: null,
  loading: true,
  refreshStatus: async () => {}
});

export function RiskStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RiskStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/risk/status?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch risk status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Poll every 60s
    return () => clearInterval(interval);
  }, []);

  return (
    <RiskStatusContext.Provider value={{ status, loading, refreshStatus: fetchStatus }}>
      {children}
    </RiskStatusContext.Provider>
  );
}

export const useRiskStatus = () => useContext(RiskStatusContext);
