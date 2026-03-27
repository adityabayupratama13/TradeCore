import { prisma } from '../../lib/prisma';
import { fetchOIDataRaw } from './binance';
import { V4_LIQUID_PAIRS } from './btcRegime';

const BINANCE_BASE_URL = process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';
const INDEX_SYMBOLS = ['BTCDOMUSDT','DEFIUSDT','ALTUSDT','BNXUSDT'];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function chunks<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );
}

export type OISignalType = 
  | 'TREND_CONTINUATION'
  | 'SHORT_SQUEEZE_SETUP'
  | 'LONG_SQUEEZE_SETUP'
  | 'SHORT_COVERING'
  | 'LONG_CAPITULATION'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'NEUTRAL';

export interface OISignal {
  type: OISignalType;
  strength: 1 | 2 | 3;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  description: string;
}

export interface OIData {
  symbol: string;
  currentOI: number;
  currentOIValue: number;
  oiChange1h: number;
  oiChange4h: number;
  oiChange24h: number;
  oiTrend: 'RISING' | 'FALLING' | 'STABLE';
  oiMomentum: number;
  longRatio: number;
  shortRatio: number;
  lsRatio: number;
  topTraderLsRatio: number;
  takerBuyRatio: number;
  takerSellRatio: number;
  oiSignal: OISignal;
}

export interface PairData {
  symbol: string;
  fundingRate: number;       
  markPrice: number;
  volume24h: number;         
  priceChange24h: number;    
  highPrice24h: number;
  lowPrice24h: number;
}

export interface ScoredPair extends PairData {
  absFundingRate: number;
  fundingCategory: 'EXTREME' | 'HIGH' | 'MODERATE' | 'NORMAL';
  direction: 'LONG_HEAVY' | 'SHORT_HEAVY' | 'NEUTRAL';
  biasSide: 'PREFER_SHORT' | 'PREFER_LONG' | 'NEUTRAL';
  squeezeRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  tier: 'WATCHLIST' | 'ACTIVE' | 'EXCLUDED';
  oiData: OIData;
  oiSignal: OISignal;
  oiValue: string;
  oiChange1h: string;
}

export interface HunterResult {
  watchlist: ScoredPair[];
  activePairs: ScoredPair[];
  scannedAt: Date;
  totalScanned: number;
  totalPassed: number;
  extremeCount: number;
  highCount: number;
}

function detectOISignal(oiData: OIData | any, priceChange: number, fundingRate: number): OISignal {
  if (oiData.oiChange4h !== null && oiData.oiChange4h > 5 && priceChange < -1 && fundingRate < -0.0003 && oiData.topTraderLsRatio < 0.8) {
    return { type: 'SHORT_SQUEEZE_SETUP', strength: 3, direction: 'BULLISH', description: "🚨 SHORT SQUEEZE SETUP: Massive short buildup + negative funding. Liquidation cascade upward imminent." };
  }
  if (oiData.oiChange4h !== null && oiData.oiChange4h > 5 && priceChange > 1 && fundingRate > 0.0003 && oiData.topTraderLsRatio > 1.5) {
    return { type: 'LONG_SQUEEZE_SETUP', strength: 3, direction: 'BEARISH', description: "🚨 LONG SQUEEZE SETUP: Overleveraged longs + positive funding. Liquidation cascade downward imminent." };
  }
  if (oiData.oiChange4h !== null && oiData.oiChange4h < -8 && priceChange < -3 && oiData.takerSellRatio > 0.65) {
    return { type: 'LONG_CAPITULATION', strength: 2, direction: 'BULLISH', description: "Potential reversal: Mass long liquidation. Exhaustion bottom possible." };
  }
  if (oiData.oiChange4h !== null && oiData.oiChange4h < -5 && priceChange > 0) {
    return { type: 'DISTRIBUTION', strength: 2, direction: 'BEARISH', description: "Distribution: Smart money exiting into strength. Likely reversal coming." };
  }
  if (oiData.oiChange1h !== null && oiData.oiChange1h > 3 && priceChange > 1 && oiData.takerBuyRatio > 0.55) {
    return { type: 'TREND_CONTINUATION', strength: 2, direction: 'BULLISH', description: "Strong trend: OI + price rising together. Longs in control." };
  }
  if (oiData.oiChange1h !== null && oiData.oiChange1h < -3 && priceChange > 1) {
    return { type: 'SHORT_COVERING', strength: 1, direction: 'BULLISH', description: "⚠️ SHORT COVERING: Price up but OI falling. Shorts exiting, not new longs entering. Weak move." };
  }
  if (oiData.oiChange24h !== null && oiData.oiChange24h > 10 && Math.abs(priceChange) < 1 && Math.abs(fundingRate) < 0.0001) {
    return { type: 'ACCUMULATION', strength: 1, direction: 'BULLISH', description: "Smart accumulation: OI building quietly. Big move incoming, direction unknown." };
  }
  return { type: 'NEUTRAL', strength: 1, direction: 'NEUTRAL', description: "No clear signal" };
}

async function fetchOIData(symbol: string, priceChange: number, fundingRate: number): Promise<OIData> {
  const { currentOI: curOI, oiHist, lsRatioAcc, topTraderPos, takerVol } = await fetchOIDataRaw(symbol);
  
  const currentOI = curOI?.openInterest ? parseFloat(curOI.openInterest) : 0;
  
  const hlen = oiHist?.length || 0;
  const currentOIValue = hlen > 0 ? parseFloat(oiHist[hlen - 1].sumOpenInterestValue) : 0;
  
  const getChange = (barsBack: number) => {
    if (hlen <= barsBack) return null; // Protect against demo missing history
    const pastOI = parseFloat(oiHist[hlen - 1 - barsBack].sumOpenInterest);
    const curOICt = parseFloat(oiHist[hlen - 1].sumOpenInterest);
    if (pastOI === 0) return 0;
    return ((curOICt - pastOI) / pastOI) * 100;
  };
  
  const oiChange1h = getChange(1);
  const oiChange4h = getChange(4);
  const oiChange24h = getChange(24);
  
  let oiTrend: 'RISING' | 'FALLING' | 'STABLE' = 'STABLE';
  if (oiChange4h !== null) {
      if (oiChange4h > 2) oiTrend = 'RISING';
      else if (oiChange4h < -2) oiTrend = 'FALLING';
  }

  const llen = lsRatioAcc?.length || 0;
  const lsRatio = llen > 0 ? parseFloat(lsRatioAcc[llen - 1].longShortRatio) : 1;
  const longRatio = llen > 0 ? parseFloat(lsRatioAcc[llen - 1].longAccount) : 0.5;
  const shortRatio = llen > 0 ? parseFloat(lsRatioAcc[llen - 1].shortAccount) : 0.5;

  const tlen = topTraderPos?.length || 0;
  const topTraderLsRatio = tlen > 0 ? parseFloat(topTraderPos[tlen - 1].longShortRatio) : 1;

  const vlen = takerVol?.length || 0;
  const takerBuyVol = vlen > 0 ? parseFloat(takerVol[vlen - 1].buyVol) : 0;
  const takerSellVol = vlen > 0 ? parseFloat(takerVol[vlen - 1].sellVol) : 0;
  const totalTaker = takerBuyVol + takerSellVol;
  const takerBuyRatio = totalTaker > 0 ? takerBuyVol / totalTaker : 0.5;
  const takerSellRatio = totalTaker > 0 ? takerSellVol / totalTaker : 0.5;

  const oiData: OIData | any = {
    symbol,
    currentOI,
    currentOIValue,
    oiChange1h,
    oiChange4h,
    oiChange24h,
    oiTrend,
    oiMomentum: (oiChange1h !== null && oiChange4h !== null) ? oiChange1h - (oiChange4h / 4) : 0,
    longRatio,
    shortRatio,
    lsRatio,
    topTraderLsRatio,
    takerBuyRatio,
    takerSellRatio,
    oiSignal: { type: 'NEUTRAL', strength: 1, direction: 'NEUTRAL', description: 'No signal' }
  };

  oiData.oiSignal = detectOISignal(oiData, priceChange, fundingRate);
  return oiData;
}

export async function runDynamicHunter(): Promise<HunterResult> {
  const OVERRIDE_ACTIVE = false;  // set false to re-enable hunter
  
  const versionSetting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
  const engineVersion = versionSetting?.value || 'v1';
  
  if (OVERRIDE_ACTIVE) {
    const ACTIVE_PAIRS_OVERRIDE = [
      { symbol: 'BTCUSDT',  biasSide: 'NEUTRAL', score: 100 },
      { symbol: 'ETHUSDT',  biasSide: 'NEUTRAL', score: 90 },
      { symbol: 'SOLUSDT',  biasSide: 'NEUTRAL', score: 80 },
      { symbol: 'DOGEUSDT', biasSide: 'NEUTRAL', score: 70 },
      { symbol: 'HYPEUSDT', biasSide: 'NEUTRAL', score: 60 }
    ];
    
    await prisma.appSettings.upsert({
      where: { key: 'active_trading_pairs' },
      update: { value: JSON.stringify(ACTIVE_PAIRS_OVERRIDE) },
      create: { key: 'active_trading_pairs', value: JSON.stringify(ACTIVE_PAIRS_OVERRIDE) }
    });
    
    console.log('✅ Active pairs updated:', ACTIVE_PAIRS_OVERRIDE.map(p => p.symbol).join(', '));
    return {
       watchlist: ACTIVE_PAIRS_OVERRIDE as any,
       activePairs: ACTIVE_PAIRS_OVERRIDE as any,
       scannedAt: new Date(),
       totalScanned: 5,
       totalPassed: 5,
       extremeCount: 0,
       highCount: 0
    };
  }

  console.log('🦅 Hunter: Starting scan...');

  const [fundingRes, tickerRes] = await Promise.all([
    fetch(`${BINANCE_BASE_URL}/fapi/v1/premiumIndex`),
    fetch(`${BINANCE_BASE_URL}/fapi/v1/ticker/24hr`)
  ]);

  const allFundingRates = await fundingRes.json();
  const allTickers = await tickerRes.json();

  const fundingMap: Record<string, any> = {};
  allFundingRates.forEach((f: any) => { fundingMap[f.symbol] = f; });

  // LINE 1 — ABSOLUTE FIRST FILTER
  // If not in SAFE_UNIVERSE → does not exist
  const rawPairs: PairData[] = [];
  const blocked: any[] = [];
  
  allTickers.forEach((t: any) => {
    const f = fundingMap[t.symbol];
    if (f) {
      // 100% ORGANIC SEARCH: Accept ALL coins, abandon hardcoded universes
      rawPairs.push({
        symbol: t.symbol,
        fundingRate: parseFloat(f.lastFundingRate),
        markPrice: parseFloat(f.markPrice),
        volume24h: parseFloat(t.quoteVolume),
        priceChange24h: parseFloat(t.priceChangePercent),
        highPrice24h: parseFloat(t.highPrice),
        lowPrice24h: parseFloat(t.lowPrice)
      });
    }
  });

  const safePairs = rawPairs;
  console.log(`🔒 SAFE filter: ${allTickers.length} → ${safePairs.length} pairs`);
  
  // Verify dangerous coins are blocked
  if (blocked.some(p => Math.abs(p.fundingRate) > 0.001)) {
    console.log('🚫 Blocked dangerous coins:', 
      blocked
        .filter(p => Math.abs(p.fundingRate) > 0.001)
        .map(p => `${p.symbol}(${p.fundingRate})`)
        .join(', ')
    )
  }

  const totalScanned = rawPairs.length;
  
  // STEP 2 - HARD FILTERS
  const afterVolume = safePairs.filter(p => p.volume24h >= 100_000_000);
  const afterFunding = afterVolume.filter(p => Math.abs(p.fundingRate) <= 0.005);
  
  const validPairs = afterFunding.filter(p => {
    if (!p.symbol.endsWith('USDT')) return false;
    if (['USDC', 'BUSD', 'TUSD', 'DAI'].some(stable => p.symbol.includes(stable))) return false;
    if (INDEX_SYMBOLS.includes(p.symbol)) return false;
    if (p.markPrice < 0.01) return false;
    if (p.fundingRate === 0 && p.priceChange24h === 0) return false;
    return true;
  });

  console.log(`After volume filter: ${afterVolume.length} pairs`);
  console.log(`After funding rate cap: ${afterFunding.length} pairs`);
  console.log(`Final candidates: ${validPairs.length} pairs`);

  const totalPassed = validPairs.length;

  // FETCH OI DATA FOR TOP 50 PAIRS
  validPairs.sort((a,b) => b.volume24h - a.volume24h);
  const topValidPairs = validPairs.slice(0, 50);

  const oiDataMap = new Map<string, OIData>();
  const chunkedPairs = chunks(topValidPairs, 10);
  for (let i = 0; i < chunkedPairs.length; i++) {
    const batch = chunkedPairs[i];
    const results = await Promise.all(batch.map(p => fetchOIData(p.symbol, p.priceChange24h, p.fundingRate)));
    results.forEach(r => oiDataMap.set(r.symbol, r));
    console.log(`[Dynamic Hunter] Filtered OI Data Fetch - Batch ${i + 1}/${chunkedPairs.length} Completed`);
    await sleep(100);
  }

  // STEP 3 - SCORE EVERY PAIR
  const scoredPairs: ScoredPair[] = topValidPairs.map(p => {
    const absFR = Math.abs(p.fundingRate);
    let score = absFR * 100000;

    if (p.volume24h > 1_000_000_000) score *= 2.0;
    else if (p.volume24h > 500_000_000) score *= 1.5;
    else if (p.volume24h > 100_000_000) score *= 1.2;
    else score *= 1.0;

    let direction: 'LONG_HEAVY' | 'SHORT_HEAVY' | 'NEUTRAL' = 'NEUTRAL';
    let biasSide: 'PREFER_SHORT' | 'PREFER_LONG' | 'NEUTRAL' = 'NEUTRAL';
    if (p.fundingRate > 0) {
      direction = 'LONG_HEAVY';
      biasSide = 'PREFER_SHORT';
    } else if (p.fundingRate < 0) {
      direction = 'SHORT_HEAVY';
      biasSide = 'PREFER_LONG';
    }

    const isBullMomentum = p.priceChange24h > 2;
    const isBearMomentum = p.priceChange24h < -2;
    if (direction === 'SHORT_HEAVY' && isBullMomentum) score *= 1.3;
    if (direction === 'LONG_HEAVY' && isBearMomentum) score *= 1.3;

    let squeezeRisk: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (p.volume24h < 50_000_000) squeezeRisk = 'HIGH';
    else if (p.volume24h < 200_000_000) squeezeRisk = 'MEDIUM';
    else squeezeRisk = 'LOW';

    let fundingCategory: 'EXTREME' | 'HIGH' | 'MODERATE' | 'NORMAL' = 'NORMAL';
    if (absFR > 0.0003) { fundingCategory = 'EXTREME'; score *= 2; }
    else if (absFR > 0.0001) { fundingCategory = 'HIGH'; score *= 1.5; }
    else if (absFR > 0.00005) { fundingCategory = 'MODERATE'; }

    const oiData = oiDataMap.get(p.symbol)!;
    const oiSignal = oiData.oiSignal;
    
    // OI bonus/penalty to existing score
    let oiBonus = 0;
    if (oiSignal.type === 'SHORT_SQUEEZE_SETUP') oiBonus = +50;
    if (oiSignal.type === 'LONG_SQUEEZE_SETUP') oiBonus = +50;
    if (oiSignal.type === 'TREND_CONTINUATION') oiBonus = +20;
    if (oiSignal.type === 'ACCUMULATION') oiBonus = +10;
    if (oiSignal.type === 'SHORT_COVERING') oiBonus = -10;
    if (oiSignal.type === 'DISTRIBUTION') oiBonus = -20;
    
    score += (oiBonus * oiSignal.strength);

    return {
      ...p,
      absFundingRate: absFR,
      fundingCategory,
      direction,
      biasSide,
      squeezeRisk,
      score,
      tier: 'EXCLUDED',
      oiData,
      oiSignal,
      oiValue: oiData.currentOIValue > 0 ? `$${(oiData.currentOIValue / 1e9).toFixed(2)}B` : '—',
      oiChange1h: oiData.oiChange1h !== null ? `${oiData.oiChange1h > 0 ? '+' : ''}${oiData.oiChange1h.toFixed(2)}%` : 'N/A'
    };
  });

  // STEP 4 - BUILD WATCHLIST
  scoredPairs.sort((a, b) => b.score - a.score);
  
  // Apply Special OI Override
  let watchlistRaw: ScoredPair[] = [];
  const squeezePairs = scoredPairs.filter(p => p.oiSignal.type === 'SHORT_SQUEEZE_SETUP' || p.oiSignal.type === 'LONG_SQUEEZE_SETUP');
  const normalPairs = scoredPairs.filter(p => !squeezePairs.map(s => s.symbol).includes(p.symbol));
  
  watchlistRaw = [...squeezePairs, ...normalPairs].slice(0, 20);

  const watchlist = watchlistRaw.map(p => ({ ...p, tier: 'WATCHLIST' as const }));

  await prisma.appSettings.upsert({
    where: { key: 'hunter_watchlist' },
    update: { value: JSON.stringify(watchlist) },
    create: { key: 'hunter_watchlist', value: JSON.stringify(watchlist) }
  });

  let extremeCount = 0;
  let highCount = 0;
  watchlist.forEach(p => {
    if (p.fundingCategory === 'EXTREME') extremeCount++;
    if (p.fundingCategory === 'HIGH') highCount++;
  });

  // STEP 5 - SELECT ACTIVE TRADING PAIRS
  let finalActive: any[] = [];
  
  // V3 scans up to 100 pairs locally (shortlisting) before hitting AI
  // V4 scans top 30 pairs 
  let topCoinsCount = 20;
  if (engineVersion === 'v3') topCoinsCount = 100;
  else if (engineVersion === 'v4') topCoinsCount = 30;

  const topCoins = scoredPairs
    .filter(p => (engineVersion === 'v4' || engineVersion === 'v3') ? true : p.fundingCategory !== 'NORMAL')
    .slice(0, topCoinsCount);
  finalActive = topCoins.map(p => ({ ...p, tier: 'ACTIVE' as const }));
  
  console.log('🎯 Final active pairs:', finalActive.map(p => p.symbol));

  await prisma.appSettings.upsert({
    where: { key: 'active_trading_pairs' },
    update: { value: JSON.stringify(finalActive) },
    create: { key: 'active_trading_pairs', value: JSON.stringify(finalActive) }
  });

  // Sync Watchlist Tier labels manually to return full state to UI correctly
  const returnWatchlist = watchlist.map(w => {
    if (finalActive.find(a => a.symbol === w.symbol)) return { ...w, tier: 'ACTIVE' as const };
    return w;
  });

  return {
    watchlist: returnWatchlist,
    activePairs: finalActive,
    scannedAt: new Date(),
    totalScanned,
    totalPassed,
    extremeCount,
    highCount
  };
}
