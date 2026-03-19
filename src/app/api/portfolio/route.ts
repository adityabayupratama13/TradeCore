import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getBalance } from '../../../lib/binance';

export async function GET() {
  try {
    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }
    
    try {
      const balances = await getBalance();
      const usdt = balances.find((b: any) => b.asset === 'USDT');
      if (usdt && usdt.balance > 0) {
         const idrValue = usdt.balance * 16000;
         await prisma.portfolio.update({
            where: { id: portfolio.id },
            data: { totalCapital: idrValue }
         });
         portfolio.totalCapital = idrValue;
      }
    } catch(e) {
       console.error("Binance sync fail portfolio route", e);
    }

    return NextResponse.json(portfolio);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
