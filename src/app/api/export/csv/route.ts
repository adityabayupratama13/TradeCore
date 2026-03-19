import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const trades = await prisma.trade.findMany({
      orderBy: { entryAt: 'asc' }
    });

    if (trades.length === 0) {
      return NextResponse.json({ error: 'No trades to export' }, { status: 400 });
    }

    const headers = [
      'ID', 'Symbol', 'MarketType', 'Direction', 'Status', 
      'EntryDate', 'ExitDate', 'EntryPrice', 'ExitPrice', 'Quantity', 
      'Leverage', 'StopLoss', 'TakeProfit', 'Fees', 'PnL', 'PnLPct', 'Notes'
    ];

    const rows = trades.map((t: any) => [
      t.id,
      t.symbol,
      t.marketType,
      t.direction,
      t.status,
      t.entryAt.toISOString(),
      t.exitAt ? t.exitAt.toISOString() : '',
      t.entryPrice,
      t.exitPrice || '',
      t.quantity,
      t.leverage || 1,
      t.stopLoss || '',
      t.takeProfit || '',
      t.fees,
      t.pnl || '',
      t.pnlPct || '',
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any) => row.join(','))
    ].join('\n');

    const yyyy = new Date().getFullYear();
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const dd = String(new Date().getDate()).padStart(2, '0');
    const filename = `tradecore-trades-${yyyy}-${mm}-${dd}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    console.error('API /export/csv error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
