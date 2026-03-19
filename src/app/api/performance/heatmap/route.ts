import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const months = parseInt(searchParams.get('months') || '6');

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setHours(0,0,0,0);

    const trades = await prisma.trade.findMany({
      where: {
        status: 'CLOSED',
        exitAt: { gte: startDate }
      },
      orderBy: { exitAt: 'asc' }
    });

    const dailyMap: Record<string, any> = {};

    trades.forEach(t => {
      if (!t.exitAt) return;
      const dateStr = t.exitAt.toISOString().split('T')[0];
      
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = {
          date: dateStr,
          pnl: 0,
          pnlPct: 0,
          tradeCount: 0,
          wins: 0,
          losses: 0,
          totalMargin: 0
        };
      }

      const pnl = t.pnl || 0;
      dailyMap[dateStr].pnl += pnl;
      dailyMap[dateStr].tradeCount++;
      if (pnl >= 0) dailyMap[dateStr].wins++;
      else dailyMap[dateStr].losses++;

      // Approximate margin to calculate daily % return later
      dailyMap[dateStr].totalMargin += (t.entryPrice * t.quantity) / (t.leverage || 1);
    });

    // Calculate approx pct return for that day
    const heatmapData = Object.values(dailyMap).map(day => {
      if (day.totalMargin > 0) {
        day.pnlPct = (day.pnl / day.totalMargin) * 100;
      }
      delete day.totalMargin; // cleanup internal
      return day;
    });

    // We can also backfill empty days to 0 if needed, but client UI usually maps dates itself
    return NextResponse.json(heatmapData);
  } catch (error) {
    console.error('API /performance/heatmap error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
