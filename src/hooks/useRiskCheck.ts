import { useState, useCallback } from 'react';

export interface RiskCheckResponse {
  canTrade: boolean;
  reason: string | null;
  dailyLossPct: number;
  weeklyLossPct: number;
  drawdownPct: number;
  isLocked: boolean;
  lockedUntil: string | null;
  totalCapital: number;
}

export function useRiskCheck() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RiskCheckResponse | null>(null);

  const fetchRiskStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/risk/check');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        return json as RiskCheckResponse;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, data, fetchRiskStatus };
}
