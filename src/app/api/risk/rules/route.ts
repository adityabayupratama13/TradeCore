import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { z } from 'zod';

const rulesSchema = z.object({
  maxDailyLossPct: z.number().optional(),
  maxWeeklyLossPct: z.number().optional(),
  maxDrawdownPct: z.number().optional(),
  maxPositionSizePct: z.number().optional(),
  maxRiskPerTradePct: z.number().optional(),
  maxLeverage: z.number().optional(),
  maxOpenPositions: z.number().optional(),
  riskPctLargeCap: z.number().optional(),
  riskPctMidCap: z.number().optional(),
  riskPctLowCap: z.number().optional(),
  minProfitTargetPct: z.number().optional(),
  leverageLargeCap: z.number().optional(),
  leverageMidCap: z.number().optional(),
  leverageLowCap: z.number().optional(),
  maxLeverageLarge: z.number().optional(),
  maxLeverageMid: z.number().optional(),
  maxLeverageLow: z.number().optional()
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
