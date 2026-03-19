import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const portfolio = await prisma.portfolio.findFirst();
    const startingCapital = portfolio?.totalCapital || 1;

    const openTrades = await prisma.trade.findMany({
      where: { status: 'OPEN' },
      orderBy: { entryAt: 'desc' }
    });

    // We can fetch live prices for SAHAM manually from AppSettings
    const mapped = openTrades.map((t: any) => {
      // Calculate naive basic exposure mapping
      const positionSizePct = ((t.entryPrice * t.quantity) / (t.leverage || 1)) / startingCapital * 100;
      
      const riskAmount = t.stopLoss && t.stopLoss > 0 
        ? Math.abs(t.entryPrice - t.stopLoss) * t.quantity
        : 0; // naive mapping, ignoring leverage nuances for simple crypto
        
      const riskPct = (riskAmount / startingCapital) * 100;

      return {
        ...t,
        positionSizePct,
        riskAmount,
        riskPct
      };
    });

    const totalExposureIDR = mapped.reduce((sum: number, t: any) => sum + ((t.entryPrice * t.quantity) / (t.leverage || 1)), 0);
    const totalExposurePct = (totalExposureIDR / startingCapital) * 100;

    return NextResponse.json({
      positions: mapped,
      totalExposureIDR,
      totalExposurePct,
      openCount: mapped.length
    });
  } catch (error) {
    console.error('API /risk/exposure error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
