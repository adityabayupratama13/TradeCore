import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function POST() {
  try {
    await prisma.appSettings.upsert({
      where: { key: 'circuit_breaker_lock_until' },
      update: { value: '' },
      create: { key: 'circuit_breaker_lock_until', value: '' }
    });

    const todayWIB = new Date();
    await prisma.dailyPerformance.updateMany({
      where: {
        date: {
          gte: new Date(todayWIB.setHours(0,0,0,0))
        }
      },
      data: {
        dailyPnl: 0,
        dailyPnlPct: 0
      }
    });

    await prisma.appSettings.upsert({
      where: { key: 'daily_loss_pct' },
      update: { value: '0' },
      create: { key: 'daily_loss_pct', value: '0' }
    });

    return NextResponse.json({ success: true, message: 'Lock cleared & daily counter reset' });
  } catch (error) {
    console.error('Clear lock error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
