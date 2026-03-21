import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const openTrades = await prisma.trade.findMany({
      where: { status: 'OPEN' },
      orderBy: { entryAt: 'desc' },
      include: { portfolio: true },
    });

    const closedTrades = await prisma.trade.findMany({
      where: { status: 'CLOSED' },
      take: 5,
      orderBy: { entryAt: 'desc' },
      include: { portfolio: true },
    });

    const combined = [...openTrades, ...closedTrades].sort(
      (a: any, b: any) => new Date(b.entryAt).getTime() - new Date(a.entryAt).getTime()
    );

    return NextResponse.json(combined);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
