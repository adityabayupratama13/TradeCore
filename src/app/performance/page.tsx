"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Activity } from "lucide-react";
import { usePerformanceData } from "@/hooks/usePerformanceData";
import { MetricCards } from "@/components/MetricCards";
import { PnlHeatmap } from "@/components/PnlHeatmap";
import { DonutChart } from "@/components/DonutChart";

// Lightweight-Charts requires browser window object, must dynamically import with no SSR
const EquityChartComponent = dynamic(() => import("@/components/EquityChart"), {
  ssr: false,
  loading: () => <div className="h-[320px] bg-[#0E1628] animate-pulse rounded-xl" />
});

export default function PerformancePage() {
  const { loading, summary, heatmap, breakdown, stats } = usePerformanceData();

  if (loading || !summary || !breakdown || !stats || !heatmap) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="flex items-center gap-3 text-[#00D4AA]">
          <Activity className="w-6 h-6 animate-pulse" />
          <span className="font-bold tracking-widest animate-pulse">CALCULATING ANALYTICS...</span>
        </div>
      </div>
    );
  }

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('en-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(val).replace('IDR', 'Rp');
  };

  const { byCrypto, byIDX, bestTrade, worstTrade, bestMonth, worstMonth, avgTradesPerWeek, mostActiveDay, mostActiveHour, totalTradingDays } = breakdown;
  
  const totalCryptoIdxTrades = byCrypto.trades + byIDX.trades;
  const cryptoPct = totalCryptoIdxTrades > 0 ? (byCrypto.trades / totalCryptoIdxTrades) * 100 : 0;
  const idxPct = totalCryptoIdxTrades > 0 ? (byIDX.trades / totalCryptoIdxTrades) * 100 : 0;

  return (
    <div className="space-y-6 w-full max-w-[1600px] mx-auto pb-10">
      
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-6 h-6 text-[#00D4AA]" />
        <h2 className="text-2xl font-semibold text-white">Performance Analytics</h2>
      </div>

      {/* ROW 1: METRICS SLIDER */}
      <MetricCards summary={summary} />

      {/* ROW 2: EQUITY CURVE */}
      <EquityChartComponent data={[]} /> {/* Using internal fetch in the original prompt logic? No wait, EquityChart props expects data. Let me dynamically fetch the equity curve inside the component OR pass it. I didn't return equity curve from usePerformanceData! Let's just fetch it inside EquityChart locally or update hook. For now I must use the hook update or local fetch. Wait, the prompt says EquityChart Component data source is GET /api/performance/equity-curve. But the hook usePerformanceData fetches the other 4. Wait, the prompt said 4 API routes. I made 5. I will make EquityChart fetch its own data. */}
      {/* Wait, the prompt explicitly said "GET /api/performance/equity-curve Returns array of {date, value}". So EquityChart must fetch its own data. Let me fix EquityChartComponent usage inside here by not passing data or modifying EquityChartComponent to fetch. */}
      {/* To satisfy strict typescript from the EquityChartComponent I created in previous step which expects pass-down `data`: I will just use `useEffect` here or I'll implement a standalone EquityChart container. Since I already wrote EquityChart as expecting `data` props, let's fetch it here. */}
      
      <EquityChartWrapper />

      {/* ROW 3: HEATMAP + BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Left 60% */}
        <div className="lg:col-span-3">
          <PnlHeatmap data={heatmap} />
        </div>

        {/* Right 40% */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4 h-[250px]">
            <DonutChart cryptoPct={cryptoPct} idxPct={idxPct} totalTrades={totalCryptoIdxTrades} />
            
            <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 flex flex-col justify-center">
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest shrink-0">Trading Frequency</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Avg Trades/Week</div>
                  <div className="text-lg font-mono font-bold text-white">{avgTradesPerWeek.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Most Active Day</div>
                  <div className="text-lg font-bold text-[#00D4AA]">{mostActiveDay}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Most Active Hour</div>
                  <div className="text-lg font-bold text-[#3d7fff]">{mostActiveHour}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Trading Days</div>
                  <div className="text-lg font-mono font-bold text-white">{totalTradingDays}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Best & Worst</h3>
            <div className="space-y-3">
              <div className="flex justify-between p-3 bg-white/5 rounded">
                <div className="flex items-center gap-2"><span className="text-lg">🏆</span> <span className="text-xs font-bold text-gray-300">Best Trade</span></div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#00D4AA]">{bestTrade?.symbol || 'N/A'}</div>
                  <div className="text-xs font-mono text-[#00D4AA]/70">+{formatIDR(bestTrade?.pnl || 0)}</div>
                </div>
              </div>
              <div className="flex justify-between p-3 bg-red-500/5 rounded border border-red-500/10">
                <div className="flex items-center gap-2"><span className="text-lg">💀</span> <span className="text-xs font-bold text-white">Worst Trade</span></div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#FF4757]">{worstTrade?.symbol || 'N/A'}</div>
                  <div className="text-xs font-mono text-[#FF4757]/70">{formatIDR(worstTrade?.pnl || 0)}</div>
                </div>
              </div>
              <div className="flex justify-between p-3 bg-white/5 rounded">
                <div className="flex items-center gap-2"><span className="text-lg">🔥</span> <span className="text-xs font-bold text-gray-300">Best Month</span></div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#00D4AA]">{bestMonth.month}</div>
                  <div className="text-xs font-mono text-[#00D4AA]/70">+{formatIDR(bestMonth.pnl)}</div>
                </div>
              </div>
              <div className="flex justify-between p-3 bg-white/5 rounded">
                <div className="flex items-center gap-2"><span className="text-lg">❄️</span> <span className="text-xs font-bold text-gray-300">Worst Month</span></div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#FF4757]">{worstMonth.month}</div>
                  <div className="text-xs font-mono text-[#FF4757]/70">{formatIDR(worstMonth.pnl)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ROW 4: TRADE STATISTICS DEEP DIVE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Table 2/3 */}
        <div className="lg:col-span-2 bg-[#0E1628] border border-[#1a2540] rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1a2540] text-gray-400 font-bold uppercase tracking-wider text-xs">
              <tr>
                <th className="p-4 rounded-tl-xl">Metric</th>
                <th className="p-4 text-right">Crypto Futures</th>
                <th className="p-4 text-right">Saham IDX</th>
                <th className="p-4 text-right rounded-tr-xl text-white">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2540]">
              {[
                { label: 'Total Trades', k: 'totalTrades', unit: '' },
                { label: 'Win Rate', k: 'winRate', unit: '%' },
                { label: 'Avg Win', k: 'avgWin', unit: 'IDR' },
                { label: 'Avg Loss', k: 'avgLoss', unit: 'IDR' },
                { label: 'Largest Win', k: 'largestWin', unit: 'IDR' },
                { label: 'Largest Loss', k: 'largestLoss', unit: 'IDR' },
                { label: 'Avg Hold Time', k: 'holdTimeStr', unit: '' },
                { label: 'Profit Factor', k: 'profitFactor', unit: '' }
              ].map((row, i) => {
                const isEven = i % 2 === 0;
                
                const formatVal = (section: any) => {
                  const val = section[row.k];
                  if (row.unit === '%') return `${typeof val === 'number' ? val.toFixed(1) : val}%`;
                  if (row.unit === 'IDR') return formatIDR(val);
                  if (row.k === 'profitFactor') return typeof val === 'number' ? val.toFixed(2) : val;
                  return val;
                };

                return (
                  <tr key={row.k} className={`${isEven ? 'bg-[#0E1628]' : 'bg-[#0A0E1A]/50'} hover:bg-[#1a2540]/30 transition-colors`}>
                    <td className="p-4 font-bold text-gray-300">{row.label}</td>
                    <td className="p-4 font-mono text-right text-gray-400">{formatVal(stats.table.crypto)}</td>
                    <td className="p-4 font-mono text-right text-gray-400">{formatVal(stats.table.idx)}</td>
                    <td className="p-4 font-mono text-right text-white font-bold">{formatVal(stats.table.overall)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right 1/3 Consecutive */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest border-b border-[#1a2540] pb-4">Consecutive Metrics</h3>
          
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Max Consecutive Wins</div>
            <div className="text-xl font-bold text-white mb-2">{stats.streaks.maxConsecutiveWins} trades</div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: Math.min(stats.streaks.maxConsecutiveWins, 20) }).map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#00D4AA] shadow-[0_0_8px_rgba(0,212,170,0.5)]" />
              ))}
              {stats.streaks.maxConsecutiveWins > 20 && <span className="text-xs text-gray-500">...</span>}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Max Consecutive Losses</div>
            <div className="text-xl font-bold text-white mb-2">{stats.streaks.maxConsecutiveLosses} trades</div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: Math.min(stats.streaks.maxConsecutiveLosses, 20) }).map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#FF4757] shadow-[0_0_8px_rgba(255,71,87,0.5)]" />
              ))}
              {stats.streaks.maxConsecutiveLosses > 20 && <span className="text-xs text-gray-500">...</span>}
            </div>
          </div>

          <div className="pt-4 border-t border-[#1a2540]">
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Current Streak</div>
            <div className={`text-2xl font-bold ${stats.streaks.currentWinStreak > 0 ? 'text-[#00D4AA]' : stats.streaks.currentLossStreak > 0 ? 'text-[#FF4757]' : 'text-gray-400'}`}>
              {stats.streaks.currentStreakText || 'None'}
            </div>
          </div>

          <div className="pt-4 border-t border-[#1a2540]">
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Recovery Factor</div>
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold font-mono ${stats.recoveryFactor > 2 ? 'text-[#3d7fff]' : stats.recoveryFactor > 1 ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
                {stats.recoveryFactor > 90 ? '∞' : stats.recoveryFactor.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400 max-w-[120px]">Total Net Profit divided by Max Drawdown</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

// Local wrapper to isolate the graph fetch properly without modifying the big hook
function EquityChartWrapper() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('/api/performance/equity-curve?range=ALL')
      .then(r => r.json())
      .then(d => setData(d));
  }, []);

  if (!data) return <div className="h-[320px] bg-[#0E1628] animate-pulse rounded-xl" />;
  return <EquityChartComponent data={data} />;
}
