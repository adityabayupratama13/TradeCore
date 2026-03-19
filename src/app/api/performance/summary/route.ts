import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { calculateProfitFactor, calculateMaxDrawdown, calculateSharpeRatio } from '../../../../lib/performanceCalculations';

export async function GET() {
  try {
    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) {
      return NextResponse.json({ error: 'No portfolio found' }, { status: 404 });
    }

    const closedTrades = await prisma.trade.findMany({
      where: { status: 'CLOSED' },
      orderBy: { exitAt: 'asc' }
    });

    // Equity Curve & Drawdown
    let currentEquity = portfolio.totalCapital;
    const equityCurve = [currentEquity];
    
    // Group monthly returns for Sharpe roughly
    const monthlyPnL: Record<string, number> = {};

    let totalWins = 0;
    let totalLosses = 0;
    const winAmounts: number[] = [];
    const lossAmounts: number[] = [];
    
    closedTrades.forEach(t => {
      const pnl = t.pnl || 0;
      currentEquity += pnl;
      equityCurve.push(currentEquity);

      if (t.exitAt) {
        const monthKey = t.exitAt.toISOString().slice(0, 7); // YYYY-MM
        monthlyPnL[monthKey] = (monthlyPnL[monthKey] || 0) + pnl;
      }

      if (pnl >= 0) {
        totalWins++;
        winAmounts.push(pnl);
      } else {
        totalLosses++;
        lossAmounts.push(pnl);
      }
    });

    const maxDrawdownPct = calculateMaxDrawdown(equityCurve);
    const profitFactor = calculateProfitFactor(winAmounts, lossAmounts);
    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    
    // Avg RR
    const avgWin = winAmounts.length > 0 ? winAmounts.reduce((a, b) => a + b, 0) / winAmounts.length : 0;
    const avgLoss = lossAmounts.length > 0 ? Math.abs(lossAmounts.reduce((a, b) => a + b, 0) / lossAmounts.length) : 0;
    const avgRiskReward = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 99 : 0);

    // Simplified Sharpe
    const monthlyReturns = Object.values(monthlyPnL).map(pnl => pnl / portfolio.totalCapital); // simplistic % return per month
    const sharpeRatio = calculateSharpeRatio(monthlyReturns);

    const totalReturnIDR = currentEquity - portfolio.totalCapital;
    const totalReturnPct = (totalReturnIDR / portfolio.totalCapital) * 100;

    return NextResponse.json({
      totalReturnPct,
      totalReturnIDR,
      startDate: portfolio.createdAt.toISOString().split('T')[0], // Using portfolio update/creation
      winRate,
      totalWins,
      totalLosses,
      totalTrades,
      profitFactor,
      maxDrawdownPct,
      avgRiskReward,
      sharpeRatio
    });
  } catch (error) {
    console.error('API /performance/summary error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
