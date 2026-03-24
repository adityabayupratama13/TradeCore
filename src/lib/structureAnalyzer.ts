import { Kline } from './binance';
import { calculateEMA, calculateADX, calculateATR } from './aiEngine';

// ==========================================
// ENGINE V3: STRUCTURE ANALYZER
// Deteksi HTF bias dari 4h candles secara algorithmic
// ==========================================

export type MarketBias = 'LONG_ONLY' | 'SHORT_ONLY' | 'SKIP';
export type TrendStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';

export interface StructureResult {
  bias: MarketBias;
  structure: 'BULLISH' | 'BEARISH' | 'RANGING';
  strength: TrendStrength;
  strengthScore: number; // 0-100
  bos: { broken: boolean; level: number; direction: 'UP' | 'DOWN' } | null;
  swingHighs: number[];
  swingLows: number[];
  keyLevel: number;
  reasoning: string;
}

// ------------------------------------------
// SWING DETECTION (Pivot Points)
// ------------------------------------------

interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

function detectSwingPoints(
  highs: number[],
  lows: number[],
  leftBars: number = 2,
  rightBars: number = 2
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  for (let i = leftBars; i < highs.length - rightBars; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= leftBars; j++) {
      if (highs[i - j] >= highs[i]) isSwingHigh = false;
      if (lows[i - j] <= lows[i]) isSwingLow = false;
    }
    for (let j = 1; j <= rightBars; j++) {
      if (highs[i + j] >= highs[i]) isSwingHigh = false;
      if (lows[i + j] <= lows[i]) isSwingLow = false;
    }

    if (isSwingHigh) swingHighs.push({ index: i, price: highs[i], type: 'HIGH' });
    if (isSwingLow) swingLows.push({ index: i, price: lows[i], type: 'LOW' });
  }

  return { swingHighs, swingLows };
}

// ------------------------------------------
// MARKET STRUCTURE DETECTION (HH/HL/LH/LL)
// ------------------------------------------

function detectMarketStructure(
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[]
): 'BULLISH' | 'BEARISH' | 'RANGING' {
  if (swingHighs.length < 2 || swingLows.length < 2) return 'RANGING';

  // Ambil 3-4 swing terbaru untuk analisis lebih akurat
  const recentHighs = swingHighs.slice(-4);
  const recentLows = swingLows.slice(-4);

  let hhCount = 0; // Higher High
  let hlCount = 0; // Higher Low
  let lhCount = 0; // Lower High
  let llCount = 0; // Lower Low

  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i].price > recentHighs[i - 1].price) hhCount++;
    else if (recentHighs[i].price < recentHighs[i - 1].price) lhCount++;
  }

  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i].price > recentLows[i - 1].price) hlCount++;
    else if (recentLows[i].price < recentLows[i - 1].price) llCount++;
  }

  // Bullish: HH + HL dominant
  if (hhCount >= 1 && hlCount >= 1 && hhCount + hlCount > lhCount + llCount) return 'BULLISH';
  // Bearish: LH + LL dominant
  if (lhCount >= 1 && llCount >= 1 && lhCount + llCount > hhCount + hlCount) return 'BEARISH';

  return 'RANGING';
}

// ------------------------------------------
// BREAK OF STRUCTURE (BOS) DETECTION
// ------------------------------------------

function detectBOS(
  currentPrice: number,
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  structure: 'BULLISH' | 'BEARISH' | 'RANGING'
): { broken: boolean; level: number; direction: 'UP' | 'DOWN' } | null {
  if (swingHighs.length < 2 || swingLows.length < 2) return null;

  const lastSwingHigh = swingHighs[swingHighs.length - 1];
  const lastSwingLow = swingLows[swingLows.length - 1];
  const prevSwingHigh = swingHighs.length >= 2 ? swingHighs[swingHighs.length - 2] : null;
  const prevSwingLow = swingLows.length >= 2 ? swingLows[swingLows.length - 2] : null;

  // Bullish BOS: harga break di atas swing high terakhir
  if (currentPrice > lastSwingHigh.price) {
    return { broken: true, level: lastSwingHigh.price, direction: 'UP' };
  }

  // Bearish BOS: harga break di bawah swing low terakhir
  if (currentPrice < lastSwingLow.price) {
    return { broken: true, level: lastSwingLow.price, direction: 'DOWN' };
  }

  // Check previous swing — milder BOS
  if (structure === 'BULLISH' && prevSwingHigh && currentPrice > prevSwingHigh.price) {
    return { broken: true, level: prevSwingHigh.price, direction: 'UP' };
  }
  if (structure === 'BEARISH' && prevSwingLow && currentPrice < prevSwingLow.price) {
    return { broken: true, level: prevSwingLow.price, direction: 'DOWN' };
  }

  return null;
}

// ------------------------------------------
// TREND STRENGTH ANALYSIS
// ------------------------------------------

function analyzeTrendStrength(
  adx: number,
  ema20: number,
  ema50: number,
  currentPrice: number,
  atr: number
): { strength: TrendStrength; score: number } {
  let score = 0;

  // ADX scoring (0-40 points)
  if (adx > 35) score += 40;
  else if (adx > 25) score += 30;
  else if (adx > 20) score += 15;
  else score += 0;

  // EMA separation scoring (0-30 points)
  const emaSep = Math.abs(ema20 - ema50) / currentPrice * 100;
  if (emaSep > 2.0) score += 30;
  else if (emaSep > 1.0) score += 20;
  else if (emaSep > 0.3) score += 10;

  // Price position vs EMAs (0-30 points)
  const priceAboveEma20 = currentPrice > ema20;
  const priceAboveEma50 = currentPrice > ema50;
  const ema20AboveEma50 = ema20 > ema50;

  // All aligned = full points
  if ((priceAboveEma20 && priceAboveEma50 && ema20AboveEma50) ||
      (!priceAboveEma20 && !priceAboveEma50 && !ema20AboveEma50)) {
    score += 30;
  } else if (priceAboveEma20 === ema20AboveEma50) {
    score += 15;
  }

  let strength: TrendStrength;
  if (score >= 70) strength = 'STRONG';
  else if (score >= 50) strength = 'MODERATE';
  else if (score >= 25) strength = 'WEAK';
  else strength = 'NONE';

  return { strength, score };
}

// ------------------------------------------
// MAIN EXPORT: analyzeHTFStructure
// ------------------------------------------

export function analyzeHTFStructure(
  klines4h: Kline[],
  currentPrice: number
): StructureResult {
  const highs = klines4h.map(k => k.high);
  const lows = klines4h.map(k => k.low);
  const closes = klines4h.map(k => k.close);

  // 1. Detect swing points
  const { swingHighs, swingLows } = detectSwingPoints(highs, lows, 2, 2);

  // 2. Determine market structure
  const structure = detectMarketStructure(swingHighs, swingLows);

  // 3. Check BOS
  const bos = detectBOS(currentPrice, swingHighs, swingLows, structure);

  // 4. Calculate indicators
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema20 = ema20Arr[ema20Arr.length - 1];
  const ema50 = ema50Arr[ema50Arr.length - 1];
  const adx = calculateADX(highs, lows, closes, 14);
  const atr = calculateATR(highs, lows, closes, 14);

  // 5. Analyze trend strength
  const { strength, score } = analyzeTrendStrength(adx, ema20, ema50, currentPrice, atr);

  // 6. Determine bias
  let bias: MarketBias;
  let reasoning: string;

  if (structure === 'RANGING') {
    if (strength === 'NONE' || strength === 'WEAK') {
      bias = 'SKIP';
      reasoning = `4H ranging (ADX=${adx.toFixed(1)}), no clear direction. Waiting for breakout.`;
    } else {
      // Ranging but has some directional strength from EMAs
      bias = ema20 > ema50 ? 'LONG_ONLY' : 'SHORT_ONLY';
      reasoning = `4H ranging but EMA bias ${bias === 'LONG_ONLY' ? 'bullish' : 'bearish'} (score=${score})`;
    }
  } else if (structure === 'BULLISH') {
    if (bos && bos.direction === 'DOWN') {
      // Bullish structure but price broke down — potential reversal
      bias = 'SKIP';
      reasoning = `4H bullish structure broken down at ${bos.level.toFixed(4)}. Reversal risk.`;
    } else {
      bias = 'LONG_ONLY';
      reasoning = `4H bullish structure (HH+HL), strength=${strength} (score=${score}), ADX=${adx.toFixed(1)}`;
    }
  } else {
    // BEARISH
    if (bos && bos.direction === 'UP') {
      bias = 'SKIP';
      reasoning = `4H bearish structure broken up at ${bos.level.toFixed(4)}. Reversal risk.`;
    } else {
      bias = 'SHORT_ONLY';
      reasoning = `4H bearish structure (LH+LL), strength=${strength} (score=${score}), ADX=${adx.toFixed(1)}`;
    }
  }

  // Key level: nearest swing for reference
  const allSwings = [
    ...swingHighs.map(s => s.price),
    ...swingLows.map(s => s.price)
  ];
  const keyLevel = allSwings.length > 0
    ? allSwings.reduce((closest, p) =>
        Math.abs(p - currentPrice) < Math.abs(closest - currentPrice) ? p : closest
      )
    : currentPrice;

  return {
    bias,
    structure,
    strength,
    strengthScore: score,
    bos,
    swingHighs: swingHighs.map(s => s.price),
    swingLows: swingLows.map(s => s.price),
    keyLevel,
    reasoning
  };
}
