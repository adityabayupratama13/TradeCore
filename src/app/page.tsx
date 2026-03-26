"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Activity, Percent, Crosshair, AlertTriangle } from "lucide-react";
import { formatUSD, formatPnL } from '@/lib/formatters';

export default function DashboardHome() {
  const [data, setData] = useState({
    portfolio: null as any,
    trades: [] as any[],
    performance: null as any,
    risk: null as any,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/portfolio').then(r => r.ok ? r.json() : null),
      fetch('/api/trades/recent').then(r => r.ok ? r.json() : []),
      fetch('/api/performance/today').then(r => r.ok ? r.json() : null),
      fetch('/api/risk/status').then(r => r.ok ? r.json() : null),
      fetch('/api/performance/summary').then(r => r.ok ? r.json() : null),
    ]).then(([portfolio, trades, performance, risk, pSummary]) => {
      setData({ portfolio, trades, performance: { ...performance, ...pSummary }, risk });
      setLoading(false);
    });
  }, []);



  if (loading) {
    return <div className="animate-pulse space-y-6">Loading dashboard...</div>;
  }

  const { portfolio, trades, performance, risk } = data;

  return (
    <div className="space-y-6">
      {/* ROW 1: 4 Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Portfolio Value */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5 hover:border-[#1a2540]/80 transition-colors">
          <div className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-wider">Total Portfolio Value</div>
          <div className="text-3xl font-mono text-white mt-1">
            {formatUSD(portfolio?.totalCapital || 0)}
          </div>
        </div>

        {/* Today's P&L */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5">
          <div className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-wider">Today's P&L</div>
          <div className="flex items-end gap-3 mt-1">
            <div className={`text-3xl font-mono ${performance?.dailyPnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4757]"}`}>
              {formatPnL(performance?.dailyPnl || 0)}
            </div>
            <div className={`px-2 py-1 rounded text-xs font-bold mb-1 ${performance?.dailyPnl >= 0 ? "bg-[#00D4AA]/10 text-[#00D4AA]" : "bg-[#FF4757]/10 text-[#FF4757]"}`}>
              {performance?.dailyPnl >= 0 ? <ArrowUpRight className="w-3 h-3 inline mr-0.5" /> : <ArrowDownRight className="w-3 h-3 inline mr-0.5" />}
              {Math.abs(performance?.winRate || 0).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5 flex items-center justify-between">
          <div>
            <div className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-wider">Win Rate (30d)</div>
            <div className="text-3xl font-mono text-white mt-1">
              {performance?.winRate ? Math.round(performance.winRate) : 0}%
            </div>
            <div className="flex gap-4 mt-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">⚡ V1</span>
                <span className="text-sm font-mono text-[#3b82f6]">{performance?.v1?.winRate ? performance.v1.winRate.toFixed(1) : 0}%</span>
                <span className="text-[9px] font-mono text-gray-500 mt-0.5">{performance?.v1?.avgDurationHours ? performance.v1.avgDurationHours.toFixed(1) + 'h avg' : '-'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">🚀 V2</span>
                <span className="text-sm font-mono text-[#a855f7]">{performance?.v2?.winRate ? performance.v2.winRate.toFixed(1) : 0}%</span>
                <span className="text-[9px] font-mono text-gray-500 mt-0.5">{performance?.v2?.avgDurationHours ? performance.v2.avgDurationHours.toFixed(1) + 'h avg' : '-'}</span>
              </div>
            </div>
          </div>
          {/* Circular Progress Placeholder */}
          <div className="w-14 h-14 rounded-full border-4 border-[#00D4AA] flex flex-col items-center justify-center relative">
            <Percent className="w-5 h-5 text-[#00D4AA]" />
          </div>
        </div>

        {/* Open Positions */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5">
          <div className="text-gray-400 text-sm font-medium mb-2 uppercase tracking-wider">Open Positions</div>
          <div className="text-3xl font-mono text-white mt-1">
            {trades?.filter((t: any) => t.status === 'OPEN').length || 0}
            <span className="text-sm text-gray-500 font-sans ml-2">/ 5 max</span>
          </div>
        </div>
      </div>

      {/* ROW 2: Recent Trades & Risk Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Trades Table */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg overflow-hidden flex flex-col">
          <div className="p-5 border-b border-[#1a2540] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#00D4AA]" />
              Recent Trades
            </h2>
          </div>
          <div className="flex-1 p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0A0E1A]/50 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Symbol</th>
                  <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Dir</th>
                  <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Engine</th>
                  <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Entry</th>
                  <th className="px-5 py-3 font-medium border-b border-[#1a2540]">P&L</th>
                  <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm font-mono text-gray-200">
                {trades && trades.length > 0 ? trades.map((trade: any) => (
                  <tr key={trade.id} className="border-b border-[#1a2540]/50 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 font-bold">{trade.symbol}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold tracking-wider ${
                        trade.direction === 'LONG' ? 'bg-[#00D4AA]/10 text-[#00D4AA]' : 'bg-[#FF4757]/10 text-[#FF4757]'
                      }`}>
                        {trade.direction}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold tracking-wider border border-transparent ${
                        trade.engineVersion === 'v4' ? 'bg-[#f59e0b]/15 text-[#f59e0b]' : trade.engineVersion === 'v3' ? 'bg-[#10b981]/15 text-[#10b981]' : trade.engineVersion === 'v2' ? 'bg-[#a855f7]/15 text-[#a855f7]' : 'bg-[#3b82f6]/15 text-[#3b82f6]'
                      }`}>
                        {trade.engineVersion === 'v4' ? '⚡ V4' : trade.engineVersion === 'v3' ? '🎯 V3' : trade.engineVersion === 'v2' ? '🚀 V2' : '⚡ V1'}
                      </span>
                    </td>
                    <td className="px-5 py-3">{trade.entryPrice}</td>
                    <td className={`px-5 py-3 ${trade.pnl > 0 ? 'text-[#00D4AA]' : trade.pnl < 0 ? 'text-[#FF4757]' : 'text-gray-400'}`}>
                      {trade.pnl ? formatPnL(trade.pnl) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-sans text-gray-400">{trade.status}</span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500 font-sans">No recent trades found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk Overview */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#FFA502]" />
              Risk Overview
            </h2>
            <div className={`px-2.5 py-1 rounded text-xs font-bold tracking-widest ${
              risk?.status === 'SAFE' ? 'bg-[#00D4AA]/10 text-[#00D4AA]' :
              risk?.status === 'WARNING' ? 'bg-[#FFA502]/10 text-[#FFA502]' :
              'bg-[#FF4757]/10 text-[#FF4757]'
            }`}>
              {risk?.status || 'UNKNOWN'}
            </div>
          </div>

          <div className="space-y-6 flex-1">
            {/* Daily Loss Meter */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400 font-medium">Daily Loss</span>
                <span className="text-white font-mono">{risk?.dailyLossPct || 0}% / {risk?.maxDailyLossPct || 3}%</span>
              </div>
              <div className="w-full bg-[#0A0E1A] h-2.5 rounded-full overflow-hidden border border-[#1a2540]">
                <div 
                  className={`h-full ${((risk?.dailyLossPct || 0) / (risk?.maxDailyLossPct || 3)) > 0.8 ? 'bg-[#FF4757]' : 'bg-[#00D4AA]'}`}
                  style={{ width: `${Math.min(((risk?.dailyLossPct || 0) / (risk?.maxDailyLossPct || 3)) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Weekly Loss Meter */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400 font-medium">Weekly Loss</span>
                <span className="text-white font-mono">{risk?.weeklyLossPct || 0}% / {risk?.maxWeeklyLossPct || 7}%</span>
              </div>
              <div className="w-full bg-[#0A0E1A] h-2.5 rounded-full overflow-hidden border border-[#1a2540]">
                <div 
                  className={`h-full ${((risk?.weeklyLossPct || 0) / (risk?.maxWeeklyLossPct || 7)) > 0.8 ? 'bg-[#FF4757]' : 'bg-[#00D4AA]'}`}
                  style={{ width: `${Math.min(((risk?.weeklyLossPct || 0) / (risk?.maxWeeklyLossPct || 7)) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Total Drawdown Meter */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400 font-medium">Total Drawdown</span>
                <span className="text-white font-mono">{risk?.drawdownPct || 0}% / {risk?.maxDrawdownPct || 15}%</span>
              </div>
              <div className="w-full bg-[#0A0E1A] h-2.5 rounded-full overflow-hidden border border-[#1a2540]">
                <div 
                  className={`h-full animate-pulse transition-all duration-1000 ${
                    ((risk?.drawdownPct || 0) / (risk?.maxDrawdownPct || 15)) > 0.8 ? 'bg-[#FF4757]' : 
                    ((risk?.drawdownPct || 0) / (risk?.maxDrawdownPct || 15)) > 0.5 ? 'bg-[#FFA502]' : 'bg-[#00D4AA]'
                  }`}
                  style={{ width: `${Math.min(((risk?.drawdownPct || 0) / (risk?.maxDrawdownPct || 15)) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: Full width card (Quick Entry & Summary) */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5 flex flex-col md:flex-row items-center gap-6 justify-between">
        <div className="flex-1 space-y-1">
          <h3 className="text-white font-semibold">Today's Summary</h3>
          <p className="text-sm text-gray-400">
            {performance?.totalTrades || 0} trades taken • {performance?.ruleFollowed ? '100' : '0'}% rules followed • Avg Emotion: CALM
          </p>
        </div>
        <button className="bg-[#00D4AA] hover:bg-[#00D4AA]/80 text-[#0A0E1A] font-bold px-6 py-3 rounded-md flex items-center gap-2 transition-colors">
          <Crosshair className="w-5 h-5" />
          Quick Trade Entry
        </button>
      </div>

    </div>
  );
}
