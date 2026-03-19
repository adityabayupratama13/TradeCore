import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { name, startingCapital, activeCapitalPct } = body;

    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }

    const updated = await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: {
        name,
        totalCapital: startingCapital,
      }
    });

    if (activeCapitalPct !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: 'portfolio_active_capital_pct' },
        update: { value: activeCapitalPct.toString() },
        create: { key: 'portfolio_active_capital_pct', value: activeCapitalPct.toString() }
      });
    }

    return NextResponse.json({ success: true, portfolio: updated });
  } catch (error) {
    console.error('API /settings/portfolio error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const portfolio = await prisma.portfolio.findFirst();
    const activePctRaw = await prisma.appSettings.findUnique({ where: { key: 'portfolio_active_capital_pct' } });
    
    return NextResponse.json({
      portfolio,
      activeCapitalPct: activePctRaw ? parseInt(activePctRaw.value) : 80
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
