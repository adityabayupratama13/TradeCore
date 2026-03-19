interface DonutChartProps {
  cryptoPct: number;
  idxPct: number;
  totalTrades: number;
}

export function DonutChart({ cryptoPct, idxPct, totalTrades }: DonutChartProps) {
  return (
    <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 flex flex-col items-center justify-center h-full">
      <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest self-start">Market Breakdown</h3>
      
      <div 
        className="relative w-40 h-40 rounded-full flex items-center justify-center mb-6 transition-all duration-1000 shrink-0"
        style={{ 
          background: `conic-gradient(#00D4AA 0% ${cryptoPct}%, #3d7fff ${cryptoPct}% 100%)` 
        }}
      >
        <div className="absolute w-32 h-32 bg-[#0E1628] rounded-full flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-white">{totalTrades}</span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-1">Total Trades</span>
        </div>
      </div>

      <div className="w-full space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-[#00D4AA]" />
            <span className="text-sm text-gray-300 font-medium tracking-wide">Crypto</span>
          </div>
          <span className="text-sm font-bold font-mono text-white">{cryptoPct.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-[#3d7fff]" />
            <span className="text-sm text-gray-300 font-medium tracking-wide">Saham IDX</span>
          </div>
          <span className="text-sm font-bold font-mono text-white">{idxPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
