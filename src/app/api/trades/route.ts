import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { z } from 'zod';

const tradeSchema = z.object({
  portfolioId: z.string().min(1),
  marketType: z.enum(['CRYPTO_FUTURES', 'SAHAM_IDX']),
  symbol: z.string().min(1),
  direction: z.enum(['LONG', 'SHORT', 'BUY', 'SELL']),
  entryPrice: z.number().positive(),
  quantity: z.number().positive(),
  leverage: z.number().positive().default(1),
  stopLoss: z.number().nullable().optional(),
  takeProfit: z.number().nullable().optional(),
  notes: z.string().nullable().optional()
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = tradeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const data = parsed.data;

    // Optional: add server side risk check here again
    
    // Create trade
    const trade = await prisma.trade.create({
      data: {
        portfolioId: data.portfolioId,
        marketType: data.marketType,
        symbol: data.symbol,
        direction: data.direction,
        entryPrice: data.entryPrice,
        quantity: data.quantity,
        leverage: data.leverage,
        stopLoss: data.stopLoss,
        takeProfit: data.takeProfit,
        status: 'OPEN',
      }
    });

    // If there's notes, optionally we can create a journal early or just ignore
    if (data.notes) {
      await prisma.tradeJournal.create({
        data: {
          tradeId: trade.id,
          notes: data.notes,
          emotionState: 'CALM',
          ruleFollowed: true
        }
      });
    }

    return NextResponse.json({ success: true, trade });
  } catch (error) {
    console.error('API /trades POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let whereClause = {};
    if (status) {
      whereClause = { status };
    }

    const trades = await prisma.trade.findMany({
      where: whereClause,
      orderBy: { entryAt: 'desc' },
      include: { journal: true }
    });

    return NextResponse.json(trades);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
