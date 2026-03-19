import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const trades = await prisma.trade.findMany({
      take: 5,
      orderBy: { entryAt: 'desc' },
      include: { portfolio: true },
    });
    return NextResponse.json(trades);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
