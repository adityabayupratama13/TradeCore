import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || 'ALL'; // 1W | 1M | 3M | ALL

    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) {
      return NextResponse.json({ error: 'No portfolio found' }, { status: 404 });
    }

    const startDate = new Date();
    if (range === '1W') startDate.setDate(startDate.getDate() - 7);
    else if (range === '1M') startDate.setMonth(startDate.getMonth() - 1);
    else if (range === '3M') startDate.setMonth(startDate.getMonth() - 3);
    else startDate.setFullYear(2000); // effectively ALL

    // We build the equity curve point by point sequentially
    // To do this accurately across ranges, we need the initial capital AT the start date.
    // For simplicity, we calculate from inception and just slice the array.
    const allTrades = await prisma.trade.findMany({
      where: { status: 'CLOSED' },
      orderBy: { exitAt: 'asc' }
    });

    let currentEquity = portfolio.totalCapital;
    const fullCurve: Array<{time: string, value: number}> = [];
    
    // Inception point
    fullCurve.push({
      time: portfolio.createdAt.toISOString().split('T')[0],
      value: currentEquity
    });

    allTrades.forEach(t => {
      if (t.exitAt) {
        currentEquity += (t.pnl || 0);
        fullCurve.push({
          time: t.exitAt.toISOString().split('T')[0],
          value: currentEquity
        });
      }
    });

    // Deduplicate by day (take the last value of the day)
    const dailyMap: Record<string, number> = {};
    fullCurve.forEach(pt => {
      dailyMap[pt.time] = pt.value;
    });

    const finalCurve = Object.keys(dailyMap)
      .sort()
      .map(time => ({ time, value: dailyMap[time] }));

    // Now filter by selected range
    const startRangeStr = startDate.toISOString().split('T')[0];
    const filteredCurve = range === 'ALL' 
      ? finalCurve 
      : finalCurve.filter(pt => pt.time >= startRangeStr);

    return NextResponse.json(filteredCurve);
  } catch (error) {
    console.error('API /performance/equity-curve error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
