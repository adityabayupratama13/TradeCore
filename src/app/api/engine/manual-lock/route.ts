import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { cancelAllOrders } from '../../../../lib/binance';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const wibOffset = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(Date.now() + wibOffset);
    
    // Lock until tomorrow 00:00 WIB
    const tomorrowWIB = new Date(nowWIB);
    tomorrowWIB.setDate(nowWIB.getDate() + 1);
    tomorrowWIB.setUTCHours(0, 0, 0, 0);
    const lockedUntil = new Date(tomorrowWIB.getTime() - wibOffset).toISOString();

    await prisma.appSettings.upsert({
      where: { key: 'circuit_breaker_lock_until' },
      update: { value: lockedUntil },
      create: { key: 'circuit_breaker_lock_until', value: lockedUntil }
    });

    const portfolio = await prisma.portfolio.findFirst();
    await prisma.riskEvent.create({
      data: {
        eventType: 'MANUAL_LOCK',
        description: 'Manual emergency circuit breaker locked',
        capitalAtEvent: portfolio?.totalCapital || 0
      }
    });

    // Cancel all open orders for safe universe
    let cancelledCount = 0;
    const activeSetting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
    if (activeSetting?.value) {
      const activePairs = JSON.parse(activeSetting.value);
      for (const pair of activePairs) {
        try { 
          await cancelAllOrders(pair.symbol); 
          cancelledCount++;
        } catch (e) {}
      }
    }

    return NextResponse.json({
      success: true,
      lockedUntil,
      message: `Emergency lock applied.`
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
