export function calculateWinRateByEmotion(entries: any[]) {
  const stats: Record<string, { total: number; wins: number; losses: number }> = {};

  entries.forEach(entry => {
    const emotion = entry.emotionState || 'UNKNOWN';
    if (!stats[emotion]) stats[emotion] = { total: 0, wins: 0, losses: 0 };
    
    stats[emotion].total++;
    // if trade exists and pnl >= 0 -> win
    const pnl = entry.trade?.pnl || 0;
    if (pnl >= 0) stats[emotion].wins++;
    else stats[emotion].losses++;
  });

  const raw = Object.keys(stats).map(emotion => {
    const s = stats[emotion];
    const winRate = s.total > 0 ? (s.wins / s.total) * 100 : 0;
    return {
      emotion,
      winRate,
      totalTrades: s.total,
      wins: s.wins,
      losses: s.losses
    };
  });

  return raw.sort((a, b) => b.winRate - a.winRate);
}

export function calculateRuleCompliance(entries: any[]) {
  if (entries.length === 0) return 0;
  const followed = entries.filter(e => e.ruleFollowed).length;
  return (followed / entries.length) * 100;
}

export function getEmotionTrend(entries: any[], days: number = 14) {
  // Mini calendar logic
  const trend: any[] = [];
  const now = new Date();
  now.setHours(0,0,0,0);
  
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Convert UTC created at to local boundary correctly if needed
    // Simple slice for standard output comparison
    const dayEntries = entries.filter(e => new Date(e.createdAt).toISOString().split('T')[0] === dateStr);
    
    let dominantEmotion = 'NONE';
    let tradeCount = dayEntries.length;
    let wins = 0;
    let losses = 0;

    if (tradeCount > 0) {
      const counts: Record<string, number> = {};
      dayEntries.forEach(e => {
        counts[e.emotionState] = (counts[e.emotionState] || 0) + 1;
        if ((e.trade?.pnl || 0) >= 0) wins++;
        else losses++;
      });
      dominantEmotion = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }

    trend.push({ date: dateStr, dominantEmotion, tradeCount, wins, losses });
  }
  return trend;
}

export function generateInsights(analytics: any) {
  const insights: string[] = [];
  const { winRateByEmotion, ruleCompliancePct, totalJournaled } = analytics;

  if (totalJournaled === 0) {
    insights.push("📓 Start journaling every trade. Self-awareness is your biggest edge.");
    return insights;
  }

  const fomo = winRateByEmotion.find((e: any) => e.emotion === 'FOMO');
  if (fomo && fomo.winRate < 40 && fomo.totalTrades > 0) {
    insights.push("⚠️ You lose more when trading FOMO. Consider waiting for clearer signals.");
  }

  const revenge = winRateByEmotion.find((e: any) => e.emotion === 'REVENGE');
  if (revenge && revenge.totalTrades > 0) {
    insights.push(`🚨 You have ${revenge.totalTrades} revenge trades causing losses.`);
  }

  const calm = winRateByEmotion.find((e: any) => e.emotion === 'CALM');
  if (calm && calm.winRate > 60 && calm.totalTrades > 0) {
    insights.push("✅ Your best trades happen when you're calm. More patience = more profit.");
  }

  if (ruleCompliancePct < 70 && totalJournaled > 0) {
    insights.push(`📋 You break rules in ${(100 - ruleCompliancePct).toFixed(0)}% of trades. System discipline needs improvement.`);
  }

  return insights.slice(0, 2); // Max 2 insights
}
