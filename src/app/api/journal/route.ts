import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { z } from 'zod';

const journalSchema = z.object({
  tradeId: z.string(),
  emotionState: z.enum(['CALM', 'FOMO', 'FEARFUL', 'REVENGE', 'CONFIDENT']),
  ruleFollowed: z.boolean(),
  notes: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = journalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { tradeId, emotionState, ruleFollowed, notes } = parsed.data;

    const journal = await prisma.tradeJournal.upsert({
      where: { tradeId },
      update: {
        emotionState,
        ruleFollowed,
        notes: notes || null
      },
      create: {
        tradeId,
        emotionState,
        ruleFollowed,
        notes: notes || null
      }
    });

    return NextResponse.json({ success: true, journal });
  } catch (error) {
    console.error('API /journal POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const emotion = searchParams.get('emotion');
    const result = searchParams.get('result');
    const ruleFollowed = searchParams.get('ruleFollowed');
    const marketType = searchParams.get('marketType');

    let whereClause: any = {};
    let tradeWhere: any = {};

    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (emotion && emotion !== 'All') {
      whereClause.emotionState = { in: emotion.split(',') };
    }

    if (ruleFollowed && ruleFollowed !== 'All') {
      whereClause.ruleFollowed = ruleFollowed === 'true';
    }

    if (result && result !== 'All') {
      if (result === 'WIN') tradeWhere.pnl = { gte: 0 };
      if (result === 'LOSS') tradeWhere.pnl = { lt: 0 };
    }

    if (marketType && marketType !== 'All') {
      tradeWhere.marketType = marketType;
    }

    // Attach tradeWhere if filters exist
    if (Object.keys(tradeWhere).length > 0) {
      whereClause.trade = tradeWhere;
    }

    const entries = await prisma.tradeJournal.findMany({
      where: whereClause,
      include: { trade: true },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error('API /journal GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
