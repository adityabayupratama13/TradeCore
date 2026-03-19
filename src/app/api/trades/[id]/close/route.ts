import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { z } from 'zod';

const closeTradeSchema = z.object({
  exitPrice: z.number().positive(),
  exitAt: z.string().datetime().optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = closeTradeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { exitPrice, exitAt } = parsed.data;

    const currentTrade = await prisma.trade.findUnique({
      where: { id }
    });

    if (!currentTrade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    if (currentTrade.status === 'CLOSED') {
      return NextResponse.json({ error: 'Trade already closed' }, { status: 400 });
    }

    // Calculate PnL
    let pnl = 0;
    const entryValue = currentTrade.entryPrice * currentTrade.quantity;
    const exitValue = exitPrice * currentTrade.quantity;

    if (currentTrade.direction === 'LONG' || currentTrade.direction === 'BUY') {
      pnl = exitValue - entryValue;
    } else {
      pnl = entryValue - exitValue;
    }

    // Calculate PnL %
    // To match actual return on capital required, we must factor leverage
    // Margin required = entryValue / leverage
    const margin = entryValue / currentTrade.leverage;
    const pnlPct = (pnl / margin) * 100;

    const updatedTrade = await prisma.trade.update({
      where: { id },
      data: {
        status: 'CLOSED',
        exitPrice,
        exitAt: exitAt ? new Date(exitAt) : new Date(),
        pnl,
        pnlPct
      }
    });

    return NextResponse.json({ success: true, trade: updatedTrade });
  } catch (error) {
    console.error('API /trades/[id]/close PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
