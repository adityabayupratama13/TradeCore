import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { z } from 'zod';

const manualJournalSchema = z.object({
  date: z.string().datetime().optional(),
  symbol: z.string().min(1),
  direction: z.enum(['LONG', 'SHORT', 'BUY', 'SELL']),
  pnl: z.number(),
  emotionState: z.enum(['CALM', 'FOMO', 'FEARFUL', 'REVENGE', 'CONFIDENT']),
  ruleFollowed: z.boolean(),
  notes: z.string().optional(),
  lessonsLearned: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = manualJournalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { date, symbol, direction, pnl, emotionState, ruleFollowed, notes, lessonsLearned } = parsed.data;

    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) {
      return NextResponse.json({ error: 'No portfolio found' }, { status: 404 });
    }

    // 1. Create a "Dummy/Manual" closed trade to satisfy standard structural integrity
    const trade = await prisma.trade.create({
      data: {
        portfolioId: portfolio.id,
        marketType: ['LONG', 'SHORT'].includes(direction) ? 'CRYPTO_FUTURES' : 'SAHAM_IDX',
        symbol,
        direction,
        entryPrice: 0, // Not applicable for purely manual pnl entry
        exitPrice: 0,
        quantity: 1,
        status: 'CLOSED',
        pnl,
        pnlPct: 0,
        entryAt: date ? new Date(date) : new Date(),
        exitAt: date ? new Date(date) : new Date()
      }
    });

    // 2. Attach journal logic
    const journal = await prisma.tradeJournal.create({
      data: {
        tradeId: trade.id,
        emotionState,
        ruleFollowed,
        notes: notes || null,
        lessonsLearned: lessonsLearned || null,
        createdAt: date ? new Date(date) : new Date()
      }
    });

    return NextResponse.json({ success: true, journal });
  } catch (error) {
    console.error('API /journal/manual POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
