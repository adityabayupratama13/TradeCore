"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { formatUSD } from "@/lib/formatters";

export function RiskHistoryLog() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterType, setFilterType] = useState('ALL');

  const fetchEvents = async (p: number, t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/risk/events?page=${p}&type=${t}`);
      const data = await res.json();
      setEvents(data.events || []);
      setTotalPages(data.pages || 1);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(page, filterType);
  }, [page, filterType]);

  const eventTypes = ['ALL', 'DAILY_LOCK', 'WEEKLY_WARNING', 'DRAWDOWN_WARNING', 'TRADE_BLOCKED', 'RULES_UPDATED', 'LOCK_EXPIRED'];

  const getBadgeStyle = (type: string) => {
    switch(type) {
      case 'DAILY_LOCK': return 'bg-[#FF4757]/20 text-[#FF4757] border-[#FF4757]/30';
      case 'TRADE_BLOCKED': return 'bg-[#FF4757]/20 text-[#FF4757] border-[#FF4757]/30';
      case 'WEEKLY_WARNING': return 'bg-[#FFA502]/20 text-[#FFA502] border-[#FFA502]/30';
      case 'DRAWDOWN_WARNING': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
      case 'RULES_UPDATED': return 'bg-[#3d7fff]/20 text-[#3d7fff] border-[#3d7fff]/30';
      case 'LOCK_EXPIRED': return 'bg-[#00D4AA]/20 text-[#00D4AA] border-[#00D4AA]/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };



  return (
    <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl flex flex-col mt-6 overflow-hidden">
      
      <div className="p-5 border-b border-[#1a2540] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-white uppercase tracking-widest shrink-0">Risk History Log</h2>
        
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2 sm:pb-0 shrink-0">
          <Filter className="w-4 h-4 text-gray-400 shrink-0 mr-1" />
          {eventTypes.map(t => (
            <button 
              key={t}
              onClick={() => { setFilterType(t); setPage(1); }}
              className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 transition-colors border ${
                filterType === t ? 'bg-[#1a2540] text-white border-transparent' : 'bg-transparent text-gray-500 border-[#1a2540] hover:bg-[#1a2540]/50'
              }`}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#1a2540] text-gray-400 font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Event Type</th>
              <th className="p-4 w-full">Description</th>
              <th className="p-4 text-right">Capital</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a2540]">
            {loading ? (
              <tr><td colSpan={4} className="p-10 text-center"><div className="animate-pulse bg-white/5 h-8 w-full rounded" /></td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={4} className="p-10 text-center text-gray-500 font-bold tracking-widest uppercase">No Risk Events Recorded</td></tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="hover:bg-[#1a2540]/30 transition-colors group">
                  <td className="p-4">
                    <div className="font-bold text-white font-mono">{format(new Date(e.createdAt), "yyyy-MM-dd")}</div>
                    <div className="text-xs text-gray-500 font-mono">{format(new Date(e.createdAt), "HH:mm:ss 'WIB'")}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider border ${getBadgeStyle(e.eventType)}`}>
                      {e.eventType.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-gray-300 whitespace-normal min-w-[300px] text-xs leading-relaxed">
                    {e.description}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-gray-400">
                    {formatUSD(e.capitalAtEvent)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-[#1a2540] flex items-center justify-between text-xs text-gray-400 font-bold uppercase bg-[#0A0E1A]/50">
        <div>Page {page} of {totalPages === 0 ? 1 : totalPages}</div>
        <div className="flex gap-2">
          <button 
            disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="p-2 bg-[#1a2540] rounded disabled:opacity-50 hover:bg-[#1a2540]/80 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button 
            disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="p-2 bg-[#1a2540] rounded disabled:opacity-50 hover:bg-[#1a2540]/80 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

    </div>
  );
}
