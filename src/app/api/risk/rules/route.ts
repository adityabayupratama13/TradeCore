import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { z } from 'zod';

const rulesSchema = z.object({
  maxDailyLossPct: z.number().min(1).max(10).optional(),
  maxWeeklyLossPct: z.number().min(3).max(20).optional(),
  maxDrawdownPct: z.number().min(5).max(30).optional(),
  maxPositionSizePct: z.number().min(5).max(50).optional(),
  maxRiskPerTradePct: z.number().min(0.5).max(5).optional(),
  maxLeverage: z.number().min(1).max(20).optional(),
  maxOpenPositions: z.number().min(1).max(10).optional()
});

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const parsed = rulesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation Error', details: parsed.error.issues }, { status: 400 });
    }

    let activeRule = await prisma.riskRule.findFirst({ where: { isActive: true } });
    if (!activeRule) {
      activeRule = await prisma.riskRule.create({ data: {} });
    }

    const updated = await prisma.riskRule.update({
      where: { id: activeRule.id },
      data: parsed.data
    });

    const portfolio = await prisma.portfolio.findFirst();

    // Log the risk event
    await prisma.riskEvent.create({
      data: {
        eventType: 'RULES_UPDATED',
        description: 'Risk management rules were updated dynamically.',
        capitalAtEvent: portfolio?.totalCapital || 0,
        metadata: JSON.stringify({ old: activeRule, new: updated })
      }
    });

    return NextResponse.json({ success: true, rules: updated });
  } catch (error) {
    console.error('API /risk/rules error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const activeRule = await prisma.riskRule.findFirst({ where: { isActive: true } });
    return NextResponse.json(activeRule || {});
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
