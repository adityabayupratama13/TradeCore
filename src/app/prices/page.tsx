"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { Activity, Clock, Database, LineChart, RefreshCw } from "lucide-react";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import { useBinanceFutures } from "@/hooks/useBinanceFutures";

const CRYPTO_SYMBOLS = [
  "btcusdt", "ethusdt", "solusdt", "bnbusdt", "xrpusdt", 
  "dogeusdt", "adausdt", "avaxusdt", "dotusdt", "linkusdt", 
  "ltcusdt", "bchusdt", "nearusdt", "aptusdt", "arbusdt", 
  "opusdt", "injusdt", "rndrusdt", "suiusdt", "pepeusdt"
];
const CRYPTO_NAMES: Record<string, string> = {
  "BTCUSDT": "Bitcoin", "ETHUSDT": "Ethereum", "SOLUSDT": "Solana",
  "BNBUSDT": "BNB", "XRPUSDT": "Ripple", "DOGEUSDT": "Dogecoin",
  "ADAUSDT": "Cardano", "AVAXUSDT": "Avalanche", "DOTUSDT": "Polkadot",
  "LINKUSDT": "Chainlink", "LTCUSDT": "Litecoin", "BCHUSDT": "Bitcoin Cash",
  "NEARUSDT": "NEAR Protocol", "APTUSDT": "Aptos", "ARBUSDT": "Arbitrum",
  "OPUSDT": "Optimism", "INJUSDT": "Injective", "RNDRUSDT": "Render",
  "SUIUSDT": "Sui", "PEPEUSDT": "Pepe"
};

const IDX_SYMBOLS = ["BBCA", "BBRI", "TLKM", "ASII", "GOTO", "BMRI", "BRIS", "UNVR"];

export default function LivePricesPage() {
  // Hooks
  const { data: wsData, status: wsStatus } = useBinanceWebSocket(CRYPTO_SYMBOLS);
  const targetFutures = CRYPTO_SYMBOLS.map(s => s.toUpperCase());
  const { futuresData, sentiment, volumes, loading: futuresLoading } = useBinanceFutures(targetFutures);

  // IDX Watchlist state
  const [idxWatchlist, setIdxWatchlist] = useState<Record<string, any>>({});
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);

  // Manual input state
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchIdxWatchlist();
  }, []);

  const fetchIdxWatchlist = async () => {
    try {
      const res = await fetch("/api/watchlist");
      const list = await res.json();
      const map: Record<string, any> = {};
      list.forEach((item: any) => {
        map[item.symbol] = item;
      });
      setIdxWatchlist(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const handleManualPriceSave = async (symbol: string) => {
    const p = manualInputs[symbol];
    if (!p) return;
    
    try {
      await fetch("/api/watchlist/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, price: parseFloat(p) })
      });
      // clear input and refresh
      setManualInputs(prev => ({ ...prev, [symbol]: "" }));
      fetchIdxWatchlist();
    } catch (e) {
      console.error("Failed to save price", e);
    }
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return (vol / 1e9).toFixed(1) + "B";
    if (vol >= 1e6) return (vol / 1e6).toFixed(1) + "M";
    if (vol >= 1e3) return (vol / 1e3).toFixed(1) + "K";
    return vol.toString();
  };

  // Next Funding Countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getCountdown = (nextTime: number) => {
    if (!nextTime) return "--:--:--";
    let diff = nextTime - now;
    if (diff < 0) diff = 0;
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: MARKET SENTIMENT */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-gray-400 text-sm font-medium uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4" /> Market Sentiment (Top 20 USDT Pairs)
          </h2>
          {sentiment && (
            <div className={`px-2 py-0.5 rounded text-xs font-bold tracking-widest ${
              sentiment.status === 'GREED' ? 'bg-[#00D4AA]/10 text-[#00D4AA]' :
              sentiment.status === 'FEAR' ? 'bg-[#FF4757]/10 text-[#FF4757]' :
              'bg-[#FFA502]/10 text-[#FFA502]'
            }`}>
              {sentiment.status}
            </div>
          )}
        </div>
        
        {sentiment ? (
          <div>
            <div className="w-full bg-[#FF4757] h-3 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-[#00D4AA] transition-all duration-1000"
                style={{ width: `${sentiment.percentageUp}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs font-medium">
              <span className="text-[#00D4AA]">{sentiment.upCount} UP</span>
              <span className="text-[#FF4757]">{sentiment.downCount} DOWN</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-3 bg-white/5 animate-pulse rounded-full" />
        )}
      </div>

      {/* SECTION 2: LIVE CRYPTO PRICES */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <LineChart className="w-5 h-5 text-[#00D4AA]" />
            Crypto Futures Live
          </h2>
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className={`w-2 h-2 rounded-full ${wsStatus === 'CONNECTED' ? 'bg-[#00D4AA] animate-pulse' : 'bg-[#FF4757]'}`} />
            <span className={wsStatus === 'CONNECTED' ? 'text-[#00D4AA]' : 'text-[#FF4757]'}>{wsStatus}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {targetFutures.map(sym => {
            const d = wsData[sym];
            const name = CRYPTO_NAMES[sym] || sym;
            const isUp = d?.direction === 'up';
            const isDown = d?.direction === 'down';
            
            // Animation class for price flashes
            const flashClass = isUp ? "animate-[greenFlash_0.5s_ease-out]" : isDown ? "animate-[redFlash_0.5s_ease-out]" : "";

            return (
              <div key={sym} className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-sm font-bold text-white tracking-wider">{sym}</div>
                    <div className="text-xs text-gray-400">{name}</div>
                  </div>
                  {d && (
                    <div className={`px-2 py-0.5 rounded text-xs font-bold ${
                      d.changePct >= 0 ? 'bg-[#00D4AA]/10 text-[#00D4AA]' : 'bg-[#FF4757]/10 text-[#FF4757]'
                    }`}>
                      {d.changePct >= 0 ? '+' : ''}{d.changePct.toFixed(2)}%
                    </div>
                  )}
                </div>

                <div className={`text-3xl font-mono my-2 ${d ? 'text-white' : 'text-gray-600'} ${flashClass}`}>
                  {d ? parseFloat(d.price).toString() : '------'}
                </div>

                <div className="flex justify-between text-xs text-gray-500 font-mono mt-2 pt-2 border-t border-[#1a2540]">
                  <div>H: {d ? parseFloat(d.high).toString() : '--'}</div>
                  <div>L: {d ? parseFloat(d.low).toString() : '--'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: FUTURES DATA TABLE */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-lg overflow-hidden flex flex-col">
        <div className="p-5 border-b border-[#1a2540] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-[#FFA502]" />
            Futures Data
          </h2>
          {futuresLoading && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0A0E1A]/50 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Symbol</th>
                <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Mark Price</th>
                <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Index Price</th>
                <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Funding Rate</th>
                <th className="px-5 py-3 font-medium border-b border-[#1a2540]">Next Funding</th>
                <th className="px-5 py-3 font-medium border-b border-[#1a2540]">24h Vol</th>
              </tr>
            </thead>
            <tbody className="text-sm font-mono text-white">
              {targetFutures.map(sym => {
                const f = futuresData[sym];
                const vol = volumes[sym];
                if (!f) return null;
                
                const fr = parseFloat(f.lastFundingRate);
                // IF funding rate is negative, shorts pay longs (so longs are happy)
                // Color green for negative FR, red for positive FR
                const frColor = fr < 0 ? 'text-[#00D4AA]' : 'text-[#FF4757]';

                return (
                  <tr key={sym} className="border-b border-[#1a2540]/50 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 font-bold font-sans text-gray-200">{sym}</td>
                    <td className="px-5 py-3">{parseFloat(f.markPrice).toString()}</td>
                    <td className="px-5 py-3 text-gray-400">{parseFloat(f.indexPrice).toString()}</td>
                    <td className={`px-5 py-3 ${frColor}`}>
                      {(fr * 100).toFixed(4)}%
                    </td>
                    <td className="px-5 py-3 text-[#FFA502]">
                      <Clock className="w-3 h-3 inline mr-1 mb-0.5" />
                      {getCountdown(f.nextFundingTime)}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {vol ? formatVolume(vol) : '--'}
                    </td>
                  </tr>
                );
              })}
              {Object.keys(futuresData).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-500 font-sans">
                    {futuresLoading ? 'Loading futures data...' : 'No data available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: IDX SAHAM WATCHLIST */}
      <div>
        <div className="flex items-center justify-between mb-4 mt-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            IDX Saham Watchlist
          </h2>
          <span className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-1 bg-[#0A0E1A]">
            Phase 2 Data
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {IDX_SYMBOLS.map(sym => {
            const data = idxWatchlist[sym] || {};
            const lastPrice = parseFloat(data.price) || null;
            const prevPrice = parseFloat(data.prev_price) || null;
            let changePct = 0;
            if (lastPrice && prevPrice && prevPrice > 0) {
              changePct = ((lastPrice - prevPrice) / prevPrice) * 100;
            }

            return (
              <div key={sym} className="bg-[#0E1628] border border-[#1a2540] rounded-lg p-5 relative overflow-hidden group">
                {/* Accent glow on hover */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/20 group-hover:via-blue-500/80 group-hover:to-blue-500/20 transition-all duration-500" />
                
                <div className="flex justify-between items-start mb-3">
                  <div className="font-bold text-white tracking-wider">{sym}</div>
                  {lastPrice && prevPrice && (
                    <div className={`text-xs font-bold font-mono ${changePct >= 0 ? 'text-[#00D4AA]' : 'text-[#FF4757]'}`}>
                      {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                  )}
                </div>

                <div className="mb-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Manual Price</span>
                  <input
                    type="number"
                    value={manualInputs[sym] ?? ""}
                    onChange={(e) => setManualInputs(prev => ({ ...prev, [sym]: e.target.value }))}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') handleManualPriceSave(sym);
                    }}
                    placeholder={lastPrice ? lastPrice.toString() : "0.00"}
                    className="w-full bg-[#0A0E1A] border border-[#1a2540] focus:border-[#00D4AA] outline-none rounded text-white font-mono px-3 py-1.5 text-sm transition-colors"
                  />
                  <div className="text-[10px] text-gray-500 mt-1 flex justify-between">
                    <span>Press Enter to save</span>
                  </div>
                </div>

                <div className="flex justify-between items-end mt-4 text-xs">
                  <span className="text-gray-400">Last: {lastPrice ? formatNumber(lastPrice, 0) : '--'}</span>
                  {data.updated_at && (
                    <span className="text-[10px] text-gray-500">
                      {new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
