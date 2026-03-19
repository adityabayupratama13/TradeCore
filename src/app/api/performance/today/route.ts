import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayTrades = await prisma.trade.findMany({
      where: {
        exitAt: {
          gte: startOfDay,
        },
        status: 'CLOSED'
      }
    });

    const dailyPnl = todayTrades.reduce((sum: number, trade: any) => sum + (trade.pnl || 0), 0);
    const winningTrades = todayTrades.filter((trade: any) => (trade.pnl || 0) > 0).length;
    const winRate = todayTrades.length > 0 ? (winningTrades / todayTrades.length) * 100 : 0;

    return NextResponse.json({
      dailyPnl,
      winRate,
      totalTrades: todayTrades.length,
      winningTrades,
      losingTrades: todayTrades.length - winningTrades
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
