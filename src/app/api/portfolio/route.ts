import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getBalance, getTotalCapitalUSD } from '../../../lib/binance';

export async function GET() {
  try {
    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }
    
    try {
      const capital = await getTotalCapitalUSD();
      portfolio.totalCapital = capital;
      portfolio.currency = 'USD';
    } catch(e) {
       console.error("Binance sync fail portfolio route", e);
    }

    return NextResponse.json(portfolio);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
