import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { calculateProfitFactor } from '../../../../lib/performanceCalculations';

export async function GET() {
  try {
    const trades = await prisma.trade.findMany({
      where: { status: 'CLOSED' },
      orderBy: { exitAt: 'asc' }
    });

    const cryptoTrades = trades.filter(t => t.marketType === 'CRYPTO_FUTURES');
    const idxTrades = trades.filter(t => t.marketType === 'SAHAM_IDX');

    const computeMetrics = (set: any[]) => {
      let wins: number[] = [];
      let losses: number[] = [];
      let totalPnl = 0;
      
      set.forEach(t => {
        const p = t.pnl || 0;
        totalPnl += p;
        if (p >= 0) wins.push(p);
        else losses.push(p);
      });

      return {
        trades: set.length,
        winRate: set.length > 0 ? (wins.length / set.length) * 100 : 0,
        totalPnl,
        profitFactor: calculateProfitFactor(wins, losses)
      };
    };

    let bestTrade = null;
    let worstTrade = null;
    
    if (trades.length > 0) {
      bestTrade = trades.reduce((best, cur) => (cur.pnl || 0) > (best.pnl || 0) ? cur : best);
      worstTrade = trades.reduce((worst, cur) => (cur.pnl || 0) < (worst.pnl || 0) ? cur : worst);
    }

    // Monthly aggregation
    const monthlyData: Record<string, number> = {};
    const dayCounts: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};
    const activeDaysSet = new Set();

    trades.forEach(t => {
      if (!t.exitAt) return;
      const m = t.exitAt.toISOString().slice(0, 7);
      monthlyData[m] = (monthlyData[m] || 0) + (t.pnl || 0);

      const d = t.exitAt.toISOString().split('T')[0];
      activeDaysSet.add(d);

      const dayOfWeek = t.exitAt.toLocaleDateString('en-US', { weekday: 'long' });
      dayCounts[dayOfWeek] = (dayCounts[dayOfWeek] || 0) + 1;

      const hour = t.exitAt.getHours();
      const hourKey = `${hour}:00–${hour+1}:00`;
      hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1;
    });

    let bestMonth = { month: 'N/A', pnl: 0 };
    let worstMonth = { month: 'N/A', pnl: 0 };

    if (Object.keys(monthlyData).length > 0) {
      const sortedMonths = Object.entries(monthlyData).sort((a, b) => b[1] - a[1]);
      bestMonth = { month: sortedMonths[0][0], pnl: sortedMonths[0][1] };
      worstMonth = { month: sortedMonths[sortedMonths.length - 1][0], pnl: sortedMonths[sortedMonths.length - 1][1] };
    }

    const mostActiveDay = Object.keys(dayCounts).length > 0 
      ? Object.keys(dayCounts).reduce((a, b) => dayCounts[a] > dayCounts[b] ? a : b)
      : 'N/A';
      
    const mostActiveHour = Object.keys(hourCounts).length > 0
      ? Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b)
      : 'N/A';

    const firstTradeDate = trades[0]?.exitAt || new Date();
    const lastTradeDate = trades[trades.length - 1]?.exitAt || new Date();
    const weeksDiff = Math.max(1, (lastTradeDate.getTime() - firstTradeDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
    const avgTradesPerWeek = trades.length / weeksDiff;

    return NextResponse.json({
      byCrypto: computeMetrics(cryptoTrades),
      byIDX: computeMetrics(idxTrades),
      bestTrade,
      worstTrade,
      bestMonth,
      worstMonth,
      avgTradesPerWeek,
      mostActiveDay,
      mostActiveHour,
      totalTradingDays: activeDaysSet.size
    });
  } catch (error) {
    console.error('API /performance/breakdown error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
