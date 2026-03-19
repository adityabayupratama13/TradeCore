import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { closePosition } from '../../../../../lib/binance';
import { sendTelegramAlert } from '../../../../../lib/telegram';

export async function POST(req: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  try {
    const { tradeId } = await params;
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.status !== 'OPEN') {
      return NextResponse.json({ error: 'Trade not found or already closed' }, { status: 404 });
    }

    // Call Binance to close
    const orderRes = await closePosition(trade.symbol, trade.quantity * (trade.direction === 'LONG' ? 1 : -1));

    // Wait until positionSync updates DB, or force update right now:
    await prisma.trade.update({
      where: { id: trade.id },
      data: { status: 'CLOSED', exitAt: new Date() } // pnl synced on next cycle natively
    });

    await sendTelegramAlert({
      type: 'TRADE_CLOSE',
      data: {
        symbol: trade.symbol,
        direction: trade.direction,
        entry: trade.entryPrice,
        exit: 'MANUAL_CLOSE',
        pnl: 'Pending Sync',
        pnlPct: '0',
        profit: true,
        duration: 'Manual Override'
      }
    });

    return NextResponse.json({ success: true, message: 'Position closed via Maker API' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
