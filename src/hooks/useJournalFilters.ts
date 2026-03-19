import { useState, useCallback, useEffect } from 'react';

export interface JournalFilters {
  startDate: string | null;
  endDate: string | null;
  emotion: string[];
  result: 'All' | 'WIN' | 'LOSS';
  ruleFollowed: 'All' | 'true' | 'false';
  marketType: 'All' | 'CRYPTO_FUTURES' | 'SAHAM_IDX';
}

export function useJournalFilters() {
  const [filters, setFilters] = useState<JournalFilters>({
    startDate: null,
    endDate: null,
    emotion: ['All'],
    result: 'All',
    ruleFollowed: 'All',
    marketType: 'All'
  });

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const setDateRange = (range: 'This Week' | 'This Month' | 'Last 3 Months' | 'All Time') => {
    const end = new Date();
    const start = new Date();
    
    if (range === 'This Week') {
      start.setDate(end.getDate() - 7);
    } else if (range === 'This Month') {
      start.setMonth(end.getMonth() - 1);
    } else if (range === 'Last 3 Months') {
      start.setMonth(end.getMonth() - 3);
    } else {
      setFilters(p => ({ ...p, startDate: null, endDate: null }));
      return;
    }
    
    setFilters(p => ({
      ...p,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    }));
  };

  const toggleEmotion = (emo: string) => {
    setFilters(p => {
      let e = [...p.emotion];
      if (emo === 'All') return { ...p, emotion: ['All'] };
      
      if (e.includes('All')) e = e.filter(i => i !== 'All');
      if (e.includes(emo)) e = e.filter(i => i !== emo);
      else e.push(emo);
      
      if (e.length === 0) e = ['All'];
      return { ...p, emotion: e };
    });
  };

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (!filters.emotion.includes('All')) params.append('emotion', filters.emotion.join(','));
      if (filters.result !== 'All') params.append('result', filters.result);
      if (filters.ruleFollowed !== 'All') params.append('ruleFollowed', filters.ruleFollowed);
      if (filters.marketType !== 'All') params.append('marketType', filters.marketType);

      const res = await fetch(`/api/journal?${params.toString()}`);
      if (res.ok) {
        setEntries(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return {
    filters,
    setFilters,
    setDateRange,
    toggleEmotion,
    entries,
    loading,
    refresh: fetchEntries
  };
}
