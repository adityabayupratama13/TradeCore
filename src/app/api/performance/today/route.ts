import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const wibOffset = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + wibOffset);
    const startOfTodayWIB = new Date(nowWIB);
    startOfTodayWIB.setUTCHours(0, 0, 0, 0);
    const startOfDay = new Date(startOfTodayWIB.getTime() - wibOffset);

    const todayClosedTrades = await prisma.trade.findMany({
      where: {
        status: 'CLOSED',
        exitAt: {
          gte: startOfDay,
        }
      }
    });

    const dailyPnl = todayClosedTrades.reduce((sum: number, trade: any) => sum + (trade.pnl || 0), 0);

    const portfolio = await prisma.portfolio.findFirst();
    const totalCapital = portfolio?.totalCapital || 1;
    const capitalUsdt = totalCapital > 1000 ? totalCapital / 16500 : totalCapital;
    const dailyPnlPct = (dailyPnl / capitalUsdt) * 100;
    
    // Determine dailyLossUsed
    const dailyLossUsed = dailyPnl < 0 ? Math.abs(dailyPnlPct) : 0;

    const rules = await prisma.riskRule.findFirst({ where: { isActive: true } });
    const dailyLossLimit = rules?.maxDailyLossPct || 10;
    
    const lockSetting = await prisma.appSettings.findUnique({ where: { key: 'circuit_breaker_lock_until' } });
    let isLocked = false;
    let lockedUntil = null;
    
    if (lockSetting && lockSetting.value) {
      const lockTime = new Date(lockSetting.value);
      if (lockTime > new Date()) {
        isLocked = true;
        lockedUntil = lockSetting.value;
      }
    }

    return NextResponse.json({
      dailyPnl,
      dailyPnlPct,
      dailyLossUsed,
      dailyLossLimit,
      isLocked,
      lockedUntil
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
