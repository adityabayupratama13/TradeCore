import { TrendingUp, Award, Activity, ShieldAlert, Target, BarChart2 } from "lucide-react";
import { formatUSD } from "@/lib/formatters";

export function MetricCards({ summary }: { summary: any }) {
  if (!summary) return null;

  const {
    totalReturnPct, totalReturnIDR, startDate,
    winRate, totalWins, totalLosses, totalTrades,
    profitFactor, maxDrawdownPct, avgRiskReward, sharpeRatio
  } = summary;



  const isReturnPos = totalReturnPct >= 0;

  return (
    <div className="flex overflow-x-auto pb-4 gap-4 hide-scrollbar snap-x">
      
      {/* 1. Total Return */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 min-w-[240px] snap-center shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Return</h3>
        </div>
        <div className={`text-3xl font-mono font-bold ${isReturnPos ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
          {isReturnPos ? '+' : ''}{totalReturnPct.toFixed(2)}%
        </div>
        <div className="text-sm mt-3 text-gray-400">Since inception ({startDate})</div>
        <div className={`text-sm font-bold font-mono mt-1 ${isReturnPos ? 'text-[#00D4AA]/70' : 'text-[#FF4757]/70'}`}>
          {isReturnPos ? '+' : ''}{formatUSD(totalReturnIDR)}
        </div>
      </div>

      {/* 2. Win Rate */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 min-w-[240px] snap-center shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Win Rate</h3>
        </div>
        <div className="text-3xl font-mono font-bold text-white">
          {winRate.toFixed(1)}%
        </div>
        <div className="text-sm mt-3 text-gray-400">{totalWins} wins / {totalLosses} losses / {totalTrades} total</div>
        <div className="flex h-1.5 w-full bg-[#0A0E1A] rounded overflow-hidden mt-3">
          <div style={{ width: `${winRate}%` }} className="bg-[#00D4AA]" />
          <div style={{ width: `${100 - winRate}%` }} className="bg-[#FF4757]" />
        </div>
      </div>

      {/* 3. Profit Factor */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 min-w-[240px] snap-center shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Profit Factor</h3>
        </div>
        <div className={`text-3xl font-mono font-bold ${profitFactor >= 1.5 ? 'text-[#00D4AA]' : profitFactor >= 1.0 ? 'text-[#FFA502]' : 'text-[#FF4757]'}`}>
          {profitFactor > 90 ? '∞' : profitFactor.toFixed(2)}
        </div>
        <div className="text-sm mt-3 text-gray-400">Total Win / Total Loss</div>
        <div className="text-xs font-bold mt-1 text-gray-500">Target: {'>'} 1.5</div>
      </div>

      {/* 4. Max Drawdown */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 min-w-[240px] snap-center shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Max Drawdown</h3>
        </div>
        <div className={`text-3xl font-mono font-bold ${maxDrawdownPct < 5 ? 'text-[#00D4AA]' : maxDrawdownPct < 10 ? 'text-[#FFA502]' : 'text-[#FF4757]'}`}>
          -{maxDrawdownPct.toFixed(2)}%
        </div>
        <div className="text-sm mt-3 text-gray-400">Worst peak-to-trough</div>
      </div>

      {/* 5. Avg Risk/Reward */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 min-w-[240px] snap-center shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Avg Risk/Reward</h3>
        </div>
        <div className={`text-3xl font-mono font-bold ${avgRiskReward >= 2 ? 'text-[#00D4AA]' : avgRiskReward >= 1.5 ? 'text-[#FFA502]' : 'text-[#FF4757]'}`}>
          1 : {avgRiskReward > 90 ? '∞' : avgRiskReward.toFixed(2)}
        </div>
        <div className="text-sm mt-3 text-gray-400">Average across closed trades</div>
      </div>

      {/* 6. Sharpe Ratio (simplified) */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 min-w-[240px] snap-center shrink-0 group relative">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider cursor-help">Sharpe Ratio</h3>
          
          <div className="absolute top-10 left-4 bg-gray-900 border border-gray-700 p-2 rounded text-xs text-white hidden group-hover:block w-48 z-10 shadow-xl">
            Simplified Sharpe: avg monthly return divided by std deviation of monthly returns
          </div>
        </div>
        <div className={`text-3xl font-mono font-bold ${sharpeRatio >= 1 ? 'text-[#00D4AA]' : sharpeRatio >= 0.5 ? 'text-[#FFA502]' : 'text-[#FF4757]'}`}>
          {sharpeRatio > 90 ? '∞' : sharpeRatio.toFixed(2)}
        </div>
        <div className="text-sm mt-3 text-gray-400">Return / Volatility (monthly)</div>
      </div>

    </div>
  );
}
