import { getKlines, getMarkPrice, get24hrTicker, getOrderBook, Kline, roundPrice } from './binance';
import { analyzeHTFStructure } from './structureAnalyzer';
import { detectKeyLevels } from './levelDetector';
import { checkEntryTrigger, EntrySetup } from './entryTrigger';
import { prisma } from '../../lib/prisma';
import { getCoinCategory } from './coinCategories';

function validateAndFixSignal(
  signal: any, 
  symbol: string,
  currentPrice: number,
  atr: number
): any {
  if (signal.action !== 'SKIP') {
    if (!signal.stopLoss || signal.stopLoss === null) {
      console.log(`⚠️ AI missing SL for ${symbol}, auto-calculating from ATR`);
      if (signal.action === 'LONG') {
        signal.stopLoss = currentPrice - (atr * 2.5);
      } else {
        signal.stopLoss = currentPrice + (atr * 2.5);
      }
    }
    
    // Enforce hard minimum SL distance to prevent getting wicked out
    const slDistPct = Math.abs(currentPrice - signal.stopLoss) / currentPrice;
    const minSlPct = (symbol === 'BTCUSDT' || symbol === 'ETHUSDT') ? 0.015 : 0.03; // 1.5% for majors, 3% for alts
    
    if (slDistPct < minSlPct) {
      console.log(`⚠️ AI SL too tight (${(slDistPct*100).toFixed(2)}%), widening to ${minSlPct*100}% minimum`);
      if (signal.action === 'LONG') {
        signal.stopLoss = currentPrice * (1 - minSlPct);
      } else {
        signal.stopLoss = currentPrice * (1 + minSlPct);
      }
    }
    
    if (!signal.takeProfit || signal.takeProfit === null) {
      console.log(`⚠️ AI missing TP for ${symbol}, auto-calculating 2.5x SL distance`);
      const slDist = Math.abs(currentPrice - signal.stopLoss);
      if (signal.action === 'LONG') {
        signal.takeProfit = currentPrice + (slDist * 2.5);
      } else {
        signal.takeProfit = currentPrice - (slDist * 2.5);
      }
    }
    
    if (!signal.entryPrice || signal.entryPrice === null) {
      signal.entryPrice = currentPrice;
    }
    
    if (!signal.leverage || signal.leverage === null) {
      signal.leverage = 1;
    }
    
    if (!signal.entryUrgency) {
      signal.entryUrgency = 'MARKET';
    }
    
    if (signal.entryUrgency === 'WAIT_PULLBACK' && (!signal.pullbackPct || signal.pullbackPct <= 0)) {
      signal.pullbackPct = 1.0; // Default 1% pullback if not specified
    }
  }
  return signal;
}

async function roundSignalPrices(signal: any, symbol: string) {
  if (signal.action !== 'SKIP') {
    if (signal.entryPrice) signal.entryPrice = await roundPrice(symbol, signal.entryPrice);
    if (signal.stopLoss) signal.stopLoss = await roundPrice(symbol, signal.stopLoss);
    if (signal.takeProfit) signal.takeProfit = await roundPrice(symbol, signal.takeProfit);
  }
  return signal;
}

function enforceMinRR(signal: any): any {
  if (signal.action === 'SKIP') return signal;
  
  const entry = signal.entryPrice;
  const sl = signal.stopLoss;
  let tp = signal.takeProfit;
  
  if (!entry || !sl || !tp) return signal;
  
  const slDistance = Math.abs(entry - sl);
  const tpDistance = Math.abs(entry - tp);
  const currentRR = tpDistance / slDistance;
  
  if (currentRR < 2.0) {
    console.log(`⚠️ AI R/R too low: ${currentRR.toFixed(2)}. Recalculating TP...`);
    const minTpDistance = slDistance * 2.5; 
    
    if (signal.action === 'LONG') {
      tp = entry + minTpDistance;
    } else if (signal.action === 'SHORT') {
      tp = entry - minTpDistance;
    }
    
    signal.takeProfit = tp;
    signal.riskReward = 2.5;
    console.log(`📐 R/R enforced to 2.5 for ${signal.symbol}`);
  }
  
  const finalTpDistance = Math.abs(entry - signal.takeProfit);
  const finalRR = finalTpDistance / slDistance;
  
  if (finalRR < 1.5) {
    signal.action = 'SKIP';
    console.log(`❌ R/R ${finalRR.toFixed(2)} too low. Forced SKIP.`);
    signal.reasoning = `R/R ${finalRR.toFixed(2)} below minimum 1.5`;
  }
  
  return signal;
}

export interface TradeSignal {
  symbol: string;
  action: 'LONG' | 'SHORT' | 'SKIP';
  confidence: number;
  reasoning: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number;
  riskReward: number | null;
  entryUrgency: 'MARKET' | 'WAIT_PULLBACK';
  pullbackPct: number | null;
  keySignal: string;
  estimatedDuration?: string | null;
  analyzedAt: Date;
}

// ----------------------------------------------------
// TECHNICAL INDICATORS (Pure JS, no external libraries)
// ----------------------------------------------------

export function calculateEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period) return 50;
  let gains = 0, losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(closes: number[]): { macd: number, signal: number, histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }
  
  const signalLine = calculateEMA(macdLine, 9);
  const currentMacd = macdLine[macdLine.length - 1];
  const currentSignal = signalLine[signalLine.length - 1];
  
  return {
    macd: currentMacd,
    signal: currentSignal,
    histogram: currentMacd - currentSignal
  };
}

function calculateBollingerBands(closes: number[], period: number = 20): { upper: number, middle: number, lower: number } {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  
  let squaredDiffs = 0;
  for (const p of slice) {
    squaredDiffs += Math.pow(p - sma, 2);
  }
  const stdDev = Math.sqrt(squaredDiffs / period);
  
  return {
    upper: sma + stdDev * 2,
    middle: sma,
    lower: sma - stdDev * 2
  };
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  const tr = [];
  tr.push(highs[0] - lows[0]);
  
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hpc, lpc));
  }
  
  // simple moving average of TR
  const slice = tr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  // Simplified ADX calculation (directional movement proxy)
  // Implementing a true Wilder's ADX is heavy, we'll proxy it using TR and DX approximations
  const atr = calculateATR(highs, lows, closes, period);
  if (atr === 0) return 0;
  
  let plusDM = 0;
  let minusDM = 0;
  
  for(let i=1; i<=period; i++) {
     const upMove = highs[highs.length - i] - highs[highs.length - i - 1];
     const downMove = lows[lows.length - i - 1] - lows[lows.length - i];
     
     if (upMove > downMove && upMove > 0) plusDM += upMove;
     if (downMove > upMove && downMove > 0) minusDM += downMove;
  }
  
  const plusDI = 100 * (plusDM / period) / atr;
  const minusDI = 100 * (minusDM / period) / atr;
  
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.0001) * 100;
  return dx; // Returns current raw DX as ADX approximation for speed
}

export function calculateVolumeProfile(volumes: number[]): { avg: number, current: number, ratio: number } {
  const current = volumes[volumes.length - 1];
  const slice = volumes.slice(-21, -1); // avg of last 20 periods
  const avg = slice.reduce((a, b) => a + b, 0) / slice.length || 1;
  return { avg, current, ratio: current / avg };
}

// ----------------------------------------------------
// SMART MONEY CONCEPTS (SMC) & PA CALCULATIONS (ENGINE V2)
// ----------------------------------------------------

export function calculatePivotPoints(highs: number[], lows: number[], leftBars: number = 3, rightBars: number = 3) {
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  
  for (let i = leftBars; i < highs.length - rightBars; i++) {
    let isHigh = true;
    let isLow = true;
    
    for (let j = 1; j <= leftBars; j++) {
      if (highs[i - j] > highs[i]) isHigh = false;
      if (lows[i - j] < lows[i]) isLow = false;
    }
    for (let j = 1; j <= rightBars; j++) {
      if (highs[i + j] > highs[i]) isHigh = false;
      if (lows[i + j] < lows[i]) isLow = false;
    }
    
    if (isHigh) pivotHighs.push(highs[i]);
    if (isLow) pivotLows.push(lows[i]);
  }
  return { pivotHighs, pivotLows };
}

export function detectOrderBlocks(klines: any[], lookback: number = 20) {
  const obs: { type: 'BULLISH'|'BEARISH', price: number }[] = [];
  const slice = klines.slice(-lookback);
  
  let totalBody = 0;
  slice.forEach(k => totalBody += Math.abs(k.close - k.open));
  const avgBody = totalBody / slice.length || 1;
  
  slice.forEach(k => {
    const body = Math.abs(k.close - k.open);
    if (body > avgBody * 2.5) { // Giant impulsive candle
      if (k.close > k.open) obs.push({ type: 'BULLISH', price: k.low });
      else obs.push({ type: 'BEARISH', price: k.high });
    }
  });
  return obs;
}

export function analyzeCandlestickAction(kline: any) {
  const body = Math.abs(kline.close - kline.open);
  const totalLength = kline.high - kline.low;
  
  if (totalLength === 0) return 'Doji';
  
  const upperWick = kline.close > kline.open ? kline.high - kline.close : kline.high - kline.open;
  const lowerWick = kline.close > kline.open ? kline.open - kline.low : kline.close - kline.low;
  
  const upperRatio = upperWick / totalLength;
  const lowerRatio = lowerWick / totalLength;
  const bodyRatio = body / totalLength;

  if (bodyRatio < 0.25 && lowerRatio > 0.6) return 'Bullish Pin Bar (Rejection of lower prices)';
  if (bodyRatio < 0.25 && upperRatio > 0.6) return 'Bearish Pin Bar (Rejection of higher prices)';
  if (bodyRatio > 0.8) return kline.close > kline.open ? 'Strong Bullish Body' : 'Strong Bearish Body';
  if (bodyRatio < 0.15) return 'Doji (Indecision)';
  
  return 'Normal';
}

// ----------------------------------------------------
// AI ANALYSIS ENGINE
// ----------------------------------------------------

export async function analyzeMarket(symbol: string, triggerData: any = null, activeMode: string = 'SAFE', engineVersion: string = 'v1'): Promise<TradeSignal> {
  // Removed SAFE_UNIVERSE check. AI is completely unleashed organically!

  const [
    klines15m,
    klines1h,
    klines4h,
    markPriceObj,
    ticker,
    orderBook,
    recentDbTrades
  ] = await Promise.all([
    getKlines(symbol, '15m', 50),
    getKlines(symbol, '1h', 50),
    getKlines(symbol, '4h', 30),
    getMarkPrice(symbol),
    get24hrTicker(symbol),
    getOrderBook(symbol, 20),
    prisma.trade.findMany({ 
      where: { symbol, status: 'CLOSED' }, 
      orderBy: { exitAt: 'desc' }, 
      take: 3 
    })
  ]);

  const parseCandles = (klines: Kline[]) => ({
    close: klines.map(k => k.close),
    high: klines.map(k => k.high),
    low: klines.map(k => k.low),
    volume: klines.map(k => k.volume)
  });

  const d15m = parseCandles(klines15m);
  const d1h = parseCandles(klines1h);
  const d4h = parseCandles(klines4h);

  const ema20_15m = calculateEMA(d15m.close, 20).pop()?.toFixed(4);
  const ema50_15m = calculateEMA(d15m.close, 50).pop()?.toFixed(4);
  const rsi_15m = calculateRSI(d15m.close, 14).toFixed(2);
  const macd_15m = calculateMACD(d15m.close);
  const atr_15m = calculateATR(d15m.high, d15m.low, d15m.close, 14);
  const adx_15m = calculateADX(d15m.high, d15m.low, d15m.close, 14).toFixed(2);
  const vol_15m = calculateVolumeProfile(d15m.volume);
  const bb_15m = calculateBollingerBands(d15m.close, 20);
  const bbPos_15m = bb_15m.upper === bb_15m.lower ? 50 : (((d15m.close[d15m.close.length-1] - bb_15m.lower) / (bb_15m.upper - bb_15m.lower)) * 100).toFixed(2);

  const ema20_1h = calculateEMA(d1h.close, 20).pop()?.toFixed(4);
  const ema50_1h = calculateEMA(d1h.close, 50).pop()?.toFixed(4);
  const rsi_1h = calculateRSI(d1h.close, 14).toFixed(2);
  const macd_1h = calculateMACD(d1h.close);
  const adx_1h = calculateADX(d1h.high, d1h.low, d1h.close, 14).toFixed(2);
  const trend_1h = parseFloat(ema20_1h || '0') > parseFloat(ema50_1h || '0') ? 'BULLISH' : 'BEARISH';

  const ema20_4h = calculateEMA(d4h.close, 20).pop() || 0;
  const ema50_4h = calculateEMA(d4h.close, 50).pop() || 0;
  const rsi_4h = calculateRSI(d4h.close, 14).toFixed(2);
  const adx_4h = calculateADX(d4h.high, d4h.low, d4h.close, 14);
  const trend_4h = ema20_4h > ema50_4h ? 'BULLISH' : 'BEARISH';

  // 3E: Market Regime Cache
  const isRegimeEnabled = process.env.ENGINE_MARKET_REGIME_CACHE === 'true';
  const isTestMode = process.env.ENGINE_TEST_MODE === 'true';
  if (isRegimeEnabled && !isTestMode) {
    const emaDiv = Math.abs(ema20_4h - ema50_4h) / markPriceObj.markPrice;
    const currentRegime = (adx_4h > 25 && emaDiv > 0.005) ? 'TRENDING' : 'RANGING';
    
    const regimeKey = `regime_${symbol}`;
    const setting = await prisma.appSettings.findUnique({ where: { key: regimeKey } });
    if (setting && setting.value) {
      const cache = JSON.parse(setting.value);
      const hoursDiff = (Date.now() - new Date(cache.updatedAt).getTime()) / 3600000;
      
      const isFallbackTrigger = triggerData && triggerData.triggerType === 'SCHEDULED_FALLBACK';

      if (hoursDiff < 1 && cache.regime === 'RANGING' && isFallbackTrigger) {
         console.log(`[REGIME-SKIP] ${symbol} is RANGING from cache.`);
         return {
            symbol, action: 'SKIP', confidence: 0, reasoning: 'Cached RANGING regime.',
            entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null, entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'N/A', estimatedDuration: null, analyzedAt: new Date()
         };
      } else if (hoursDiff >= 1) {
         await prisma.appSettings.update({ where: { key: regimeKey }, data: { value: JSON.stringify({ regime: currentRegime, updatedAt: new Date().toISOString() }) } });
      }
    } else {
         await prisma.appSettings.create({ data: { key: regimeKey, value: JSON.stringify({ regime: currentRegime, updatedAt: new Date().toISOString() }) } });
    }
  }

  // 3A: Pre-filter before AI call
  const isPrefilterEnabled = process.env.ENGINE_PREFILTER_ENABLED === 'true';
  if (isPrefilterEnabled && !isTestMode) {
    const openPos = await prisma.trade.findMany({ where: { symbol, status: 'OPEN' } });
    for (const pos of openPos) {
      const diff = Math.abs(pos.entryPrice - markPriceObj.markPrice) / markPriceObj.markPrice;
      if (diff <= 0.003) {
         console.log(`[PREFILTER-SKIP] ${symbol} price too close to open position`);
         return {
            symbol, action: 'SKIP', confidence: 0, reasoning: 'Existing position active',
            entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null, entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'Position Lock', estimatedDuration: null, analyzedAt: new Date()
         };
      }
    }
  }

  const bidVolume = orderBook.bids.reduce((acc: number, b: any) => acc + b[1], 0);
  const askVolume = orderBook.asks.reduce((acc: number, a: any) => acc + a[1], 0);
  const obImbalance = (bidVolume / (askVolume || 1)).toFixed(2);

  // Fix timezone: gunakan WIB (Asia/Jakarta) agar konteks trade hari ini akurat
  const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const startOfDay = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
  startOfDay.setHours(startOfDay.getHours() - 7); // Konversi kembali ke UTC untuk query DB
  const todayTrades = await prisma.trade.findMany({ where: { entryAt: { gte: startOfDay } } });

  
  let todaySummary = "No trades yet today";
  if (todayTrades.length > 0) {
      let netPct = 0;
      const historyStr = todayTrades.map((t: any) => {
         // rough hack since pnlPct isn't stored inherently, assuming exitPrice is filled:
         const p = t.exitPrice ? ((t.direction === 'LONG' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) / t.entryPrice)*100 : 0;
         netPct += p;
         return `${p > 0 ? '+' : ''}${p.toFixed(2)}%`;
      }).join(' ');
      todaySummary = `${todayTrades.length} trades: ${historyStr} = net ${netPct > 0 ? '+' : ''}${netPct.toFixed(2)}%`;
  }

  const recentSummary = recentDbTrades.length > 0 
    ? recentDbTrades.map((t: any) => `${t.direction[0]}`).join(' ') 
    : 'None';

  const triggerContext = triggerData ? `TRIGGER: ${triggerData.triggerType} (strength ${triggerData.strength || 1}/3)\n` : '';

  const last3 = klines15m.slice(-3);
  const last3candles = last3.map(c => {
     const pct = ((c.close - c.open) / c.open) * 100;
     const prefix = pct > 0 ? '+' : '';
     const emoji = pct > 0 ? '🟢' : '🔴';
     return `${emoji}${prefix}${pct.toFixed(2)}%`;
  }).join(' ');

  const currentHourWIB = new Date().getHours();
  let tradingSession = "NEW_YORK";
  if (currentHourWIB >= 0 && currentHourWIB < 8) tradingSession = "ASIAN";
  else if (currentHourWIB >= 8 && currentHourWIB < 15) tradingSession = "LONDON";

  const coinCat = getCoinCategory(symbol);

  const setting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
  let hunterContext = '';
  if (setting?.value) {
    const activePairs = JSON.parse(setting.value);
    const pair = activePairs.find((p: any) => p.symbol === symbol);
    if (pair) {
      const { fundingRate, fundingCategory, direction, biasSide, squeezeRisk, volume24h, priceChange24h, oiData } = pair;
      
      let oiSection = '';
      if (oiData && oiData.oiSignal) {
        const oi1h = oiData.oiChange1h ?? 0;
        const oi4h = oiData.oiChange4h ?? 0;
        const ls = oiData.lsRatio ?? 1;
        const ttLs = oiData.topTraderLsRatio ?? 1;
        const tbRatio = oiData.takerBuyRatio ?? 0.5;
        const tsRatio = oiData.takerSellRatio ?? 0.5;
        const currentOIValue = oiData.currentOIValue ?? 0;
        
        oiSection = `OPEN INTEREST ANALYSIS:
Current OI: $${(currentOIValue / 1e9).toFixed(2)}B
OI Change 1h: ${oi1h > 0 ? '+' : ''}${oi1h.toFixed(2)}%
OI Change 4h: ${oi4h > 0 ? '+' : ''}${oi4h.toFixed(2)}%
OI Trend: ${oiData.oiTrend}

POSITION SENTIMENT:
Long/Short Ratio (all accounts): ${ls.toFixed(3)}
Top Trader L/S Ratio: ${ttLs.toFixed(3)}
  ${ttLs > 1.3 ? '→ Smart money leaning LONG' :
    ttLs < 0.8 ? '→ Smart money leaning SHORT' :
    '→ Smart money neutral'}

TAKER AGGRESSION:
Buy Volume: ${(tbRatio * 100).toFixed(1)}%
Sell Volume: ${(tsRatio * 100).toFixed(1)}%
  ${tbRatio > 0.6 ? '→ Aggressive buyers in control' :
    tsRatio > 0.6 ? '→ Aggressive sellers in control' :
    '→ Balanced taker flow'}

OI SIGNAL: ${oiData.oiSignal.type} (Strength: ${oiData.oiSignal.strength}/3)
  ${oiData.oiSignal.description}

OI TRADING RULES:
- TRUST squeeze signals above all technical signals
  (OI data is ground truth — money in market)
- If SHORT_SQUEEZE_SETUP → bias LONG strongly
  even if technicals look bearish
- If LONG_SQUEEZE_SETUP → bias SHORT strongly
- If SHORT_COVERING → reduce position size 50%
  (weak move, likely to fade)
- If top trader ratio opposite your bias → reduce size
- If taker buy > 60% AND OI rising → high conviction LONG
- If taker sell > 60% AND OI rising → high conviction SHORT
`;
      }

      hunterContext = `MARKET DYNAMICS:
Funding Rate: ${fundingRate > 0 ? '+' : ''}${((fundingRate||0) * 100).toFixed(4)}%
Category: ${fundingCategory}
Crowd Position: ${direction}
Contrarian Signal: ${biasSide}
Squeeze Risk: ${squeezeRisk}
24h Volume: $${((volume24h||0) / 1_000_000).toFixed(0)}M
24h Price Change: ${priceChange24h > 0 ? '+' : ''}${(priceChange24h||0).toFixed(2)}%

SQUEEZE ANALYSIS:
${fundingCategory === 'EXTREME' ? 
  `⚡ EXTREME FUNDING DETECTED (${((fundingRate||0)*100).toFixed(4)}%)
   ${direction === 'LONG_HEAVY' ? 
     'Market is severely overcrowded LONG. Forced liquidations likely on any drop. Strong SHORT bias.' : 
     'Market is severely overcrowded SHORT. Short squeeze imminent on any pump. Strong LONG bias.'}
   This is a HIGH CONVICTION contrarian setup.` 
  : `Funding elevated. Mild contrarian pressure toward ${biasSide}.`
}

${oiSection}

ENTRY RULES FOR THIS PAIR:
- Primary bias: ${biasSide}
- Override bias ONLY if technicals strongly disagree (ADX > 30 opposite direction)
- ${squeezeRisk === 'HIGH' ? 
    'CAUTION: Lower volume pair. Use wider SL (1.2x ATR). Reduce position size 50%.' : 
    'Normal position sizing allowed.'}`;
    }
  }

  const promptPreamble = engineVersion === 'v1' 
    ? `Crypto futures day trader. Analyze ${symbol} for intraday trade.
Goal: catch moves completing within 2-8 hours.

TRADING MODE: ${activeMode}
${activeMode === 'SAFE' 
  ? 'Be conservative. Only highest quality setups.' 
  : activeMode === 'DEGEN'
  ? 'Be aggressive. Take high conviction setups. Profit maximization.'
  : 'Balanced approach.'}

${triggerContext}
PRICE: ${markPriceObj.markPrice} | 24h: ${ticker.priceChangePercent}% | Vol: ${vol_15m.ratio.toFixed(2)}x avg`
    : `[ENGINE V2: SMART MONEY CONCEPTS]
You are a top-tier Institutional Quant / SMC Trader. Analyze ${symbol} for intraday execution.
Goal: Identify high-probability swing zones utilizing Market Structure, Liquidity, and precise Price Action.

TRADING MODE: ${activeMode}

${triggerContext}
CURRENT PRICE: ${markPriceObj.markPrice} | 24h: ${ticker.priceChangePercent}% | Relative Vol: ${vol_15m.ratio.toFixed(2)}x`;

  const prompt = `${promptPreamble}

${hunterContext}

INDICATORS:
15m: EMA20=${ema20_15m} EMA50=${ema50_15m} RSI=${rsi_15m}
     MACDhist=${macd_15m.histogram.toFixed(4)} ADX=${adx_15m} BB=${bbPos_15m}%
     Last 3 candles: ${last3candles}
1H:  EMA20=${ema20_1h} EMA50=${ema50_1h} RSI=${rsi_1h}
     MACDhist=${macd_1h.histogram.toFixed(4)} ADX=${adx_1h} Trend=${trend_1h}
4H:  Bias=${trend_4h} (context only)

ORDERBOOK: BidAsk=${obImbalance}
SESSION: ${tradingSession}
RECENT TODAY: ${todaySummary}

ABSOLUTE TREND RULE — NEVER VIOLATE:
Check EMA20 vs EMA50 on 1H chart:
  If EMA20 > EMA50 (BULLISH): action must be LONG or SKIP
  If EMA20 < EMA50 (BEARISH): action must be SHORT or SKIP

If your signal direction conflicts with 1H trend:
  Set action = SKIP immediately.
  Do not look for exceptions.
  Do not override this rule for any reason.
  
The phrase 'conflict but high conviction' does NOT exist.
If there is a conflict → SKIP, period.

ENTRY RULES:
- Entry on 15m confirmation
- Stop loss: ${engineVersion === 'v2' ? 'See SMC Rules Below' : '2.5x ATR from entry'}
- Take profit: 2x ATR minimum (R/R >= 1:2)
- Max hold: 8 hours
- Category: ${coinCat.name}
- Leverage constraints: Base ${coinCat.leverage}x, strictly maximum ${coinCat.maxLeverage}x (DO NOT exceed)
- SKIP if RSI_15m > 72 or < 28
- SKIP if Friday after 20:00 WIB (weekend risk)

IMPORTANT: PREFER_SHORT + BEARISH_1H = HIGH CONVICTION SHORT opportunity. Do NOT skip this setup. This is exactly the contrarian squeeze signal we are hunting.
IMPORTANT: PREFER_LONG + BULLISH_1H = HIGH CONVICTION LONG opportunity. Do NOT skip this setup.

CRITICAL R/R RULE — NON NEGOTIABLE:
stop_loss distance × 2.5 = minimum take_profit distance.

Example SHORT:
  Entry: 70000
  SL: 70700 → distance = 700
  TP MINIMUM: 70000 - (700 × 2.5) = 68250
  
If you cannot find a valid TP at 2.5x SL distance
within reasonable price targets → action = SKIP.

NEVER suggest TP closer than 2x SL distance.

JSON only, no markdown:
{"action":"LONG"|"SHORT"|"SKIP","confidence":0-100,"reasoning":"max 20 words","entry_urgency":"MARKET"|"WAIT_PULLBACK","pullback_pct":number|null,"entry_price":number|null,"stop_loss":number|null,"take_profit":number|null,"leverage":1|2|3,"risk_reward":number|null,"key_signal":"max 10 words","estimated_duration":"1-2h"|"2-4h"|"4-8h"|null}
`;

  // --- V2 LOGIC INJECTIONS ---
  let finalPrompt = prompt;
  if (engineVersion === 'v2') {
     const pivots = calculatePivotPoints(d1h.high, d1h.low);
     const obs = detectOrderBlocks(klines15m);
     const recentCandleAnalysis = analyzeCandlestickAction(klines15m[klines15m.length - 1]);
     
     const recentResistances = pivots.pivotHighs.slice(-2).map(p => p.toFixed(4)).join(', ') || 'None';
     const recentSupports = pivots.pivotLows.slice(-2).map(p => p.toFixed(4)).join(', ') || 'None';
     const recentOBs = obs.slice(-2).map(ob => `${ob.type} at ${ob.price.toFixed(4)}`).join(', ') || 'None';

     finalPrompt += `

${hunterContext}

SMC & PRICE ACTION DATA:
1H STRUCTURAL RESISTANCES (Swing Highs): ${recentResistances}
1H STRUCTURAL SUPPORTS (Swing Lows): ${recentSupports}
15m RECENT ORDER BLOCKS (FVG Magnet Zones): ${recentOBs}
LATEST 15m CANDLE ANATOMY: ${recentCandleAnalysis}

TECHNICAL INDICATORS:
15m: EMA20=${ema20_15m} EMA50=${ema50_15m} RSI=${rsi_15m} MACDhist=${macd_15m.histogram.toFixed(4)} ADX=${adx_15m}
1H: Trend=${trend_1h} EMA20=${ema20_1h} EMA50=${ema50_1h}
ORDERBOOK IMBALANCE: ${obImbalance}

SMC EXECUTION RULES (V2):
1. Market Structure ALWAYS wins. Do not trade against 1H Trend (${trend_1h}).
2. SL PLACEMENT: Must be placed just strictly behind a logical Structural Support/Resistance listed above. DO NOT use mathematical ATR for SL. Protect behind liquidity walls.
3. TP PLACEMENT: Must target the next opposing Resistance/Support or Order Block.
4. If trading halfway between zones (mid-range), you must set 'entry_urgency' to 'WAIT_PULLBACK' and specify a 'pullback_pct' to enter exactly at the Support/OB.
5. If rejecting at resistance with a Bearish Pin Bar, strong SHORT edge.
6. Minimum Risk/Reward visually must be >= 1.5. If the nearest Support is closer than the nearest Resistance on a LONG, SKIP.

JSON only, no markdown:
{"action":"LONG"|"SHORT"|"SKIP","confidence":0-100,"reasoning":"max 20 words","entry_urgency":"MARKET"|"WAIT_PULLBACK","pullback_pct":number|null,"entry_price":number|null,"stop_loss":number|null,"take_profit":number|null,"leverage":1|2|3,"risk_reward":number|null,"key_signal":"max 10 words","estimated_duration":"1-2h"|"2-4h"|"4-8h"|null}
`;
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
  const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const AI_MODEL = process.env.AI_MODEL || 'google/gemini-2.5-flash-lite-preview-06-17';

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: finalPrompt }],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (!res.ok) {
        throw new Error(`OpenRouter API Error: ${res.statusText}`);
    }

    const aiData = await res.json();
    let content = aiData.choices[0].message.content.trim();
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    }
    const signalObj = JSON.parse(content);
    let finalSignalObj = {
      symbol,
      action: signalObj.action,
      confidence: signalObj.confidence,
      reasoning: signalObj.reasoning,
      entryPrice: signalObj.entry_price,
      stopLoss: signalObj.stop_loss,
      takeProfit: signalObj.take_profit,
      leverage: signalObj.leverage,
      riskReward: signalObj.risk_reward,
      entryUrgency: signalObj.entry_urgency || 'MARKET',
      pullbackPct: signalObj.pullback_pct || null,
      keySignal: signalObj.key_signal,
      estimatedDuration: signalObj.estimated_duration,
      analyzedAt: new Date()
    };

    finalSignalObj = validateAndFixSignal(finalSignalObj, symbol, markPriceObj.markPrice, atr_15m);
    finalSignalObj = enforceMinRR(finalSignalObj);
    finalSignalObj = await roundSignalPrices(finalSignalObj, symbol);
    return finalSignalObj;
  } catch (error) {
    console.error(`AI Analysis Failed for ${symbol}`, error);
    return {
      symbol, action: 'SKIP', confidence: 0, reasoning: `Technical failure extracting AI logic: ${error}`,
      entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null, entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'ERROR', estimatedDuration: null, analyzedAt: new Date()
    };
  }
}


// ==========================================
// ENGINE V3: SNIPER MODE ANALYSIS
// AI as VALIDATOR, not decision maker
// ==========================================

export async function analyzeMarketV3(symbol: string, triggerData: any = null, activeMode: string = 'SAFE'): Promise<TradeSignal> {
  try {
    // Fetch multi-timeframe data
    const [klines5m, klines15m, klines1h, klines4h, markPriceObj] = await Promise.all([
      getKlines(symbol, '5m', 30).catch(() => null),
      getKlines(symbol, '15m', 50),
      getKlines(symbol, '1h', 50),
      getKlines(symbol, '4h', 30),
      getMarkPrice(symbol)
    ]);

    const currentPrice = markPriceObj.markPrice;

    // ═══════════════════════════════════════
    // LAYER 1: HTF Structure Analysis (4h)
    // ═══════════════════════════════════════
    const structure = analyzeHTFStructure(klines4h, currentPrice);
    
    if (structure.bias === 'SKIP') {
      console.log(`   [V3-L1] ${symbol}: SKIP — ${structure.reasoning}`);
      return {
        symbol, action: 'SKIP', confidence: 0, reasoning: `V3-L1: ${structure.reasoning}`,
        entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null,
        entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'HTF_NO_BIAS', analyzedAt: new Date()
      };
    }

    console.log(`   [V3-L1] ${symbol}: ${structure.bias} (${structure.structure}, strength=${structure.strength})`);

    // ═══════════════════════════════════════
    // LAYER 2: Key Level Detection (1h + 15m)
    // ═══════════════════════════════════════
    const levels = detectKeyLevels(klines1h, klines15m, currentPrice);

    if (levels.allLevels.length === 0) {
      console.log(`   [V3-L2] ${symbol}: SKIP — No key levels detected`);
      return {
        symbol, action: 'SKIP', confidence: 0, reasoning: 'V3-L2: No key levels found',
        entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null,
        entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'NO_LEVELS', analyzedAt: new Date()
      };
    }

    const obCount = levels.orderBlocks.length;
    const fvgCount = levels.fvgZones.length;
    const lpCount = levels.liquidityPools.length;
    console.log(`   [V3-L2] ${symbol}: ${obCount} OBs, ${fvgCount} FVGs, ${lpCount} LPs. Nearest: ${levels.nearestLevelDistance.toFixed(2)}%`);

    // ═══════════════════════════════════════
    // LAYER 3: Entry Trigger Check (15m + 5m)
    // ═══════════════════════════════════════
    const entry = checkEntryTrigger(klines15m, klines5m, structure.bias, levels, currentPrice);

    if (!entry.triggered) {
      console.log(`   [V3-L3] ${symbol}: NO TRIGGER — ${entry.reasoning}`);
      return {
        symbol, action: 'SKIP', confidence: entry.confidence, reasoning: `V3-L3: ${entry.reasoning}`,
        entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null,
        entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'NO_TRIGGER', analyzedAt: new Date()
      };
    }

    console.log(`   [V3-L3] ${symbol}: ✅ TRIGGERED! ${entry.triggerType} | Conf=${entry.confidence} | R/R=${entry.riskReward.toFixed(1)} | SL=${entry.slDistance.toFixed(2)}%`);

    // ═══════════════════════════════════════
    // LAYER 4: AI Validation (confirm/reject)
    // ═══════════════════════════════════════
    const aiValidation = await validateWithAI(symbol, entry, structure, levels, currentPrice, klines15m, klines1h, activeMode);

    if (aiValidation.action === 'REJECT') {
      console.log(`   [V3-L4] ${symbol}: AI REJECTED — ${aiValidation.reasoning}`);
      return {
        symbol, action: 'SKIP', confidence: entry.confidence * 0.5, reasoning: `V3-L4 AI rejected: ${aiValidation.reasoning}`,
        entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null,
        entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'AI_REJECT', analyzedAt: new Date()
      };
    }

    // AI may adjust SL/TP
    const finalSL = aiValidation.adjustedSL || entry.stopLoss;
    const finalTP = aiValidation.adjustedTP || entry.takeProfit1;
    const finalConfidence = Math.min(Math.round((entry.confidence + (aiValidation.confidence || entry.confidence)) / 2), 95);

    console.log(`   [V3-L4] ${symbol}: ✅ AI CONFIRMED (conf=${finalConfidence})`);

    // ═══════════════════════════════════════
    // LAYER 5: Build Final Signal
    // ═══════════════════════════════════════
    const signal: TradeSignal = {
      symbol,
      action: entry.side,
      confidence: finalConfidence,
      reasoning: `V3 Sniper: ${entry.triggerType}. ${structure.reasoning}`,
      entryPrice: currentPrice,
      stopLoss: finalSL,
      takeProfit: finalTP,
      leverage: 1, // Will be overridden by position sizing
      riskReward: entry.riskReward,
      entryUrgency: 'MARKET',
      pullbackPct: null,
      keySignal: entry.triggerType.split(' + ')[0] || 'V3_SNIPER',
      estimatedDuration: '1-4h',
      analyzedAt: new Date(),
      // V3 extra data (will be passed through)
      v3Data: {
        tp1: entry.takeProfit1,
        tp2: entry.takeProfit2,
        tp3: entry.takeProfit3,
        slDistance: entry.slDistance,
        structure: structure.structure,
        strength: structure.strength,
        triggerType: entry.triggerType
      }
    } as any;

    return await roundSignalPrices(signal, symbol);

  } catch (error) {
    console.error(`V3 Analysis Failed for ${symbol}`, error);
    return {
      symbol, action: 'SKIP', confidence: 0, reasoning: `V3 error: ${error}`,
      entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null,
      entryUrgency: 'MARKET', pullbackPct: null, keySignal: 'V3_ERROR', analyzedAt: new Date()
    };
  }
}

// ─────────────────────────────────────────
// V3 AI VALIDATION (structured, narrow prompt)
// ─────────────────────────────────────────

async function validateWithAI(
  symbol: string,
  entry: EntrySetup,
  structure: any,
  levels: any,
  currentPrice: number,
  klines15m: Kline[],
  klines1h: Kline[],
  activeMode: string
): Promise<{ action: 'CONFIRM' | 'REJECT'; reasoning: string; confidence?: number; adjustedSL?: number; adjustedTP?: number }> {
  
  const d15m = {
    close: klines15m.map(k => k.close),
    high: klines15m.map(k => k.high),
    low: klines15m.map(k => k.low)
  };
  const rsi15m = calculateRSI(d15m.close, 14).toFixed(1);
  const macd15m = calculateMACD(d15m.close);

  const d1h = { close: klines1h.map(k => k.close) };
  const rsi1h = calculateRSI(d1h.close, 14).toFixed(1);
  const ema20_1h = calculateEMA(d1h.close, 20).pop()?.toFixed(6);
  const ema50_1h = calculateEMA(d1h.close, 50).pop()?.toFixed(6);

  const supportStr = levels.nearestSupport ? `${levels.nearestSupport.midpoint.toFixed(6)} (${levels.nearestSupport.source})` : 'None';
  const resistStr = levels.nearestResistance ? `${levels.nearestResistance.midpoint.toFixed(6)} (${levels.nearestResistance.source})` : 'None';

  const prompt = `[ENGINE V3 SNIPER VALIDATION]
You are validating a PRE-FILTERED trade setup. The algorithmic filters have already confirmed:

SETUP:
- Symbol: ${symbol}
- Side: ${entry.side}
- Entry: ${currentPrice}
- Stop Loss: ${entry.stopLoss.toFixed(6)} (${entry.slDistance.toFixed(2)}% from entry)
- Take Profit 1: ${entry.takeProfit1.toFixed(6)} (R/R 1:2)
- R/R: ${entry.riskReward.toFixed(1)}
- Trigger: ${entry.triggerType}
- Algorithmic Confidence: ${entry.confidence}%

STRUCTURE:
- 4H Bias: ${structure.structure} (${structure.strength}, score=${structure.strengthScore})
- Nearest Support: ${supportStr}
- Nearest Resistance: ${resistStr}

INDICATORS:
- 15m RSI: ${rsi15m} | MACD hist: ${macd15m.histogram.toFixed(6)}
- 1h RSI: ${rsi1h} | EMA20: ${ema20_1h} | EMA50: ${ema50_1h}

YOUR TASK: Validate or reject this setup. Check for:
1. RSI overbought/oversold conflict (RSI>75 for LONG = bad, RSI<25 for SHORT = bad)
2. MACD divergence against the trade direction
3. SL placement logic (is it behind a real structure?)
4. Any obvious trap or fakeout risk

JSON only:
{"action":"CONFIRM"|"REJECT","reasoning":"max 15 words","confidence":0-100,"adjusted_sl":number|null,"adjusted_tp":number|null}`;

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
  const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const AI_MODEL = process.env.AI_MODEL || 'google/gemini-2.5-flash-lite-preview-06-17';

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.05,
        max_tokens: 200
      })
    });

    if (!res.ok) throw new Error(`AI API Error: ${res.statusText}`);

    const aiData = await res.json();
    let content = aiData.choices[0].message.content.trim();
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    }
    const result = JSON.parse(content);

    return {
      action: result.action === 'CONFIRM' ? 'CONFIRM' : 'REJECT',
      reasoning: result.reasoning || 'No reason',
      confidence: result.confidence,
      adjustedSL: result.adjusted_sl || undefined,
      adjustedTP: result.adjusted_tp || undefined
    };
  } catch (err) {
    // If AI fails, trust algorithmic analysis
    console.warn(`[V3] AI validation failed, trusting algo filters:`, err);
    return { action: 'CONFIRM', reasoning: 'AI unavailable, algo-confirmed', confidence: entry.confidence };
  }
}
