"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { RiskCalculator } from "./RiskCalculator";
import { useRiskCheck } from "@/hooks/useRiskCheck";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";

const CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];
const IDX_SYMBOLS = ["BBCA", "BBRI", "TLKM", "ASII", "GOTO", "BMRI", "BRIS", "UNVR"];

interface TradeEntryModalProps {
  onClose: () => void;
}

export function TradeEntryModal({ onClose }: TradeEntryModalProps) {
  const { data: riskStatus, loading: riskLoading, fetchRiskStatus } = useRiskCheck();

  const [marketType, setMarketType] = useState<'CRYPTO_FUTURES' | 'SAHAM_IDX'>('CRYPTO_FUTURES');
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [direction, setDirection] = useState<'LONG' | 'SHORT' | 'BUY' | 'SELL'>('LONG');
  
  const [entryPrice, setEntryPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [leverage, setLeverage] = useState<number>(3);
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  const [leverageConfirm, setLeverageConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto connect to standard Binance WS if crypto
  const wsSymbols = marketType === 'CRYPTO_FUTURES' ? [symbol.toLowerCase()] : [];
  const { data: wsData } = useBinanceWebSocket(wsSymbols);
  
  const livePrice = wsData[symbol.toLowerCase()]?.price || null;

  useEffect(() => {
    fetchRiskStatus();
  }, [fetchRiskStatus]);

  useEffect(() => {
    if (marketType === 'CRYPTO_FUTURES') {
      if (livePrice && !entryPrice) {
        setEntryPrice(parseFloat(livePrice).toString());
      }
    }
  }, [marketType, livePrice, entryPrice]);

  const handleMarketTypeSwitch = (type: 'CRYPTO_FUTURES' | 'SAHAM_IDX') => {
    setMarketType(type);
    setSymbol(type === 'CRYPTO_FUTURES' ? 'BTCUSDT' : 'BBCA');
    setDirection(type === 'CRYPTO_FUTURES' ? 'LONG' : 'BUY');
    setEntryPrice("");
    setQuantity("");
    setStopLoss("");
    setTakeProfit("");
  };

  const isFormValid = () => {
    if (!riskStatus?.canTrade) return false;
    if (!entryPrice || parseFloat(entryPrice) <= 0) return false;
    if (!quantity || parseFloat(quantity) <= 0) return false;
    if (marketType === 'CRYPTO_FUTURES' && leverage === 20 && !leverageConfirm) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    setIsSubmitting(true);
    
    // Check risk right before DB commit
    const currentRisk = await fetchRiskStatus();
    if (!currentRisk?.canTrade) {
      alert(`Trade blocked: ${currentRisk?.reason}`);
      setIsSubmitting(false);
      return;
    }

    try {
      // Create Trade
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId: "cl_dummy_port_id", // Ideally fetched from context
          marketType,
          symbol,
          direction,
          entryPrice: parseFloat(entryPrice),
          quantity: parseFloat(quantity),
          leverage: marketType === 'CRYPTO_FUTURES' ? leverage : 1,
          stopLoss: stopLoss ? parseFloat(stopLoss) : null,
          takeProfit: takeProfit ? parseFloat(takeProfit) : null,
          notes: notes || null
        })
      });

      if (!res.ok) throw new Error("Failed to create trade");

      if (marketType === 'SAHAM_IDX') {
        // Also update local cache for Watchlist
        await fetch("/api/watchlist/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, price: parseFloat(entryPrice) })
        });
      }

      alert(`Trade opened: ${direction} ${symbol} @ ${entryPrice}`);
      onClose();
      // Optional: trigger dashboard refresh if we had a global event bus or context
      window.location.reload(); 
    } catch (e) {
      console.error(e);
      alert("Error opening trade.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0E1A]/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col pt-4 md:mt-10">
        
        {/* HEADER */}
        <div className="px-6 pb-4 border-b border-[#1a2540] flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-wider">NEW TRADE ENTRY</h2>
          <button onClick={onClose} className="p-2 bg-white/5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* LOCKED STATE BANNER */}
        {riskStatus && !riskStatus.canTrade && (
          <div className="bg-[#FF4757]/10 border-b border-[#FF4757]/20 px-6 py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#FF4757] mt-0.5" />
            <div>
              <div className="text-[#FF4757] font-bold tracking-wider">🔒 TRADING LOCKED</div>
              <div className="text-sm text-[#FF4757]/80 mt-1">{riskStatus.reason}</div>
              <div className="text-xs text-[#FF4757]/60 mt-1">Locked until: {riskStatus.lockedUntil ? new Date(riskStatus.lockedUntil).toLocaleString() : 'Midnight'}</div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* LEFT COLUMN: FORM */}
            <div className={`space-y-5 ${(!riskStatus?.canTrade && riskStatus !== null) ? 'opacity-50 pointer-events-none' : ''}`}>
              
              {/* Market Type */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">Market Type</label>
                <div className="flex gap-2">
                  <button onClick={() => handleMarketTypeSwitch('CRYPTO_FUTURES')} className={`flex-1 py-2 text-sm font-bold rounded border ${marketType === 'CRYPTO_FUTURES' ? 'bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/50' : 'bg-transparent text-gray-500 border-[#1a2540] hover:border-gray-600'}`}>
                    CRYPTO FUTURES
                  </button>
                  <button onClick={() => handleMarketTypeSwitch('SAHAM_IDX')} className={`flex-1 py-2 text-sm font-bold rounded border ${marketType === 'SAHAM_IDX' ? 'bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/50' : 'bg-transparent text-gray-500 border-[#1a2540] hover:border-gray-600'}`}>
                    SAHAM IDX
                  </button>
                </div>
              </div>

              {/* Symbol & Direction */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">Symbol</label>
                  <select 
                    value={symbol} onChange={(e) => setSymbol(e.target.value)}
                    className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA] transition-colors appearance-none"
                  >
                    {(marketType === 'CRYPTO_FUTURES' ? CRYPTO_SYMBOLS : IDX_SYMBOLS).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">Direction</label>
                  <div className="flex gap-2 h-[42px]">
                    <button onClick={() => setDirection(marketType === 'CRYPTO_FUTURES' ? 'LONG' : 'BUY')} className={`flex-1 text-sm font-bold rounded border ${['LONG', 'BUY'].includes(direction) ? 'bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/50' : 'bg-transparent text-gray-500 border-[#1a2540] hover:border-gray-600'}`}>
                      {marketType === 'CRYPTO_FUTURES' ? 'LONG 📈' : 'BUY 📈'}
                    </button>
                    <button onClick={() => setDirection(marketType === 'CRYPTO_FUTURES' ? 'SHORT' : 'SELL')} className={`flex-1 text-sm font-bold rounded border ${['SHORT', 'SELL'].includes(direction) ? 'bg-[#FF4757]/10 text-[#FF4757] border-[#FF4757]/50' : 'bg-transparent text-gray-500 border-[#1a2540] hover:border-gray-600'}`}>
                      {marketType === 'CRYPTO_FUTURES' ? 'SHORT 📉' : 'SELL 📉'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Entry Price & Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">Entry Price</label>
                  <input 
                    type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA] transition-colors font-mono"
                  />
                  {marketType === 'CRYPTO_FUTURES' && (
                    <div className="text-[10px] mt-1 flex justify-between">
                      <span className="text-gray-500 cursor-pointer hover:text-[#00D4AA]" onClick={() => livePrice && setEntryPrice(parseFloat(livePrice).toString())}>
                        Live: <span className="text-[#00D4AA] font-mono">${livePrice || '---'}</span>
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">
                    {marketType === 'CRYPTO_FUTURES' ? 'Quantity (Contracts)' : 'Quantity (Lots)'}
                  </label>
                  <input 
                    type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA] transition-colors font-mono"
                  />
                  {marketType === 'SAHAM_IDX' && quantity && (
                    <div className="text-[10px] mt-1 text-gray-500">
                      = {parseInt(quantity) * 100} shares
                    </div>
                  )}
                </div>
              </div>

              {/* Leverage (Crypto Only) */}
              {marketType === 'CRYPTO_FUTURES' && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 flex justify-between">
                    <span>Leverage</span>
                    {leverage === 5 && <span className="text-[#FFA502]">High leverage warning</span>}
                    {leverage >= 10 && <span className="text-[#FF4757]">Extreme risk — not recommended</span>}
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5, 10, 20].map(lev => (
                      <button 
                        key={lev}
                        onClick={() => { setLeverage(lev); setLeverageConfirm(false); }} 
                        className={`flex-1 py-1.5 text-xs font-bold rounded border ${leverage === lev ? 'bg-white/10 text-white border-white/30' : 'bg-transparent text-gray-500 border-[#1a2540] hover:border-gray-600'}`}
                      >
                        {lev}x
                      </button>
                    ))}
                  </div>
                  {leverage === 20 && (
                    <div className="mt-3 flex items-start gap-2">
                      <input type="checkbox" id="levConfirm" checked={leverageConfirm} onChange={e => setLeverageConfirm(e.target.checked)} className="mt-1" />
                      <label htmlFor="levConfirm" className="text-xs text-[#FF4757]">
                        I understand that using 20x leverage can result in extremely rapid liquidation of my position.
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Stop Loss & Take Profit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">Stop Loss</label>
                  <input 
                    type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="Optional"
                    className={`w-full bg-[#0A0E1A] border p-2.5 rounded outline-none transition-colors font-mono ${
                      stopLoss && entryPrice && (Math.abs(parseFloat(entryPrice) - parseFloat(stopLoss)) / parseFloat(entryPrice) * 100 < 0.5) 
                        ? 'border-[#FF4757] focus:border-[#FF4757]' 
                        : 'border-[#1a2540] focus:border-[#00D4AA]'
                    }`}
                  />
                  {stopLoss && entryPrice && (
                    <div className="text-[10px] mt-1 text-gray-500 font-mono">
                      Distance: {(Math.abs(parseFloat(entryPrice) - parseFloat(stopLoss)) / parseFloat(entryPrice) * 100).toFixed(2)}%
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">Take Profit</label>
                  <input 
                    type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA] transition-colors font-mono"
                  />
                  {takeProfit && entryPrice && (
                    <div className="text-[10px] mt-1 text-gray-500 font-mono">
                      Distance: {(Math.abs(parseFloat(takeProfit) - parseFloat(entryPrice)) / parseFloat(entryPrice) * 100).toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2 block">Notes (Optional)</label>
                <textarea 
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why are you entering this trade?"
                  className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA] transition-colors resize-none h-20 text-sm"
                />
              </div>

            </div>

            {/* RIGHT COLUMN: RISK CALCULATOR */}
            <div>
              <RiskCalculator 
                marketType={marketType}
                direction={direction}
                entryPrice={parseFloat(entryPrice) || 0}
                quantity={parseFloat(quantity) || 0}
                leverage={leverage}
                stopLoss={stopLoss ? parseFloat(stopLoss) : null}
                takeProfit={takeProfit ? parseFloat(takeProfit) : null}
                totalCapital={riskStatus?.totalCapital || 10000} // Fallback to 10k for visual mock if missing
                maxLeverage={3} // Should map to risk rules normally
              />
            </div>

          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-[#1a2540] flex justify-end gap-4 bg-[#0A0E1A]">
          <button onClick={onClose} className="px-6 py-2.5 rounded font-bold text-gray-400 hover:text-white transition-colors">
            CANCEL
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={!isFormValid() || isSubmitting}
            className={`px-8 py-2.5 rounded font-bold tracking-wider transition-colors ${
              isFormValid() && !isSubmitting ? 'bg-[#00D4AA] text-[#0A0E1A] hover:bg-[#00D4AA]/80 shadow-[0_0_15px_rgba(0,212,170,0.3)]' : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'LOADING...' : 'OPEN TRADE'}
          </button>
        </div>

      </div>
    </div>
  );
}
