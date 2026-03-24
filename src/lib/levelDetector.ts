import { Kline } from './binance';
import { calculateATR } from './aiEngine';

// ==========================================
// ENGINE V3: KEY LEVEL DETECTOR
// Order Blocks, Fair Value Gaps, Liquidity Pools
// ==========================================

export interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  midpoint: number;
  volume: number;
  volumeRatio: number; // vs average
  strength: number; // 1-3
  timeframe: string;
  index: number;
}

export interface FairValueGap {
  type: 'BULLISH' | 'BEARISH';
  high: number; // top of gap
  low: number;  // bottom of gap
  midpoint: number;
  size: number; // gap size as % of price
  filled: boolean;
  index: number;
}

export interface LiquidityPool {
  type: 'ABOVE' | 'BELOW'; // above = buy-side liquidity, below = sell-side
  price: number;
  touches: number; // how many times price touched this level
  strength: number; // 1-3
}

export interface KeyLevel {
  type: 'ORDER_BLOCK' | 'FVG' | 'LIQUIDITY_POOL';
  side: 'SUPPORT' | 'RESISTANCE';
  priceHigh: number;
  priceLow: number;
  midpoint: number;
  distance: number; // % from current price
  strength: number; // 1-3
  source: string; // description
}

export interface LevelDetectorResult {
  orderBlocks: OrderBlock[];
  fvgZones: FairValueGap[];
  liquidityPools: LiquidityPool[];
  allLevels: KeyLevel[];
  nearestSupport: KeyLevel | null;
  nearestResistance: KeyLevel | null;
  isAtKeyLevel: boolean;
  nearestLevelDistance: number; // % from current price
}

// ------------------------------------------
// ORDER BLOCK DETECTION (Volume-confirmed)
// ------------------------------------------

function detectOrderBlocks(klines: Kline[], timeframe: string, lookback: number = 30): OrderBlock[] {
  const obs: OrderBlock[] = [];
  const slice = klines.slice(-lookback);
  
  if (slice.length < 5) return obs;

  // Calculate average body and volume
  let totalBody = 0;
  let totalVolume = 0;
  for (const k of slice) {
    totalBody += Math.abs(k.close - k.open);
    totalVolume += k.volume;
  }
  const avgBody = totalBody / slice.length || 1;
  const avgVolume = totalVolume / slice.length || 1;

  for (let i = 1; i < slice.length - 1; i++) {
    const candle = slice[i];
    const body = Math.abs(candle.close - candle.open);
    const volumeRatio = candle.volume / avgVolume;

    // Order block = impulsive candle (body > 2x average) with volume confirmation (> 1.5x)
    if (body > avgBody * 2.0 && volumeRatio > 1.3) {
      const isBullish = candle.close > candle.open;
      
      // The OB is the last opposing candle before the impulsive move
      // For bullish OB: last bearish candle before the big green candle
      // For bearish OB: last bullish candle before the big red candle
      const prevCandle = slice[i - 1];
      const prevIsBullish = prevCandle.close > prevCandle.open;

      if (isBullish && !prevIsBullish) {
        // Bullish OB = the bearish candle before the bullish impulse
        let strength = 1;
        if (volumeRatio > 2.5) strength = 3;
        else if (volumeRatio > 1.8) strength = 2;

        obs.push({
          type: 'BULLISH',
          high: prevCandle.high,
          low: prevCandle.low,
          midpoint: (prevCandle.high + prevCandle.low) / 2,
          volume: candle.volume,
          volumeRatio,
          strength,
          timeframe,
          index: i - 1
        });
      } else if (!isBullish && prevIsBullish) {
        // Bearish OB = the bullish candle before the bearish impulse
        let strength = 1;
        if (volumeRatio > 2.5) strength = 3;
        else if (volumeRatio > 1.8) strength = 2;

        obs.push({
          type: 'BEARISH',
          high: prevCandle.high,
          low: prevCandle.low,
          midpoint: (prevCandle.high + prevCandle.low) / 2,
          volume: candle.volume,
          volumeRatio,
          strength,
          timeframe,
          index: i - 1
        });
      }
    }
  }

  // Return most recent OBs, max 6
  return obs.slice(-6);
}

// ------------------------------------------
// FAIR VALUE GAP (FVG) DETECTION
// ------------------------------------------

function detectFVG(klines: Kline[], lookback: number = 25): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  const slice = klines.slice(-lookback);

  if (slice.length < 3) return fvgs;

  const currentPrice = slice[slice.length - 1].close;

  for (let i = 1; i < slice.length - 1; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    const next = slice[i + 1];

    // Bullish FVG: gap between candle[i-1].high and candle[i+1].low
    // The body of candle[i] is so large it left a gap
    if (next.low > prev.high) {
      const gapSize = ((next.low - prev.high) / currentPrice) * 100;
      if (gapSize > 0.05) { // minimum gap 0.05%
        const filled = currentPrice <= next.low && currentPrice >= prev.high;
        fvgs.push({
          type: 'BULLISH',
          high: next.low,
          low: prev.high,
          midpoint: (next.low + prev.high) / 2,
          size: gapSize,
          filled,
          index: i
        });
      }
    }

    // Bearish FVG: gap between candle[i+1].high and candle[i-1].low
    if (prev.low > next.high) {
      const gapSize = ((prev.low - next.high) / currentPrice) * 100;
      if (gapSize > 0.05) {
        const filled = currentPrice >= next.high && currentPrice <= prev.low;
        fvgs.push({
          type: 'BEARISH',
          high: prev.low,
          low: next.high,
          midpoint: (prev.low + next.high) / 2,
          size: gapSize,
          filled,
          index: i
        });
      }
    }
  }

  // Return unfilled FVGs only (still valid magnet zones), max 4
  return fvgs.filter(f => !f.filled).slice(-4);
}

// ------------------------------------------
// LIQUIDITY POOL DETECTION (Equal Highs/Lows)
// ------------------------------------------

function detectLiquidityPools(klines: Kline[], lookback: number = 40): LiquidityPool[] {
  const pools: LiquidityPool[] = [];
  const slice = klines.slice(-lookback);

  if (slice.length < 10) return pools;

  const currentPrice = slice[slice.length - 1].close;
  const atr = calculateATR(
    slice.map(k => k.high),
    slice.map(k => k.low),
    slice.map(k => k.close),
    14
  );
  const threshold = atr * 0.3; // Prices within 0.3 ATR considered "equal"

  // Cluster equal highs
  const highClusters = clusterPrices(slice.map(k => k.high), threshold);
  for (const cluster of highClusters) {
    if (cluster.count >= 2) { // At least 2 touches
      let strength = 1;
      if (cluster.count >= 4) strength = 3;
      else if (cluster.count >= 3) strength = 2;

      if (cluster.avgPrice > currentPrice) {
        pools.push({
          type: 'ABOVE',
          price: cluster.avgPrice,
          touches: cluster.count,
          strength
        });
      }
    }
  }

  // Cluster equal lows
  const lowClusters = clusterPrices(slice.map(k => k.low), threshold);
  for (const cluster of lowClusters) {
    if (cluster.count >= 2) {
      let strength = 1;
      if (cluster.count >= 4) strength = 3;
      else if (cluster.count >= 3) strength = 2;

      if (cluster.avgPrice < currentPrice) {
        pools.push({
          type: 'BELOW',
          price: cluster.avgPrice,
          touches: cluster.count,
          strength
        });
      }
    }
  }

  return pools.slice(-4);
}

function clusterPrices(prices: number[], threshold: number): { avgPrice: number; count: number }[] {
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { prices: number[] }[] = [];

  let currentCluster: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= threshold) {
      currentCluster.push(sorted[i]);
    } else {
      clusters.push({ prices: currentCluster });
      currentCluster = [sorted[i]];
    }
  }
  clusters.push({ prices: currentCluster });

  return clusters.map(c => ({
    avgPrice: c.prices.reduce((a, b) => a + b, 0) / c.prices.length,
    count: c.prices.length
  }));
}

// ------------------------------------------
// AGGREGATE: isAtKeyLevel check
// ------------------------------------------

function buildKeyLevels(
  currentPrice: number,
  orderBlocks: OrderBlock[],
  fvgZones: FairValueGap[],
  liquidityPools: LiquidityPool[]
): KeyLevel[] {
  const levels: KeyLevel[] = [];

  for (const ob of orderBlocks) {
    const dist = ((ob.midpoint - currentPrice) / currentPrice) * 100;
    levels.push({
      type: 'ORDER_BLOCK',
      side: ob.type === 'BULLISH' ? 'SUPPORT' : 'RESISTANCE',
      priceHigh: ob.high,
      priceLow: ob.low,
      midpoint: ob.midpoint,
      distance: dist,
      strength: ob.strength,
      source: `${ob.type} OB (${ob.timeframe}, vol ${ob.volumeRatio.toFixed(1)}x)`
    });
  }

  for (const fvg of fvgZones) {
    const dist = ((fvg.midpoint - currentPrice) / currentPrice) * 100;
    levels.push({
      type: 'FVG',
      side: fvg.type === 'BULLISH' ? 'SUPPORT' : 'RESISTANCE',
      priceHigh: fvg.high,
      priceLow: fvg.low,
      midpoint: fvg.midpoint,
      distance: dist,
      strength: fvg.size > 0.3 ? 3 : fvg.size > 0.15 ? 2 : 1,
      source: `${fvg.type} FVG (${fvg.size.toFixed(2)}% gap)`
    });
  }

  for (const lp of liquidityPools) {
    const dist = ((lp.price - currentPrice) / currentPrice) * 100;
    levels.push({
      type: 'LIQUIDITY_POOL',
      side: lp.type === 'ABOVE' ? 'RESISTANCE' : 'SUPPORT',
      priceHigh: lp.price,
      priceLow: lp.price,
      midpoint: lp.price,
      distance: dist,
      strength: lp.strength,
      source: `Liquidity Pool (${lp.touches} touches)`
    });
  }

  // Sort by absolute distance to current price
  levels.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));

  return levels;
}

// ------------------------------------------
// MAIN EXPORT: detectKeyLevels
// ------------------------------------------

export function detectKeyLevels(
  klines1h: Kline[],
  klines15m: Kline[],
  currentPrice: number
): LevelDetectorResult {
  // Detect on both timeframes
  const obsH1 = detectOrderBlocks(klines1h, '1h', 30);
  const obs15m = detectOrderBlocks(klines15m, '15m', 25);
  const allOBs = [...obsH1, ...obs15m];

  // FVGs on 1h (more reliable) and 15m
  const fvgH1 = detectFVG(klines1h, 20);
  const fvg15m = detectFVG(klines15m, 20);
  const allFVGs = [...fvgH1, ...fvg15m];

  // Liquidity pools on 1h (wider view)
  const liqPools = detectLiquidityPools(klines1h, 40);

  // Build unified key levels
  const allLevels = buildKeyLevels(currentPrice, allOBs, allFVGs, liqPools);

  // Find nearest support/resistance
  const supports = allLevels.filter(l => l.side === 'SUPPORT' && l.distance <= 0);
  const resistances = allLevels.filter(l => l.side === 'RESISTANCE' && l.distance >= 0);

  const nearestSupport = supports.length > 0
    ? supports.reduce((a, b) => Math.abs(a.distance) < Math.abs(b.distance) ? a : b)
    : null;
  const nearestResistance = resistances.length > 0
    ? resistances.reduce((a, b) => Math.abs(a.distance) < Math.abs(b.distance) ? a : b)
    : null;

  // Check if price is currently at a key level (within 0.3%)
  const nearestLevel = allLevels[0] || null;
  const nearestLevelDistance = nearestLevel ? Math.abs(nearestLevel.distance) : 999;
  const isAtKeyLevel = nearestLevelDistance < 0.3;

  return {
    orderBlocks: allOBs,
    fvgZones: allFVGs,
    liquidityPools: liqPools,
    allLevels,
    nearestSupport,
    nearestResistance,
    isAtKeyLevel,
    nearestLevelDistance
  };
}
