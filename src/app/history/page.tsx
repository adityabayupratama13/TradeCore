"use client";

import { useState, useEffect } from "react";
import { Clock, Download, Search, Filter } from "lucide-react";
import { format } from "date-fns";
import { formatUSD, formatPnL } from "@/lib/formatters";

export default function HistoryPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/trades')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTrades(data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 w-full max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00D4AA]/10 rounded-lg">
             <Clock className="w-6 h-6 text-[#00D4AA]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white">Trade History</h2>
            <p className="text-sm text-gray-400">Complete ledger of all active and closed executions</p>
          </div>
        </div>
      </div>

      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl flex flex-col min-h-[500px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1a2540] text-gray-400 font-bold uppercase tracking-wider text-xs whitespace-nowrap">
              <tr>
                <th className="p-4 pl-6 rounded-tl-xl">Symbol</th>
                <th className="p-4">Type</th>
                <th className="p-4">Engine</th>
                <th className="p-4">Status</th>
                <th className="p-4">Entry</th>
                <th className="p-4">Exit</th>
                <th className="p-4 text-right">Net P&L (IDR)</th>
                <th className="p-4 text-right">% Return</th>
                <th className="p-4 text-right rounded-tr-xl pr-6">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2540]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-gray-400">Loading ledger...</td>
                </tr>
              ) : trades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-gray-500 font-medium">No trades recorded yet.</td>
                </tr>
              ) : (
                trades.map((t) => {
                  const isLong = t.direction === 'LONG' || t.direction === 'BUY';
                  const isWin = t.pnlPct && t.pnlPct > 0;
                  const isLoss = t.pnlPct && t.pnlPct < 0;

                  let durationStr = "—";
                  if (t.entryAt && t.exitAt) {
                    const diffMs = new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime();
                    const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const h = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    if (d > 0) durationStr = `${d}d ${h}h`;
                    else if (h > 0) durationStr = `${h}h ${m}m`;
                    else durationStr = `${m}m`;
                  }

                  return (
                    <tr key={t.id} className="hover:bg-[#1a2540]/30 transition-colors whitespace-nowrap">
                      <td className="p-4 pl-6 font-bold text-white">
                        <div className="flex items-center gap-2">
                           <div className={`w-2 h-2 rounded-full ${t.marketType==='CRYPTO_FUTURES' ? 'bg-[#F3BA2F]' : 'bg-blue-500'}`} />
                           {t.symbol}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${isLong ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                           {t.direction} {t.leverage}x
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold border border-transparent ${
                          t.engineVersion === 'v3' ? 'bg-[#10b981]/15 text-[#10b981]' : t.engineVersion === 'v2' ? 'bg-[#a855f7]/15 text-[#a855f7]' : 'bg-[#3b82f6]/15 text-[#3b82f6]'
                        }`}>
                          {t.engineVersion === 'v3' ? '🎯 V3' : t.engineVersion === 'v2' ? '🚀 V2' : '⚡ V1'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${t.status === 'OPEN' ? 'bg-[#3d7fff]/20 text-[#3d7fff]' : 'bg-gray-800 text-gray-300'}`}>
                           {t.status}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-gray-300">
                         {t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 5 })}
                         <div className="text-xs text-gray-500 font-sans mt-1">
                           {format(new Date(t.entryAt), "MMM dd HH:mm")}
                         </div>
                      </td>
                      <td className="p-4 font-mono text-gray-300">
                         {t.exitPrice ? t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 5 }) : '—'}
                         {t.exitAt && (
                           <div className="text-xs text-gray-500 font-sans mt-1">
                             {format(new Date(t.exitAt), "MMM dd HH:mm")}
                           </div>
                         )}
                      </td>
                      <td className={`p-4 text-right font-mono font-bold ${isWin ? 'text-[#00D4AA]' : isLoss ? 'text-[#FF4757]' : 'text-gray-400'}`}>
                         {t.status === 'CLOSED' ? formatPnL(t.pnl || 0) : '—'}
                      </td>
                      <td className={`p-4 text-right font-mono font-bold ${isWin ? 'text-[#00D4AA]' : isLoss ? 'text-[#FF4757]' : 'text-gray-400'}`}>
                         {t.status === 'CLOSED' && t.pnlPct !== null ? (t.pnlPct > 0 ? '+' : '') + t.pnlPct.toFixed(2) + '%' : '—'}
                      </td>
                      <td className="p-4 pr-6 text-right font-mono text-gray-400">
                         {durationStr}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
