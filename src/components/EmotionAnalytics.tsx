const EMOTION_MAP: Record<string, { label: string, emoji: string, color: string }> = {
  CALM: { label: 'Calm', emoji: '😌', color: '#00D4AA' },
  FOMO: { label: 'FOMO', emoji: '😰', color: '#FF4757' },
  FEARFUL: { label: 'Fearful', emoji: '😨', color: '#FFA502' },
  REVENGE: { label: 'Revenge', emoji: '😤', color: '#cc0000' },
  CONFIDENT: { label: 'Confident', emoji: '😎', color: '#3d7fff' }
};

export function EmotionAnalytics({ analytics }: { analytics: any }) {
  if (!analytics) return null;

  const { winRateByEmotion, ruleCompliancePct, emotionTrend, insights } = analytics;

  return (
    <div className="space-y-6 sticky top-24">
      
      {/* INSIGHTS */}
      {insights && insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight: string, i: number) => (
            <div key={i} className="bg-[#3d7fff]/10 border border-[#3d7fff]/30 p-4 rounded-xl text-sm text-[#3d7fff] font-medium leading-relaxed">
              {insight}
            </div>
          ))}
        </div>
      )}

      {/* CARD 1: WIN RATE BY EMOTION */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Win Rate by Emotion</h3>
        <div className="space-y-5">
          {winRateByEmotion.map((stat: any) => {
            const em = EMOTION_MAP[stat.emotion] || { label: stat.emotion, emoji: '❓', color: '#888' };
            // Horizontal bar ratio
            const winPct = stat.winRate;
            const lossPct = 100 - winPct;
            
            return (
              <div key={stat.emotion} className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5 text-gray-300 font-medium">
                    <span>{em.emoji}</span> {em.label}
                  </span>
                  <span className="text-gray-500 text-xs">{stat.totalTrades} trades</span>
                </div>
                
                <div className="flex h-2.5 w-full bg-[#0A0E1A] rounded overflow-hidden">
                  <div style={{ width: `${winPct}%` }} className="bg-[#00D4AA] transition-all duration-1000" />
                  <div style={{ width: `${lossPct}%` }} className="bg-[#FF4757] transition-all duration-1000" />
                </div>
                
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span className="text-[#00D4AA]">{winPct.toFixed(0)}% Win</span>
                  <span className="text-[#FF4757]">{lossPct.toFixed(0)}% Loss</span>
                </div>
              </div>
            );
          })}
          
          {winRateByEmotion.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-4">No emotion data yet</div>
          )}
        </div>
      </div>

      {/* CARD 2: RULE COMPLIANCE DONUT */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 flex flex-col items-center text-center">
        <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest self-start">Rule Compliance</h3>
        
        <div 
          className="relative w-40 h-40 rounded-full flex items-center justify-center mb-4 transition-all duration-1000"
          style={{ 
            background: `conic-gradient(#00D4AA ${ruleCompliancePct}%, #1a2540 0)` 
          }}
        >
          {/* Inner cutout for donut */}
          <div className="absolute w-32 h-32 bg-[#0E1628] rounded-full flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white font-mono">{ruleCompliancePct.toFixed(0)}%</span>
            <span className="text-[10px] text-[#00D4AA] uppercase tracking-wider font-bold mt-1">Followed</span>
          </div>
        </div>
      </div>

      {/* CARD 3: EMOTION TREND CALENDAR (Last 14 Days) */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Emotion Trend (14d)</h3>
        
        <div className="grid grid-cols-7 gap-1.5">
          {emotionTrend.map((day: any) => {
            const isNoTrades = day.tradeCount === 0;
            const em = EMOTION_MAP[day.dominantEmotion];
            const bgColor = isNoTrades ? '#1a2540' : (em?.color || '#333');
            
            return (
              <div 
                key={day.date}
                className="aspect-square rounded flex items-center justify-center relative group cursor-pointer"
                style={{ backgroundColor: bgColor }}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-10 w-40">
                  <div className="bg-gray-900 border border-gray-700 text-white text-xs p-2 rounded shadow-xl text-center">
                    <div className="font-bold mb-1">{day.date}</div>
                    {isNoTrades ? (
                      <div className="text-gray-400">No trades</div>
                    ) : (
                      <>
                        <div>{day.tradeCount} trades ({day.wins}W / {day.losses}L)</div>
                        <div className="mt-1" style={{ color: em?.color }}>Mostly {em?.label} {em?.emoji}</div>
                      </>
                    )}
                  </div>
                  <div className="w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45 -mt-1" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
