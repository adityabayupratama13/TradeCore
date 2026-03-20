import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const portfolio = await prisma.portfolio.findFirst();
    const rules = await prisma.riskRule.findFirst({ where: { isActive: true } });

    if (!portfolio || !rules) {
      return NextResponse.json({ error: 'Portfolio or Risk Rules missing' }, { status: 404 });
    }

    // Check circuit breaker setting
    const lockSetting = await prisma.appSettings.findUnique({
      where: { key: 'circuit_breaker_lock_until' }
    });

    let isLocked = false;
    let lockedUntil: string | null = null;
    let reason: string | null = null;

    if (lockSetting && new Date(lockSetting.value) > new Date()) {
      isLocked = true;
      lockedUntil = lockSetting.value;
      reason = 'Circuit breaker active';
    }

    // Calculate today's loss
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayTrades = await prisma.trade.findMany({
      where: {
        exitAt: { gte: startOfDay },
        status: 'CLOSED'
      }
    });

    const dailyPnl = todayTrades.reduce((sum: number, trade: any) => sum + (trade.pnl || 0), 0);
    const capitalUsdt = portfolio.totalCapital / 16000;
    const dailyLossPct = dailyPnl < 0 ? (Math.abs(dailyPnl) / capitalUsdt) * 100 : 0;

    // Check if we need to auto-lock now
    if (!isLocked && dailyLossPct >= rules.maxDailyLossPct) {
      isLocked = true;
      reason = `Max daily loss reached (${dailyLossPct.toFixed(2)}%)`;
      
      // Lock until midnight
      const tomorrow = new Date(startOfDay);
      tomorrow.setDate(tomorrow.getDate() + 1);
      lockedUntil = tomorrow.toISOString();

      await prisma.appSettings.upsert({
        where: { key: 'circuit_breaker_lock_until' },
        update: { value: lockedUntil },
        create: { key: 'circuit_breaker_lock_until', value: lockedUntil }
      });
    }

    // Mock weekly and drawdown calculations (would normally query historical records)
    const weeklyLossPct = 0; 
    const drawdownPct = 0;

    // Additional check for maximum allowed drawdown
    if (!isLocked && drawdownPct >= rules.maxDrawdownPct) {
      isLocked = true;
      reason = `Max total drawdown reached (${drawdownPct.toFixed(2)}%)`;
    }

    return NextResponse.json({
      canTrade: !isLocked,
      reason,
      dailyLossPct,
      weeklyLossPct,
      drawdownPct,
      isLocked,
      lockedUntil,
      totalCapital: portfolio.totalCapital
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
