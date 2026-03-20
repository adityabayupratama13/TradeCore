import { X } from "lucide-react";
import { formatPnL } from "@/lib/formatters";

interface JournalDetailModalProps {
  entry: any; // tradeJournal join trade
  onClose: () => void;
}

export function JournalDetailModal({ entry, onClose }: JournalDetailModalProps) {
  if (!entry) return null;

  const t = entry.trade;
  const isCrypto = t?.marketType === 'CRYPTO_FUTURES';
  


  // Pure CSS P&L Bar Visualization
  // Showing entry vs exit scaled.
  let pnlViz = null;
  if (t?.entryPrice > 0 && t?.exitPrice > 0) {
    const isLong = ['LONG', 'BUY'].includes(t.direction);
    const minP = Math.min(t.entryPrice, t.exitPrice, t.stopLoss || t.entryPrice, t.takeProfit || t.exitPrice);
    const maxP = Math.max(t.entryPrice, t.exitPrice, t.stopLoss || t.entryPrice, t.takeProfit || t.exitPrice);
    const range = maxP - minP || 1; // avoid /0

    // Calculate percentages
    const entryPct = ((t.entryPrice - minP) / range) * 100;
    const exitPct = ((t.exitPrice - minP) / range) * 100;
    
    // Width of the actual trade move
    const moveWidth = Math.abs(exitPct - entryPct);
    const leftOffset = Math.min(entryPct, exitPct);
    
    const isWin = t.pnl >= 0;
    const tradeColor = isWin ? 'bg-[#00D4AA]' : 'bg-[#FF4757]';

    pnlViz = (
      <div className="mt-6">
        <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-4">Trade Execution Range</h4>
        <div className="relative h-6 bg-[#0A0E1A] rounded overflow-hidden border border-[#1a2540]">
          {/* Base range background */}
          <div className="absolute inset-y-0 w-full flex opacity-10">
            <div className={`w-full ${isLong ? 'bg-gradient-to-r from-red-500 to-green-500' : 'bg-gradient-to-r from-green-500 to-red-500'}`} />
          </div>

          {/* Actual trade executed range */}
          <div 
            className={`absolute inset-y-0 ${tradeColor} opacity-50`} 
            style={{ left: `${leftOffset}%`, width: `${moveWidth}%` }} 
          />

          {/* Entry Point Marker */}
          <div 
            className="absolute inset-y-0 w-1 bg-white z-10" 
            style={{ left: `${entryPct}%`, transform: 'translateX(-50%)' }} 
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-white">Entry</div>
          </div>

          {/* Exit Point Marker */}
          <div 
            className={`absolute inset-y-0 w-1 z-10 ${isWin ? 'bg-[#00D4AA]' : 'bg-[#FF4757]'}`} 
            style={{ left: `${exitPct}%`, transform: 'translateX(-50%)' }} 
          >
            <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold ${isWin ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>Exit</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0E1A]/80 backdrop-blur-sm p-4">
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-[#1a2540] flex items-center justify-between bg-[#0A0E1A]">
          <h2 className="text-xl font-bold text-white tracking-wider flex items-center gap-2">
            Journal Detail
            <span className="text-gray-500 text-sm font-normal ml-2">{new Date(entry.createdAt).toLocaleString()}</span>
          </h2>
          <button onClick={onClose} className="p-2 bg-white/5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6">
          
          {/* Top Row: Symbol & P&L */}
          <div className="flex justify-between items-center pb-6 border-b border-[#1a2540]">
            <div>
              <div className="text-3xl font-bold text-white">{t?.symbol || 'Manual Record'}</div>
              {t && (
                <div className="flex gap-2 mt-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold tracking-widest ${['LONG','BUY'].includes(t.direction) ? 'bg-[#00D4AA]/10 text-[#00D4AA]' : 'bg-[#FF4757]/10 text-[#FF4757]'}`}>
                    {t.direction} {isCrypto && t.leverage > 1 && `${t.leverage}x`}
                  </span>
                  <span className="px-2 py-1 rounded text-xs font-bold bg-[#1a2540] text-gray-300">
                    {t.marketType.replace('_', ' ')}
                  </span>
                </div>
              )}
            </div>
            
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Realized P&L</div>
              <div className={`text-4xl font-mono font-bold ${(t?.pnl || 0) >= 0 ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
                {formatPnL(t?.pnl || 0)}
              </div>
            </div>
          </div>

          {/* Psychology Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0A0E1A] border border-[#1a2540] p-4 rounded-lg">
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Dominant Emotion</div>
              <div className="text-2xl font-bold text-white flex items-center gap-2">
                {entry.emotionState}
              </div>
            </div>
            <div className="bg-[#0A0E1A] border border-[#1a2540] p-4 rounded-lg flex flex-col justify-center items-center text-center">
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Discipline</div>
              <div className={`text-xl font-bold ${entry.ruleFollowed ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
                {entry.ruleFollowed ? 'Rules Followed ✅' : 'Rules Broken ❌'}
              </div>
            </div>
          </div>

          {/* PNL Visualization */}
          {pnlViz}

          {/* Notes */}
          <div className="space-y-4 pt-4 border-t border-[#1a2540]">
            {entry.notes && (
              <div>
                <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Reason for Entry</h4>
                <div className="bg-[#0A0E1A] border border-[#1a2540] p-4 rounded text-gray-300 leading-relaxed text-sm">
                  {entry.notes}
                </div>
              </div>
            )}

            {entry.lessonsLearned && (
              <div>
                <h4 className="text-xs text-[#3d7fff] font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                  Lessons Learned 💡
                </h4>
                <div className="bg-[#3d7fff]/10 border border-[#3d7fff]/20 p-4 rounded text-[#3d7fff] leading-relaxed text-sm">
                  {entry.lessonsLearned}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-[#1a2540] flex justify-end bg-[#0A0E1A]">
          <button onClick={onClose} className="px-8 py-2.5 rounded font-bold tracking-wider transition-colors bg-[#1a2540] text-gray-300 hover:bg-[#2a3a60] hover:text-white">
            CLOSE
          </button>
        </div>

      </div>
    </div>
  );
}
