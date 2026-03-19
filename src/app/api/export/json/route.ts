import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const [
      trades,
      journals,
      portfolio,
      settings,
      riskRules,
      riskEvents
    ] = await Promise.all([
      prisma.trade.findMany(),
      prisma.tradeJournal.findMany(),
      prisma.portfolio.findMany(),
      prisma.appSettings.findMany(),
      prisma.riskRule.findMany(),
      prisma.riskEvent.findMany()
    ]);

    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      tables: {
        portfolio,
        appSettings: settings,
        riskRules,
        trades,
        journalEntries: journals,
        riskEvents
      }
    };

    const yyyy = new Date().getFullYear();
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const dd = String(new Date().getDate()).padStart(2, '0');
    const filename = `tradecore-export-${yyyy}-${mm}-${dd}.json`;

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    console.error('API /export/json error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
