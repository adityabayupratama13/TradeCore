import { Kline } from './binance';
import { calculateRSI, calculateEMA, calculateATR, calculateVolumeProfile } from './aiEngine';
import { KeyLevel, LevelDetectorResult } from './levelDetector';
import { MarketBias } from './structureAnalyzer';

// ==========================================
// ENGINE V3: ENTRY TRIGGER SYSTEM
// LTF confirmation + Sniper SL/TP
// ==========================================

export interface EntrySetup {
  triggered: boolean;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number; // R/R 1:2, close 50%
  takeProfit2: number; // R/R 1:4, close 30%
  takeProfit3: number; // R/R 1:6+, trailing 20%
  slDistance: number;   // SL distance in %
  riskReward: number;   // overall R/R
  confidence: number;   // 0-100
  triggerType: string;  // what triggered entry
  keyLevel: KeyLevel | null;
  reasoning: string;
}

interface CandlePattern {
  name: string;
  bullish: boolean;
  strength: number; // 1-3
}

// ------------------------------------------
// CANDLESTICK PATTERN DETECTION
// ------------------------------------------

function detectCandlePattern(klines: Kline[], index: number): CandlePattern | null {
  if (index < 1 || index >= klines.length) return null;

  const curr = klines[index];
  const prev = klines[index - 1];
  
  const currBody = Math.abs(curr.close - curr.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const currRange = curr.high - curr.low;
  const prevRange = prev.high - prev.low;
  const currIsBullish = curr.close > curr.open;
  const prevIsBullish = prev.close > prev.open;

  if (currRange === 0) return null;

  const bodyRatio = currBody / currRange;
  const upperWick = currIsBullish ? curr.high - curr.close : curr.high - curr.open;
  const lowerWick = currIsBullish ? curr.open - curr.low : curr.close - curr.low;
  const upperWickRatio = upperWick / currRange;
  const lowerWickRatio = lowerWick / currRange;

  // Bullish Engulfing
  if (currIsBullish && !prevIsBullish && currBody > prevBody * 1.2 && curr.close > prev.open && curr.open < prev.close) {
    return { name: 'BULLISH_ENGULFING', bullish: true, strength: currBody > prevBody * 2 ? 3 : 2 };
  }

  // Bearish Engulfing
  if (!currIsBullish && prevIsBullish && currBody > prevBody * 1.2 && curr.open > prev.close && curr.close < prev.open) {
    return { name: 'BEARISH_ENGULFING', bullish: false, strength: currBody > prevBody * 2 ? 3 : 2 };
  }

  // Bullish Pin Bar (hammer)
  if (lowerWickRatio > 0.6 && bodyRatio < 0.3 && upperWickRatio < 0.15) {
    return { name: 'BULLISH_PIN_BAR', bullish: true, strength: lowerWickRatio > 0.75 ? 3 : 2 };
  }

  // Bearish Pin Bar (shooting star)
  if (upperWickRatio > 0.6 && bodyRatio < 0.3 && lowerWickRatio < 0.15) {
    return { name: 'BEARISH_PIN_BAR', bullish: false, strength: upperWickRatio > 0.75 ? 3 : 2 };
  }

  // Strong bullish body
  if (currIsBullish && bodyRatio > 0.75) {
    return { name: 'STRONG_BULLISH', bullish: true, strength: 1 };
  }

  // Strong bearish body
  if (!currIsBullish && bodyRatio > 0.75) {
    return { name: 'STRONG_BEARISH', bullish: false, strength: 1 };
  }

  return null;
}

// ------------------------------------------
// LTF BREAK OF STRUCTURE CHECK
// ------------------------------------------

function checkLTFBOS(klines: Kline[], bias: MarketBias): boolean {
  if (klines.length < 10) return false;

  const recent = klines.slice(-10);
  const highs = recent.map(k => k.high);
  const lows = recent.map(k => k.low);

  // Find recent swing high/low in last 10 candles
  let swingHigh = Math.max(...highs.slice(0, -2));
  let swingLow = Math.min(...lows.slice(0, -2));
  let currentHigh = highs[highs.length - 1];
  let currentLow = lows[lows.length - 1];
  let prevHigh = highs[highs.length - 2];
  let prevLow = lows[lows.length - 2];

  // Bullish BOS: price breaks above recent swing high
  if (bias === 'LONG_ONLY' && (currentHigh > swingHigh || prevHigh > swingHigh)) {
    return true;
  }

  // Bearish BOS: price breaks below recent swing low
  if (bias === 'SHORT_ONLY' && (currentLow < swingLow || prevLow < swingLow)) {
    return true;
  }

  return false;
}

// ------------------------------------------
// VOLUME CONFIRMATION
// ------------------------------------------

function checkVolumeSpike(klines: Kline[], minRatio: number = 1.5): { confirmed: boolean; ratio: number } {
  const vols = klines.map(k => k.volume);
  const profile = calculateVolumeProfile(vols);
  return {
    confirmed: profile.ratio >= minRatio,
    ratio: profile.ratio
  };
}

// ------------------------------------------
// RSI DIVERGENCE (simplified)
// ------------------------------------------

function checkRSIDivergence(klines: Kline[], bias: MarketBias): boolean {
  if (klines.length < 20) return false;

  const closes = klines.map(k => k.close);
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);

  // Calculate RSI for last few candles
  const rsiValues: number[] = [];
  for (let i = 14; i < closes.length; i++) {
    const slice = closes.slice(0, i + 1);
    rsiValues.push(calculateRSI(slice, 14));
  }

  if (rsiValues.length < 5) return false;

  const recentRSI = rsiValues.slice(-5);
  const recentLows = lows.slice(-5);
  const recentHighs = highs.slice(-5);

  // Bullish divergence: price makes lower low but RSI makes higher low
  if (bias === 'LONG_ONLY') {
    const priceLowIdx1 = recentLows.indexOf(Math.min(...recentLows.slice(0, 3)));
    const priceLowIdx2 = recentLows.indexOf(Math.min(...recentLows.slice(2)));
    if (priceLowIdx2 > priceLowIdx1 && 
        recentLows[priceLowIdx2] < recentLows[priceLowIdx1] &&
        recentRSI[priceLowIdx2] > recentRSI[priceLowIdx1]) {
      return true;
    }
  }

  // Bearish divergence: price makes higher high but RSI makes lower high
  if (bias === 'SHORT_ONLY') {
    const priceHighIdx1 = recentHighs.indexOf(Math.max(...recentHighs.slice(0, 3)));
    const priceHighIdx2 = recentHighs.indexOf(Math.max(...recentHighs.slice(2)));
    if (priceHighIdx2 > priceHighIdx1 &&
        recentHighs[priceHighIdx2] > recentHighs[priceHighIdx1] &&
        recentRSI[priceHighIdx2] < recentRSI[priceHighIdx1]) {
      return true;
    }
  }

  return false;
}

// ------------------------------------------
// SNIPER SL CALCULATION
// ------------------------------------------

function calculateSniperSL(
  entryPrice: number,
  keyLevel: KeyLevel | null,
  side: 'LONG' | 'SHORT',
  klines: Kline[]
): number {
  const atr = calculateATR(
    klines.map(k => k.high),
    klines.map(k => k.low),
    klines.map(k => k.close),
    14
  );
  const buffer = atr * 0.15; // 15% ATR buffer for wick protection

  if (keyLevel) {
    if (side === 'LONG') {
      // SL below key level low + buffer
      return keyLevel.priceLow - buffer;
    } else {
      // SL above key level high + buffer
      return keyLevel.priceHigh + buffer;
    }
  }

  // Fallback: ATR-based SL (tighter than V2)
  if (side === 'LONG') {
    return entryPrice - atr * 1.2;
  } else {
    return entryPrice + atr * 1.2;
  }
}

// ------------------------------------------
// SNIPER TP CALCULATION (Multi-level)
// ------------------------------------------

function calculateSniperTP(
  entryPrice: number,
  slPrice: number,
  side: 'LONG' | 'SHORT',
  levels: KeyLevel[]
): { tp1: number; tp2: number; tp3: number } {
  const slDist = Math.abs(entryPrice - slPrice);

  // TP1: R/R 1:2
  const tp1 = side === 'LONG' 
    ? entryPrice + slDist * 2 
    : entryPrice - slDist * 2;

  // TP2: R/R 1:4
  const tp2 = side === 'LONG'
    ? entryPrice + slDist * 4
    : entryPrice - slDist * 4;

  // TP3: R/R 1:6 or next opposing level
  let tp3 = side === 'LONG'
    ? entryPrice + slDist * 6
    : entryPrice - slDist * 6;

  // Try to align TPs with actual levels where possible
  const opposingLevels = levels.filter(l => {
    if (side === 'LONG') return l.side === 'RESISTANCE' && l.midpoint > entryPrice;
    return l.side === 'SUPPORT' && l.midpoint < entryPrice;
  }).sort((a, b) => {
    if (side === 'LONG') return a.midpoint - b.midpoint;
    return b.midpoint - a.midpoint;
  });

  // If there's a strong opposing level near TP2/TP3, adjust
  if (opposingLevels.length >= 1) {
    const firstLevel = opposingLevels[0];
    const levelDist = Math.abs(firstLevel.midpoint - entryPrice);
    // Only use level if it gives at least R/R 1:3
    if (levelDist > slDist * 3) {
      tp3 = firstLevel.midpoint;
    }
  }

  return { tp1, tp2, tp3 };
}

// ------------------------------------------
// MAIN EXPORT: checkEntryTrigger
// ------------------------------------------

export function checkEntryTrigger(
  klines15m: Kline[],
  klines5m: Kline[] | null,
  bias: MarketBias,
  levels: LevelDetectorResult,
  currentPrice: number,
  isV4Mode: boolean = false  // V4: wider SL thresholds
): EntrySetup {
  const noEntry: EntrySetup = {
    triggered: false,
    side: 'LONG',
    entryPrice: currentPrice,
    stopLoss: 0,
    takeProfit1: 0,
    takeProfit2: 0,
    takeProfit3: 0,
    slDistance: 0,
    riskReward: 0,
    confidence: 0,
    triggerType: 'NONE',
    keyLevel: null,
    reasoning: ''
  };

  if (bias === 'SKIP') {
    noEntry.reasoning = 'HTF bias is SKIP — no entry allowed';
    return noEntry;
  }

  const side: 'LONG' | 'SHORT' = bias === 'LONG_ONLY' ? 'LONG' : 'SHORT';

  // Step 1: Is price at or near a key level?
  const relevantLevel = side === 'LONG' ? levels.nearestSupport : levels.nearestResistance;
  
  // Also check: for LONG, price should be near support. For SHORT, near resistance.
  // If not at key level (> 0.5%), check if there's any level within 1%
  const nearbyLevels = levels.allLevels.filter(l => {
    const dist = Math.abs(l.distance);
    if (side === 'LONG' && l.side === 'SUPPORT' && dist < 1.0) return true;
    if (side === 'SHORT' && l.side === 'RESISTANCE' && dist < 1.0) return true;
    return false;
  });

  const bestLevel = nearbyLevels.length > 0 ? nearbyLevels[0] : relevantLevel;

  // Step 2: Check entry triggers
  let confidence = 0;
  const triggers: string[] = [];

  // 2a: Candlestick pattern at/near key level
  const lastIdx = klines15m.length - 1;
  const pattern = detectCandlePattern(klines15m, lastIdx);
  const prevPattern = detectCandlePattern(klines15m, lastIdx - 1);
  
  const activePattern = pattern || prevPattern;
  if (activePattern) {
    const patternMatchesBias = (side === 'LONG' && activePattern.bullish) || 
                                (side === 'SHORT' && !activePattern.bullish);
    if (patternMatchesBias) {
      confidence += 20 + activePattern.strength * 5;
      triggers.push(activePattern.name);
    }
  }

  // 2b: LTF BOS
  const ltfBOS = checkLTFBOS(klines15m, bias);
  if (ltfBOS) {
    confidence += 25;
    triggers.push('15m_BOS');
  }

  // 2c: Volume spike
  const volume = checkVolumeSpike(klines15m, 1.5);
  if (volume.confirmed) {
    confidence += 15;
    triggers.push(`VOLUME_${volume.ratio.toFixed(1)}x`);
  }

  // 2d: RSI divergence (bonus)
  const rsiDiv = checkRSIDivergence(klines15m, bias);
  if (rsiDiv) {
    confidence += 10;
    triggers.push('RSI_DIVERGENCE');
  }

  // 2e: Key level proximity bonus
  if (bestLevel && Math.abs(bestLevel.distance) < 0.3) {
    confidence += 15 + bestLevel.strength * 5;
    triggers.push(`AT_${bestLevel.type}`);
  } else if (bestLevel && Math.abs(bestLevel.distance) < 0.8) {
    confidence += 5;
    triggers.push(`NEAR_${bestLevel.type}`);
  }

  // 2f: EMA alignment on 15m
  const closes15m = klines15m.map(k => k.close);
  const ema9 = calculateEMA(closes15m, 9);
  const ema21 = calculateEMA(closes15m, 21);
  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];

  if ((side === 'LONG' && ema9Val > ema21Val) || (side === 'SHORT' && ema9Val < ema21Val)) {
    confidence += 10;
    triggers.push('EMA_ALIGNED');
  }

  // 2g: 5m trigger (if available — finer entry)
  if (klines5m && klines5m.length > 10) {
    const pattern5m = detectCandlePattern(klines5m, klines5m.length - 1);
    if (pattern5m && ((side === 'LONG' && pattern5m.bullish) || (side === 'SHORT' && !pattern5m.bullish))) {
      confidence += 10;
      triggers.push(`5m_${pattern5m.name}`);
    }
    
    const vol5m = checkVolumeSpike(klines5m, 2.0);
    if (vol5m.confirmed) {
      confidence += 5;
      triggers.push('5m_VOLUME');
    }
  }

  // Step 3: Minimum confidence threshold
  const MIN_CONFIDENCE = 55;
  if (confidence < MIN_CONFIDENCE) {
    noEntry.confidence = confidence;
    noEntry.reasoning = `Confidence ${confidence} < ${MIN_CONFIDENCE}. Triggers: ${triggers.join(', ') || 'NONE'}`;
    return noEntry;
  }

  // Cap confidence at 95
  confidence = Math.min(confidence, 95);

  // Step 4: Calculate SL & TP
  const sl = calculateSniperSL(currentPrice, bestLevel, side, klines15m);
  const slDistPct = Math.abs(currentPrice - sl) / currentPrice * 100;

  // V4: wider SL range to avoid noise SL and allow normal pair volatility
  // V3: max 1.2%, min 0.15% (too tight for 20-25x leverage)
  // V4: max 6.0%, min 0.5% (widened to securely accommodate 5-10% volatility of daily top meme coins per user request)
  const maxSlPct = isV4Mode ? 6.0 : 1.2;
  const minSlPct = isV4Mode ? 0.5 : 0.15;

  // Validate SL isn't too wide
  if (slDistPct > maxSlPct) {
    noEntry.confidence = confidence;
    noEntry.reasoning = `SL too wide: ${slDistPct.toFixed(2)}% > ${maxSlPct}% max. Level too far.`;
    return noEntry;
  }

  // Validate SL isn't too tight
  if (slDistPct < minSlPct) {
    noEntry.confidence = confidence;
    noEntry.reasoning = `SL too tight: ${slDistPct.toFixed(2)}% < ${minSlPct}% min. Risk of wick-out.`;
    return noEntry;
  }

  const { tp1, tp2, tp3 } = calculateSniperTP(currentPrice, sl, side, levels.allLevels);

  // Step 5: Validate R/R
  const tp1Dist = Math.abs(tp1 - currentPrice);
  const slDist = Math.abs(sl - currentPrice);
  const rr = tp1Dist / slDist;

  if (rr < 1.8) {
    noEntry.confidence = confidence;
    noEntry.reasoning = `R/R ${rr.toFixed(2)} < 1.8 minimum. TP too close.`;
    return noEntry;
  }

  return {
    triggered: true,
    side,
    entryPrice: currentPrice,
    stopLoss: sl,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    slDistance: slDistPct,
    riskReward: rr,
    confidence,
    triggerType: triggers.join(' + '),
    keyLevel: bestLevel,
    reasoning: `V3 Sniper: ${triggers.join(' + ')} at ${bestLevel?.source || 'dynamic level'}. SL=${slDistPct.toFixed(2)}%, R/R=${rr.toFixed(1)}`
  };
}
