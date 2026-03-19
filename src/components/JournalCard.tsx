import { Edit2, Trash2, Lightbulb } from "lucide-react";

const EMOTION_STYLES: Record<string, { bg: string, text: string, icon: string, label: string }> = {
  CALM: { bg: 'bg-[#00D4AA]/20', text: 'text-[#00D4AA]', icon: '😌', label: 'Calm' },
  FOMO: { bg: 'bg-[#FF4757]/20', text: 'text-[#FF4757]', icon: '😰', label: 'FOMO' },
  FEARFUL: { bg: 'bg-[#FFA502]/20', text: 'text-[#FFA502]', icon: '😨', label: 'Fearful' },
  REVENGE: { bg: 'bg-[#FF4757]/40', text: 'text-[#FF4757]', icon: '😤', label: 'Revenge' },
  CONFIDENT: { bg: 'bg-[#3d7fff]/20', text: 'text-[#3d7fff]', icon: '😎', label: 'Confident' },
  UNKNOWN: { bg: 'bg-gray-800', text: 'text-gray-400', icon: '❓', label: 'Unknown' }
};

interface JournalCardProps {
  entry: any; // tradeJournal join trade
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function JournalCard({ entry, onClick, onEdit, onDelete }: JournalCardProps) {
  const t = entry.trade;
  const isCrypto = t?.marketType === 'CRYPTO_FUTURES';
  const pnl = t?.pnl || 0;
  const isWin = pnl >= 0;

  const em = EMOTION_STYLES[entry.emotionState] || EMOTION_STYLES['UNKNOWN'];
  
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: isCrypto ? 'USD' : 'IDR',
      minimumFractionDigits: isCrypto ? 2 : 0,
      maximumFractionDigits: isCrypto ? 2 : 0
    }).format(val).replace('IDR', 'Rp').replace('USD', '$');
  };

  // Hold time calculation
  let holdTimeStr = 'N/A';
  if (t?.entryAt && t?.exitAt) {
    const diffMs = new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime();
    if (diffMs > 0) {
      const hrs = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      holdTimeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }
  }

  return (
    <div 
      onClick={onClick}
      className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 hover:border-[#2a3a60] transition-colors cursor-pointer group flex flex-col gap-4"
    >
      {/* HEADER ROW */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-lg ${isCrypto ? 'text-[#00D4AA]' : 'text-[#3d7fff]'}`}>
                {t?.symbol || 'Manual Entry'}
              </span>
              {t?.direction && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${['LONG','BUY'].includes(t.direction) ? 'bg-[#00D4AA]/10 text-[#00D4AA]' : 'bg-[#FF4757]/10 text-[#FF4757]'}`}>
                  {t.direction}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">
              {new Date(entry.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-xl font-mono font-bold ${isWin ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
            {isWin ? '+' : ''}{formatCurrency(pnl)}
          </div>
          <div className={`text-xs mt-1 ${isWin ? 'text-[#00D4AA]/70' : 'text-[#FF4757]/70'}`}>
            {t?.pnlPct ? `${isWin ? '+' : ''}${t.pnlPct.toFixed(2)}%` : 'Manual'}
          </div>
        </div>
      </div>

      {/* BODY ROW: Emotion & Rules */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${em.bg} ${em.text}`}>
          <span className="text-lg">{em.icon}</span>
          <span className="text-sm font-bold tracking-wide">{em.label}</span>
        </div>
        
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${entry.ruleFollowed ? 'bg-[#00D4AA]/5 border-[#00D4AA]/20 text-[#00D4AA]' : 'bg-[#FF4757]/5 border-[#FF4757]/20 text-[#FF4757]'}`}>
          <span className="text-sm">{entry.ruleFollowed ? '✅' : '❌'}</span>
          <span className="text-xs font-bold">{entry.ruleFollowed ? 'Rules Followed' : 'Rules Broken'}</span>
        </div>
      </div>

      {/* TRADE DETAILS */}
      {t?.entryPrice > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-400 font-mono bg-[#0A0E1A] p-2 rounded border border-[#1a2540]">
          <span>In: {t.entryPrice.toFixed(isCrypto ? 2 : 0)}</span>
          <span>Out: {t.exitPrice.toFixed(isCrypto ? 2 : 0)}</span>
          <span>Qty: {t.quantity}</span>
          {isCrypto && t.leverage > 1 && <span>Lev: {t.leverage}x</span>}
          <span>Hold: {holdTimeStr}</span>
        </div>
      )}

      {/* NOTES */}
      {(entry.notes || entry.lessonsLearned) && (
        <div className="space-y-2 mt-1">
          {entry.notes && (
            <div>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider block mb-1">Why I entered:</span>
              <p className="text-sm text-gray-300 italic">"{entry.notes}"</p>
            </div>
          )}
          {entry.lessonsLearned && (
            <div className="flex items-start gap-2 bg-[#FFA502]/10 p-2.5 rounded border border-[#FFA502]/20 mt-2">
              <Lightbulb className="w-4 h-4 text-[#FFA502] shrink-0 mt-0.5" />
              <p className="text-sm text-[#FFA502]/90">{entry.lessonsLearned}</p>
            </div>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div className="border-t border-[#1a2540] pt-4 mt-2 flex justify-between items-center">
        <div className="flex gap-2">
          {t?.marketType && (
            <span className="text-[10px] uppercase font-bold text-gray-500 bg-[#0A0E1A] px-2 py-1 rounded">
              {t.marketType.replace('_', ' ')}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onEdit}
            className="p-1.5 text-gray-500 hover:text-white bg-[#0A0E1A] rounded hover:bg-[#1a2540] transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onDelete}
            className="p-1.5 text-gray-500 hover:text-[#FF4757] bg-[#0A0E1A] rounded hover:bg-[#FF4757]/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  );
}
