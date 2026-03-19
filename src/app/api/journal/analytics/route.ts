import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { calculateWinRateByEmotion, calculateRuleCompliance, getEmotionTrend, generateInsights } from '../../../../lib/journalAnalytics';

export async function GET() {
  try {
    const entries = await prisma.tradeJournal.findMany({
      include: { trade: true },
      orderBy: { createdAt: 'desc' }
    });

    const winRateByEmotion = calculateWinRateByEmotion(entries);
    const ruleCompliancePct = calculateRuleCompliance(entries);
    const emotionTrend = getEmotionTrend(entries, 14);
    
    const insights = generateInsights({
      winRateByEmotion,
      ruleCompliancePct,
      totalJournaled: entries.length
    });

    return NextResponse.json({
      winRateByEmotion,
      ruleCompliancePct,
      totalJournaled: entries.length,
      emotionTrend,
      insights
    });
  } catch (error) {
    console.error('API /journal/analytics error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
