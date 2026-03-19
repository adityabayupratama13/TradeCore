import { getKlines, getMarkPrice, get24hrTicker, getOrderBook, Kline } from './binance';
import { prisma } from '../../lib/prisma';

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

function calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number {
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
// AI ANALYSIS ENGINE
// ----------------------------------------------------

export async function analyzeMarket(symbol: string, triggerData: any = null): Promise<TradeSignal> {
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
  if (isRegimeEnabled) {
    const emaDiv = Math.abs(ema20_4h - ema50_4h) / markPriceObj.markPrice;
    const currentRegime = (adx_4h > 25 && emaDiv > 0.005) ? 'TRENDING' : 'RANGING';
    
    const regimeKey = `regime_${symbol}`;
    const setting = await prisma.appSettings.findUnique({ where: { key: regimeKey } });
    if (setting && setting.value) {
      const cache = JSON.parse(setting.value);
      const hoursDiff = (Date.now() - new Date(cache.updatedAt).getTime()) / 3600000;
      if (hoursDiff < 2 && cache.regime === 'RANGING') {
         console.log(`[REGIME-SKIP] ${symbol} is RANGING from cache.`);
         return {
            symbol, action: 'SKIP', confidence: 0, reasoning: 'Cached RANGING regime.',
            entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null, keySignal: 'N/A', estimatedDuration: null, analyzedAt: new Date()
         };
      } else if (hoursDiff >= 2) {
         await prisma.appSettings.update({ where: { key: regimeKey }, data: { value: JSON.stringify({ regime: currentRegime, updatedAt: new Date().toISOString() }) } });
      }
    } else {
         await prisma.appSettings.create({ data: { key: regimeKey, value: JSON.stringify({ regime: currentRegime, updatedAt: new Date().toISOString() }) } });
    }
  }

  // 3A: Pre-filter before AI call
  const isPrefilterEnabled = process.env.ENGINE_PREFILTER_ENABLED === 'true';
  if (isPrefilterEnabled) {
    if (parseFloat(adx_1h) <= 20 || vol_15m.ratio <= 0.8 || parseFloat(rsi_1h) < 22 || parseFloat(rsi_1h) > 78) {
       console.log(`[PREFILTER-SKIP] ${symbol} — no AI call`);
       return {
          symbol, action: 'SKIP', confidence: 0, reasoning: 'Failed pre-flight TA conditions.',
          entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null, keySignal: 'TA Filters', estimatedDuration: null, analyzedAt: new Date()
       };
    }
    const openPos = await prisma.trade.findMany({ where: { symbol, status: 'OPEN' } });
    for (const pos of openPos) {
      const diff = Math.abs(pos.entryPrice - markPriceObj.markPrice) / markPriceObj.markPrice;
      if (diff <= 0.003) {
         console.log(`[PREFILTER-SKIP] ${symbol} price too close to open position`);
         return {
            symbol, action: 'SKIP', confidence: 0, reasoning: 'Existing position active',
            entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null, keySignal: 'Position Lock', estimatedDuration: null, analyzedAt: new Date()
         };
      }
    }
  }

  const bidVolume = orderBook.bids.reduce((acc: number, b: any) => acc + b[1], 0);
  const askVolume = orderBook.asks.reduce((acc: number, a: any) => acc + a[1], 0);
  const obImbalance = (bidVolume / (askVolume || 1)).toFixed(2);

  const startOfDay = new Date(new Date().setHours(0,0,0,0));
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

  const setting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
  let hunterContext = '';
  if (setting?.value) {
    const activePairs = JSON.parse(setting.value);
    const pair = activePairs.find((p: any) => p.symbol === symbol);
    if (pair) {
      const { fundingRate, fundingCategory, direction, biasSide, squeezeRisk, volume24h, priceChange24h, oiData } = pair;
      
      let oiSection = '';
      if (oiData && oiData.oiSignal) {
        oiSection = `OPEN INTEREST ANALYSIS:
Current OI: $${(oiData.currentOIValue / 1e9).toFixed(2)}B
OI Change 1h: ${oiData.oiChange1h > 0 ? '+' : ''}${oiData.oiChange1h.toFixed(2)}%
OI Change 4h: ${oiData.oiChange4h > 0 ? '+' : ''}${oiData.oiChange4h.toFixed(2)}%
OI Trend: ${oiData.oiTrend}

POSITION SENTIMENT:
Long/Short Ratio (all accounts): ${oiData.lsRatio.toFixed(3)}
Top Trader L/S Ratio: ${oiData.topTraderLsRatio.toFixed(3)}
  ${oiData.topTraderLsRatio > 1.3 ? '→ Smart money leaning LONG' :
    oiData.topTraderLsRatio < 0.8 ? '→ Smart money leaning SHORT' :
    '→ Smart money neutral'}

TAKER AGGRESSION:
Buy Volume: ${(oiData.takerBuyRatio * 100).toFixed(1)}%
Sell Volume: ${(oiData.takerSellRatio * 100).toFixed(1)}%
  ${oiData.takerBuyRatio > 0.6 ? '→ Aggressive buyers in control' :
    oiData.takerSellRatio > 0.6 ? '→ Aggressive sellers in control' :
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
Funding Rate: ${fundingRate > 0 ? '+' : ''}${(fundingRate * 100).toFixed(4)}%
Category: ${fundingCategory}
Crowd Position: ${direction}
Contrarian Signal: ${biasSide}
Squeeze Risk: ${squeezeRisk}
24h Volume: $${(volume24h / 1_000_000).toFixed(0)}M
24h Price Change: ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(2)}%

SQUEEZE ANALYSIS:
${fundingCategory === 'EXTREME' ? 
  `⚡ EXTREME FUNDING DETECTED (${(fundingRate*100).toFixed(4)}%)
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
    'CAUTION: Lower volume pair. Use tighter SL (0.8x ATR). Reduce position size 50%.' : 
    'Normal position sizing allowed.'}`;
    }
  }

  const prompt = `Crypto futures day trader. Analyze ${symbol} for intraday trade.
Goal: catch moves completing within 2-8 hours.
${triggerContext}
PRICE: ${markPriceObj.markPrice} | 24h: ${ticker.priceChangePercent}% | Vol: ${vol_15m.ratio.toFixed(2)}x avg

${hunterContext}

INDICATORS:
15m: EMA20=${ema20_15m} EMA50=${ema50_15m} RSI=${rsi_15m}
     MACDhist=${macd_15m.histogram.toFixed(4)} ADX=${adx_15m} BB=${bbPos_15m}%
     Last 3 candles: ${last3candles}
1H:  EMA20=${ema20_1h} EMA50=${ema50_1h} RSI=${rsi_1h}
     MACDhist=${macd_1h.histogram.toFixed(4)} ADX=${adx_1h} Trend=${trend_1h} // Wait, calculating trend_1h from code directly
4H:  Bias=${trend_4h} (context only)

ORDERBOOK: BidAsk=${obImbalance}
SESSION: ${tradingSession}
RECENT TODAY: ${todaySummary}

DAY TRADING RULES:
- Only trade WITH 1H trend direction
- Entry on 15m confirmation
- Stop loss: 1x ATR from entry
- Take profit: 2x ATR minimum (R/R >= 1:2)
- Max hold: 8 hours
- Leverage: 2x default, 3x only if ADX_1h > 30
- SKIP if RSI_15m > 72 or < 28
- SKIP if Friday after 20:00 WIB (weekend risk)

JSON only, no markdown:
{"action":"LONG"|"SHORT"|"SKIP","confidence":0-100,"reasoning":"max 20 words","entry_price":number|null,"stop_loss":number|null,"take_profit":number|null,"leverage":1|2|3,"risk_reward":number|null,"key_signal":"max 10 words","estimated_duration":"1-2h"|"2-4h"|"4-8h"|null}
`;

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
        messages: [{ role: "user", content: prompt }],
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

    return {
      symbol,
      action: signalObj.action,
      confidence: signalObj.confidence,
      reasoning: signalObj.reasoning,
      entryPrice: signalObj.entry_price,
      stopLoss: signalObj.stop_loss,
      takeProfit: signalObj.take_profit,
      leverage: signalObj.leverage,
      riskReward: signalObj.risk_reward,
      keySignal: signalObj.key_signal,
      estimatedDuration: signalObj.estimated_duration,
      analyzedAt: new Date()
    };
  } catch (error) {
    console.error(`AI Analysis Failed for ${symbol}`, error);
    return {
      symbol, action: 'SKIP', confidence: 0, reasoning: `Technical failure extracting AI logic: ${error}`,
      entryPrice: null, stopLoss: null, takeProfit: null, leverage: 1, riskReward: null, keySignal: 'ERROR', estimatedDuration: null, analyzedAt: new Date()
    };
  }
}

