import { useState, useCallback, useEffect } from 'react';

export function usePerformanceData() {
  const [loading, setLoading] = useState(true);
  
  const [summary, setSummary] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rSum, rHeat, rBreak, rStats] = await Promise.all([
        fetch('/api/performance/summary'),
        fetch('/api/performance/heatmap?months=6'),
        fetch('/api/performance/breakdown'),
        fetch('/api/performance/statistics')
      ]);

      if (rSum.ok) setSummary(await rSum.json());
      if (rHeat.ok) setHeatmap(await rHeat.json());
      if (rBreak.ok) setBreakdown(await rBreak.json());
      if (rStats.ok) setStats(await rStats.json());

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { loading, summary, heatmap, breakdown, stats };
}
