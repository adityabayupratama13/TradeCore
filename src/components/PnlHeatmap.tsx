interface DayData {
  date: string;
  pnl: number;
  pnlPct: number;
  tradeCount: number;
  wins: number;
  losses: number;
}

export function PnlHeatmap({ data }: { data: DayData[] }) {
  // We need to build a 6 month grid
  // To simulate Github style, it's 7 rows (days of week) and multiple columns.
  // For simplicity internally, we can build a flat grid or exact weeks mapping.

  const daysBack = 180; // ~6 months
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - daysBack);

  const dataMap = new Map(data.map(d => [d.date, d]));

  // Generate all dates sequentially
  const calendarDays = [];
  const curr = new Date(start);
  while (curr <= end) {
    calendarDays.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }

  // To lay this out nicely in CSS, rather than forcing specific row/col math like Github, 
  // flex wrapping left-to-right top-to-bottom provides a clean responsive flow without complexity. 
  // But a proper github map requires Grid layout grouping by Week.
  
  // Create weeks array: [[day1...day7], [day1...day7]]
  // Wait, github charts flow Top->Bottom, Left->Right.
  // We'll use CSS writing-mode or flex-col flex-wrap.
  // Container: grid grid-rows-7 grid-flow-col gap-1

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('en-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(val).replace('IDR', 'Rp');
  };

  const getColor = (pct: number) => {
    if (pct > 3) return 'bg-[#00D4AA]'; // Large profit
    if (pct > 1) return 'bg-[#00897b]'; // Med profit
    if (pct > 0) return 'bg-[#004d40]'; // Small profit
    if (pct < -3) return 'bg-[#FF4757]'; // Large loss
    if (pct < -1) return 'bg-[#c62828]'; // Med loss
    if (pct < 0) return 'bg-[#4a0010]';  // Small loss
    return 'bg-[#1a2540]'; // Empty
  };

  return (
    <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 flex flex-col h-full w-full overflow-x-auto hide-scrollbar">
      <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest sticky left-0 shrink-0">Monthly P&L Heatmap</h3>
      
      <div className="flex flex-1 items-end min-w-max pb-4">
        <div className="grid grid-rows-7 grid-flow-col gap-[3px]">
          {calendarDays.map(dateStr => {
            const dayInfo = dataMap.get(dateStr);
            const trades = dayInfo?.tradeCount || 0;
            const pct = trades > 0 ? (dayInfo!.pnlPct || Number.MIN_SAFE_INTEGER + 1) : 0; // Force - if needed? No, relies on exact pct calc.
            // If trades > 0 but pct is 0 (breakeven exactly), we use the color logic correctly.

            const defaultColor = trades === 0 ? 'bg-[#1a2540]' : getColor(dayInfo!.pnlPct);

            return (
              <div 
                key={dateStr}
                className={`w-[14px] h-[14px] rounded-[2px] ${defaultColor} group relative cursor-pointer hover:ring-1 hover:ring-white transition-all`}
              >
                {/* TOOLTIP */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50 w-48 point-events-none">
                  <div className="bg-gray-900 border border-gray-700 p-3 rounded shadow-xl text-left">
                    <div className="text-xs text-gray-500 font-bold mb-1">{new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'})}</div>
                    {trades === 0 ? (
                      <div className="text-sm text-white font-medium">No Trades</div>
                    ) : (
                      <div className="space-y-1">
                        <div className={`text-sm font-mono font-bold ${dayInfo!.pnl >= 0 ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
                          {dayInfo!.pnl >= 0 ? '+' : ''}{formatIDR(dayInfo!.pnl)} ({dayInfo!.pnlPct.toFixed(1)}%)
                        </div>
                        <div className="text-xs text-gray-400 font-medium">
                          {trades} Trades ({dayInfo!.wins}W / {dayInfo!.losses}L)
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="w-2 h-2 bg-gray-900 border-b border-r border-gray-700 rotate-45 -mt-1" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 text-xs text-gray-400 font-bold tracking-wider sticky left-0 self-start shrink-0">
        Less
        <div className="flex gap-1">
          <div className="w-3 h-3 bg-[#4a0010] rounded-sm" />
          <div className="w-3 h-3 bg-[#c62828] rounded-sm" />
          <div className="w-3 h-3 bg-[#FF4757] rounded-sm" />
        </div>
        <div className="w-px h-3 bg-gray-600 mx-1" /> {/* divider */}
        <div className="flex gap-1">
          <div className="w-3 h-3 bg-[#004d40] rounded-sm" />
          <div className="w-3 h-3 bg-[#00897b] rounded-sm" />
          <div className="w-3 h-3 bg-[#00D4AA] rounded-sm" />
        </div>
        More
      </div>
    </div>
  );
}
