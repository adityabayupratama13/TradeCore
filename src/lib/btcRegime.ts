import { getKlines, getMarkPrice } from './binance';
import { calculateEMA, calculateADX, calculateATR } from './aiEngine';

// ==========================================
// ENGINE V4: BTC REGIME FILTER
// Check BTC 4H trend before allowing any trade
// ==========================================

export type BtcRegime = 'BULLISH' | 'BEARISH' | 'RANGING' | 'UNKNOWN';

export interface BtcRegimeResult {
  regime: BtcRegime;
  allowLong: boolean;
  allowShort: boolean;
  btcPrice: number;
  adx: number;
  ema20: number;
  ema50: number;
  reasoning: string;
}

let cachedRegime: BtcRegimeResult | null = null;
let lastRegimeFetch = 0;
const REGIME_CACHE_MS = 4 * 60 * 1000; // Cache 4 minutes (aligns to 4H candle updates)

export async function checkBtcRegime(): Promise<BtcRegimeResult> {
  // Cache to avoid calling Binance API on every cycle
  if (cachedRegime && Date.now() - lastRegimeFetch < REGIME_CACHE_MS) {
    return cachedRegime;
  }

  try {
    const [klines4h, markPrice] = await Promise.all([
      getKlines('BTCUSDT', '4h', 50),
      getMarkPrice('BTCUSDT')
    ]);

    const btcPrice = markPrice.markPrice;
    const closes = klines4h.map(k => k.close);
    const highs = klines4h.map(k => k.high);
    const lows = klines4h.map(k => k.low);

    const ema20Arr = calculateEMA(closes, 20);
    const ema50Arr = calculateEMA(closes, 50);
    const ema20 = ema20Arr[ema20Arr.length - 1];
    const ema50 = ema50Arr[ema50Arr.length - 1];
    const adx = calculateADX(highs, lows, closes, 14);

    // EMA spread as % of price
    const emaSep = Math.abs(ema20 - ema50) / btcPrice * 100;

    let regime: BtcRegime;
    let allowLong = false;
    let allowShort = false;
    let reasoning = '';

    if (adx < 18 || emaSep < 0.3) {
      // Weak trend = ranging market
      regime = 'RANGING';
      // In ranging, allow both sides but with stricter confidence check
      allowLong = true;
      allowShort = true;
      reasoning = `BTC ranging (ADX=${adx.toFixed(1)}, EMA sep=${emaSep.toFixed(2)}%). Both sides allowed with higher confidence.`;
    } else if (ema20 > ema50 && btcPrice > ema20) {
      // Clear uptrend
      regime = 'BULLISH';
      allowLong = true;
      allowShort = false; // No short against BTC uptrend
      reasoning = `BTC bullish (EMA20 > EMA50, price above both, ADX=${adx.toFixed(1)}). LONG only.`;
    } else if (ema20 < ema50 && btcPrice < ema20) {
      // Clear downtrend
      regime = 'BEARISH';
      allowLong = false; // No long against BTC downtrend
      allowShort = true;
      reasoning = `BTC bearish (EMA20 < EMA50, price below both, ADX=${adx.toFixed(1)}). SHORT only.`;
    } else {
      // Mixed signals — allow both but note the conflict
      regime = 'RANGING';
      allowLong = true;
      allowShort = true;
      reasoning = `BTC mixed signals (EMA20=${ema20.toFixed(0)} vs EMA50=${ema50.toFixed(0)}, ADX=${adx.toFixed(1)}). Both sides allowed.`;
    }

    const result: BtcRegimeResult = {
      regime,
      allowLong,
      allowShort,
      btcPrice,
      adx,
      ema20,
      ema50,
      reasoning
    };

    cachedRegime = result;
    lastRegimeFetch = Date.now();

    console.log(`[V4-BTC-GATE] Regime: ${regime} | Long: ${allowLong} | Short: ${allowShort} | ${reasoning}`);

    return result;

  } catch (err: any) {
    console.error('[V4-BTC-GATE] Failed to check BTC regime:', err.message);
    // Fallback: allow both sides if API fails
    return {
      regime: 'UNKNOWN',
      allowLong: true,
      allowShort: true,
      btcPrice: 0,
      adx: 0,
      ema20: 0,
      ema50: 0,
      reasoning: 'API error — both sides allowed as fallback'
    };
  }
}

// ==========================================
// V4: LIQUID PAIR WHITELIST
// Only trade pairs with tight spreads and high volume
// ==========================================

export const V4_LIQUID_PAIRS = new Set([
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT',          // Large cap
  'SOLUSDT', 'XRPUSDT', 'ADAUSDT',          // Mid cap A
  'LINKUSDT', 'DOGEUSDT', 'AVAXUSDT',       // Mid cap B
  'DOTUSDT', 'LTCUSDT', 'ATOMUSDT',         // Mid cap C
  'NEARUSDT', 'APTUSDT', 'INJUSDT'          // Mid cap D
]);

export function isLiquidPair(symbol: string): boolean {
  return V4_LIQUID_PAIRS.has(symbol);
}

// ==========================================
// V4: BALANCE-AWARE LEVERAGE
// Safe but aggressive enough to profit
// ==========================================

export function getV4Leverage(symbol: string, realBalance: number): number {
  // Base leverage by balance tier — no more 20-25x madness
  let baseLev: number;
  if (realBalance < 50) {
    baseLev = 5;   // Very small account — minimize ruin risk
  } else if (realBalance < 100) {
    baseLev = 8;   // Small account
  } else if (realBalance < 300) {
    baseLev = 10;  // Growing account
  } else {
    baseLev = 12;  // Healthy account
  }

  // Large caps (BTC, ETH, BNB) always slightly lower leverage
  const LARGE_CAP = new Set(['BTCUSDT', 'ETHUSDT', 'BNBUSDT']);
  if (LARGE_CAP.has(symbol)) {
    return Math.max(baseLev - 2, 3); // -2 from base, min 3x
  }

  return baseLev;
}
