import yahooFinance from 'yahoo-finance2';

export type MacroStatus = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
export type CryptoFlowStatus = 'ALT_SEASON' | 'ALT_BLEEDING' | 'STABLE';
export type CalendarStatus = 'RED_ZONE' | 'GOLDEN_ZONE' | 'BLUE_ZONE';
export type AIActionFilter = 'ALLOW_LONG_ONLY' | 'ALLOW_SHORT_ONLY' | 'BLOCK_ALL' | 'NO_FILTER';

export interface MacroContext {
  macro: { status: MacroStatus, narrative: string, blockAction: AIActionFilter };
  flow: { status: CryptoFlowStatus, narrative: string };
  calendar: { status: CalendarStatus, narrative: string, forceMode: string | null };
}

// 1. MACRO REGIME (TradFi Correlation)
export async function getMacroRegime(): Promise<{ status: MacroStatus, narrative: string, blockAction: AIActionFilter }> {
  try {
    const safeQuote = async (symbol: string) => {
      try {
        return (await yahooFinance.quote(symbol)) as any;
      } catch(e) {
        return null;
      }
    };

    const [dxy, vix, spx, gold, oil] = await Promise.all([
      safeQuote('DX-Y.NYB'),
      safeQuote('^VIX'),
      safeQuote('^GSPC'),
      safeQuote('GC=F'),
      safeQuote('CL=F')
    ]);

    let riskOffScore = 0;
    let narrative = [];

    const vixVal = vix?.regularMarketPrice || 15;
    if (vixVal > 25) {
      riskOffScore += 3;
      narrative.push(`VIX Panic (${vixVal})`);
    } else if (vixVal > 20) {
      riskOffScore += 1;
    }

    const dxyChg = dxy?.regularMarketChangePercent || 0;
    if (dxyChg > 0.5) {
      riskOffScore += 2;
      narrative.push('DXY Surging');
    }

    const spxChg = spx?.regularMarketChangePercent || 0;
    if (spxChg < -1.0) {
      riskOffScore += 2;
      narrative.push('S&P500 Dumping');
    }

    const oilChg = oil?.regularMarketChangePercent || 0;
    if (oilChg > 2.0) {
      riskOffScore += 1;
      narrative.push('Oil Spiking');
    }

    if (riskOffScore >= 4) {
      return { 
        status: 'RISK_OFF', 
        narrative: `SEVERE RISK OFF: ${narrative.join(', ')}`,
        blockAction: 'ALLOW_SHORT_ONLY'
      };
    } else if (spxChg > 1.0 && vixVal < 18) {
      return {
        status: 'RISK_ON',
        narrative: 'Risk On Environment (SPX rally, VIX calm)',
        blockAction: 'NO_FILTER'
      };
    }

    return { status: 'NEUTRAL', narrative: 'Macro is stable', blockAction: 'NO_FILTER' };
  } catch(e) {
    console.error('[Macro] Error fetching Yahoo Finance:', e);
    return { status: 'NEUTRAL', narrative: 'Failed to fetch macro, fallback to Neutral', blockAction: 'NO_FILTER' };
  }
}

// 2. CRYPTO FLOW (Money Dominance)
export async function getCryptoFlow(): Promise<{ status: CryptoFlowStatus, narrative: string }> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', { headers: { 'Accept': 'application/json' }});
    if (!res.ok) throw new Error('CoinGecko API failed');
    const data = await res.json();
    
    // As CoinGecko doesn't give precise historical % change for dominance directly in /global,
    // we use static thresholds. Better approached via historical DB charting, but for simple snapshot:
    const btcD = data.data.market_cap_percentage.btc;
    const usdtD = data.data.market_cap_percentage.usdt || 0;

    // A rough heuristic: High USDT dominance (>5%) usually implies money left crypto.
    // Extremely high BTC dominance (>55-60%) implies altcoin bleed.
    // This is a naive snapshot approach without historical context.
    
    let narrative = `BTC.D: ${btcD.toFixed(1)}% | USDT.D: ${usdtD.toFixed(1)}%`;
    
    if (usdtD > 6.0) {
      return { status: 'ALT_BLEEDING', narrative: narrative + ' (High Cash positions)' };
    } else if (btcD < 50 && usdtD < 4.0) {
      return { status: 'ALT_SEASON', narrative: narrative + ' (Money flowing into Alts)' };
    }

    return { status: 'STABLE', narrative };
  } catch(e) {
    console.error('[Macro] Error fetching CoinGecko:', e);
    return { status: 'STABLE', narrative: 'Fallback STABLE due to CG error' };
  }
}

// 3. CALENDAR REGIME (Time-based Zone)
export function getCalendarRegime(): { status: CalendarStatus, narrative: string, forceMode: string | null } {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday... 4 = Thursday, 5 = Friday, 6 = Saturday
  const hour = now.getUTCHours();
  
  // Golden Zone: Saturday (6) and Sunday (0)
  if (day === 0 || day === 6) {
    return { 
      status: 'GOLDEN_ZONE', 
      narrative: 'Weekend Organic Market (Institutional Off)',
      forceMode: 'AGGRESSIVE' // Bisa overrule engine ke V4/Aggressive
    };
  }

  // Red Zone: Thursday (4) and Friday (5) during US Open Session (13:00 to 16:00 UTC)
  if ((day === 4 || day === 5) && (hour >= 13 && hour <= 16)) {
    return {
      status: 'RED_ZONE',
      narrative: 'US Open Macro Data Release Window (High Manipulation Risk)',
      forceMode: 'PAUSE_TRADING'
    };
  }

  return {
    status: 'BLUE_ZONE',
    narrative: 'Standard Mid-Week Market',
    forceMode: null
  };
}

export async function fetchFullMacroContext(): Promise<MacroContext> {
  const [macro, flow] = await Promise.all([
    getMacroRegime(),
    getCryptoFlow()
  ]);
  const calendar = getCalendarRegime();

  return { macro, flow, calendar };
}
