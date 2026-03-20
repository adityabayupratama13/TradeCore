import { getTotalCapitalUSD } from '../../../../lib/binance';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { calculateProfitFactor, calculateStreaks, calculateMaxDrawdown } from '../../../../lib/performanceCalculations';

export async function GET() {
  try {
    const trades = await prisma.trade.findMany({
      where: { status: 'CLOSED' },
      orderBy: { exitAt: 'asc' }
    });

    const portfolio = await prisma.portfolio.findFirst();
    const startingCapital = (await getTotalCapitalUSD()) || 1;

    const computeTableMetrics = (set: any[]) => {
      let totalWins = 0;
      let totalLosses = 0;
      let winAmts: number[] = [];
      let lossAmts: number[] = [];
      let holdTimesMs: number[] = [];
      
      set.forEach(t => {
        const p = t.pnl || 0;
        if (p >= 0) {
          totalWins++;
          winAmts.push(p);
        } else {
          totalLosses++;
          lossAmts.push(p);
        }
        
        if (t.entryAt && t.exitAt) {
          holdTimesMs.push(t.exitAt.getTime() - t.entryAt.getTime());
        }
      });

      const avgWin = winAmts.length > 0 ? winAmts.reduce((a,b)=>a+b,0)/winAmts.length : 0;
      const avgLoss = lossAmts.length > 0 ? lossAmts.reduce((a,b)=>a+b,0)/lossAmts.length : 0;
      const largestWin = winAmts.length > 0 ? Math.max(...winAmts) : 0;
      const largestLoss = lossAmts.length > 0 ? Math.min(...lossAmts) : 0;
      
      const avgHoldTimeMs = holdTimesMs.length > 0 ? holdTimesMs.reduce((a,b)=>a+b,0)/holdTimesMs.length : 0;
      
      // Formatting hold time nicely (h m for crypto usually, d h for idx usually, but we'll do standard format)
      let holdTimeStr = '—';
      if (avgHoldTimeMs > 0) {
        const d = Math.floor(avgHoldTimeMs / (1000 * 60 * 60 * 24));
        const h = Math.floor((avgHoldTimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((avgHoldTimeMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (d > 0) holdTimeStr = `${d}d ${h}h`;
        else if (h > 0) holdTimeStr = `${h}h ${m}m`;
        else holdTimeStr = `${m}m`;
      }

      return {
        totalTrades: set.length,
        winRate: set.length > 0 ? (totalWins / set.length) * 100 : 0,
        avgWin,
        avgLoss,
        largestWin,
        largestLoss,
        holdTimeStr,
        profitFactor: calculateProfitFactor(winAmts, lossAmts)
      };
    };

    const cryptoTrades = trades.filter(t => t.marketType === 'CRYPTO_FUTURES');
    const idxTrades = trades.filter(t => t.marketType === 'SAHAM_IDX');

    const table = {
      overall: computeTableMetrics(trades),
      crypto: computeTableMetrics(cryptoTrades),
      idx: computeTableMetrics(idxTrades)
    };

    // Streaks
    const streaks = calculateStreaks(trades);

    // Recovery Factor: Net Profit / Max Drawdown Amount (Not %)
    // First, let's find Max Drawdown Amount
    let currentEquity = startingCapital;
    const equityCurve = [currentEquity];
    trades.forEach(t => {
      currentEquity += (t.pnl || 0);
      equityCurve.push(currentEquity);
    });
    const maxDrawdownPct = calculateMaxDrawdown(equityCurve) / 100; // actual ratio
    
    // To get the absolute max drawdown value from the curve, we do calculation inline:
    let peak = equityCurve[0];
    let maxDrawdownAmt = 0;
    for(const val of equityCurve) {
       if (val > peak) peak = val;
       if (peak - val > maxDrawdownAmt) maxDrawdownAmt = peak - val;
    }

    const netProfit = currentEquity - startingCapital;
    const recoveryFactor = maxDrawdownAmt > 0 ? netProfit / maxDrawdownAmt : (netProfit > 0 ? 99 : 0);

    return NextResponse.json({
      table,
      streaks,
      recoveryFactor
    });
  } catch (error) {
    console.error('API /performance/statistics error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
