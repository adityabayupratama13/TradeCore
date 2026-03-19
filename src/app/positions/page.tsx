"use client";

import { useState, useEffect } from "react";
import { Layers, X } from "lucide-react";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";

export default function PositionsPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active modal state
  const [closingTrade, setClosingTrade] = useState<any | null>(null);
  const [journalingTradeId, setJournalingTradeId] = useState<string | null>(null);

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      const res = await fetch("/api/trades?status=OPEN");
      const data = await res.json();
      setTrades(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Extract symbols for WebSocket subscription
  const cryptoSymbols = trades
    .filter(t => t.marketType === 'CRYPTO_FUTURES')
    .map(t => t.symbol.toLowerCase());
  
  // Custom hook correctly handles dynamic changes in dependencies if implemented to do so.
  // We'll deduplicate just in case
  const uniqueCryptoSymbols = Array.from(new Set(cryptoSymbols));
  const { data: wsData } = useBinanceWebSocket(uniqueCryptoSymbols);

  const formatCurrency = (val: number, isCrypto: boolean) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: isCrypto ? 'USD' : 'IDR',
      minimumFractionDigits: isCrypto ? 2 : 0,
      maximumFractionDigits: isCrypto ? 2 : 0
    }).format(val).replace('IDR', 'Rp').replace('USD', '$');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="w-6 h-6 text-[#00D4AA]" />
          Open Positions
        </h2>
        <div className="text-sm text-gray-400 bg-[#0E1628] rounded border border-[#1a2540] px-3 py-1">
          {trades.length} Open Trades
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-white/5 rounded-lg w-full" />
          <div className="h-32 bg-white/5 rounded-lg w-full" />
        </div>
      ) : trades.length === 0 ? (
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-10 text-center flex flex-col items-center">
          <Layers className="w-12 h-12 text-gray-600 mb-4" />
          <h3 className="text-lg font-bold text-white tracking-wider">NO OPEN POSITIONS</h3>
          <p className="text-gray-400 mt-2">Open a new trade using the floating + button.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {trades.map(trade => {
            const isCrypto = trade.marketType === 'CRYPTO_FUTURES';
            const livePriceStr = isCrypto ? wsData[trade.symbol.toLowerCase()]?.price : null;
            const livePrice = livePriceStr ? parseFloat(livePriceStr) : null;
            
            // Calculate live PnL if live price exists
            let livePnl = 0;
            if (livePrice) {
              const entryValue = trade.entryPrice * trade.quantity;
              const currentVal = livePrice * trade.quantity;
              livePnl = trade.direction === 'LONG' || trade.direction === 'BUY' 
                ? currentVal - entryValue 
                : entryValue - currentVal;
            }

            return (
              <div key={trade.id} className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5 flex flex-col justify-between group">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-lg font-bold text-white">{trade.symbol}</div>
                      <div className="text-xs text-gray-500">{new Date(trade.entryAt).toLocaleString()}</div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-bold tracking-widest ${
                      ['LONG', 'BUY'].includes(trade.direction) ? 'bg-[#00D4AA]/10 text-[#00D4AA]' : 'bg-[#FF4757]/10 text-[#FF4757]'
                    }`}>
                      {trade.direction} {isCrypto && trade.leverage > 1 && `${trade.leverage}x`}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Entry / Qty</span>
                      <span className="text-white font-mono">{formatCurrency(trade.entryPrice, isCrypto)} • {trade.quantity}</span>
                    </div>
                    {isCrypto && livePrice && (
                      <div className="flex justify-between text-sm pt-2 border-t border-[#1a2540]">
                        <span className="text-gray-400">Live P&L</span>
                        <span className={`font-mono font-bold ${livePnl >= 0 ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
                          {livePnl >= 0 ? '+' : ''}{formatCurrency(livePnl, isCrypto)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => setClosingTrade(trade)}
                  className="w-full py-2.5 rounded bg-[#1a2540] text-white font-bold tracking-wider hover:bg-[#FF4757]/20 hover:text-[#FF4757] transition-all"
                >
                  CLOSE TRADE
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* MODALS */}
      {closingTrade && (
        <CloseTradeModal 
          trade={closingTrade} 
          wsData={wsData}
          onClose={() => setClosingTrade(null)}
          onSuccess={(tradeId: string) => {
            setClosingTrade(null);
            setJournalingTradeId(tradeId);
            fetchTrades(); // refresh underlying list
          }}
        />
      )}

      {journalingTradeId && (
        <JournalPromptModal
          tradeId={journalingTradeId}
          onClose={() => setJournalingTradeId(null)}
          onSaved={() => setJournalingTradeId(null)}
        />
      )}

    </div>
  );
}

// Sub-Component: Close Trade Modal
function CloseTradeModal({ trade, wsData, onClose, onSuccess }: any) {
  const isCrypto = trade.marketType === 'CRYPTO_FUTURES';
  const dp = isCrypto ? wsData[trade.symbol.toLowerCase()]?.price : null;
  const [exitPrice, setExitPrice] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (dp && !exitPrice) {
      setExitPrice(parseFloat(dp).toString());
    }
  }, [dp, exitPrice]);

  const handleClose = async () => {
    if (!exitPrice || parseFloat(exitPrice) <= 0) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}/close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitPrice: parseFloat(exitPrice) })
      });
      if (!res.ok) throw new Error("Failed to close trade");
      onSuccess(trade.id);
    } catch (e) {
      console.error(e);
      alert("Error closing trade");
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedExit = parseFloat(exitPrice) || 0;
  let previewPnl = 0;
  if (parsedExit > 0) {
    const entryValue = trade.entryPrice * trade.quantity;
    const exitValue = parsedExit * trade.quantity;
    previewPnl = ['LONG', 'BUY'].includes(trade.direction) ? exitValue - entryValue : entryValue - exitValue;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A0E1A]/90 p-4">
      <div className="bg-[#0E1628] border border-[#1a2540] w-full max-w-md rounded-xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-6">Close {trade.symbol}</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Exit Price</label>
            <input 
              type="number" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)}
              className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-3 rounded outline-none focus:border-[#00D4AA] font-mono text-lg"
            />
            {isCrypto && (
              <div className="text-xs text-[#00D4AA] mt-1 cursor-pointer" onClick={() => dp && setExitPrice(parseFloat(dp).toString())}>
                Live: {dp || '---'}
              </div>
            )}
          </div>

          <div className="bg-[#0A0E1A] rounded p-4 border border-[#1a2540]">
            <span className="text-xs text-gray-400 block mb-1">Estimated P&L</span>
            <span className={`text-2xl font-mono font-bold ${previewPnl >= 0 ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
              {previewPnl >= 0 ? '+' : ''}{previewPnl.toFixed(isCrypto ? 2 : 0)}
            </span>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded text-gray-400 font-bold hover:text-white transition-colors">CANCEL</button>
          <button 
            disabled={!exitPrice || isSubmitting} onClick={handleClose}
            className="px-6 py-2 rounded font-bold bg-[#FF4757] text-white hover:bg-[#FF4757]/80 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'CLOSING...' : 'CONFIRM CLOSE'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-Component: Journal Prompt Modal
function JournalPromptModal({ tradeId, onClose, onSaved }: any) {
  const [emotion, setEmotion] = useState('CALM');
  const [rules, setRules] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const EMOTIONS = [
    { id: 'CALM', label: '😌 Calm' },
    { id: 'CONFIDENT', label: '😎 Confident' },
    { id: 'FOMO', label: '😰 FOMO' },
    { id: 'FEARFUL', label: '😨 Fearful' },
    { id: 'REVENGE', label: '😤 Revenge' }
  ];

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, emotionState: emotion, ruleFollowed: rules, notes })
      });
      if (!res.ok) throw new Error("Failed to save journal");
      onSaved();
    } catch (e) {
      console.error(e);
      alert("Error saving journal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0A0E1A]/90 p-4 backdrop-blur-sm">
      <div className="bg-[#0E1628] border border-[#1a2540] w-full max-w-lg rounded-xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        
        <div className="flex justify-between items-center mb-6 border-b border-[#1a2540] pb-4">
          <h3 className="text-xl font-bold text-white tracking-wider">How did this trade go?</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="space-y-6">
          
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Emotion State</label>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map(e => (
                <button
                  key={e.id} onClick={() => setEmotion(e.id)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${emotion === e.id ? 'bg-[#00D4AA]/10 text-[#00D4AA] border border-[#00D4AA]/50' : 'bg-[#0A0E1A] text-gray-400 border border-[#1a2540] hover:text-white'}`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block flex justify-between items-center">
              <span>Did you follow all rules?</span>
              <button 
                onClick={() => setRules(!rules)}
                className={`w-12 h-6 rounded-full transition-colors relative ${rules ? 'bg-[#00D4AA]' : 'bg-[#FF4757]'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${rules ? 'left-7' : 'left-1'}`} />
              </button>
            </label>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Quick Note (Optional)</label>
            <textarea 
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you learn?..."
              className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-3 rounded outline-none focus:border-[#00D4AA] h-24 resize-none transition-colors"
            />
          </div>

        </div>

        <div className="mt-8">
          <button 
            disabled={submitting} onClick={handleSave}
            className="w-full py-3 rounded font-bold bg-[#00D4AA] text-[#0A0E1A] hover:bg-[#00D4AA]/80 disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(0,212,170,0.2)]"
          >
            {submitting ? 'SAVING...' : 'SAVE JOURNAL'}
          </button>
        </div>

      </div>
    </div>
  );
}
