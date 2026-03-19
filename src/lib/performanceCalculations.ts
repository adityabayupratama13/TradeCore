export function calculateSharpeRatio(monthlyReturns: number[]): number {
  if (monthlyReturns.length === 0) return 0;
  
  const avgReturn = monthlyReturns.reduce((sum, val) => sum + val, 0) / monthlyReturns.length;
  
  const squaredDiffs = monthlyReturns.map(val => Math.pow(val - avgReturn, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / monthlyReturns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return avgReturn > 0 ? 99 : 0; // Avoid division by zero
  
  // Assuming Risk Free Rate = 0 for simplicity
  return avgReturn / stdDev;
}

export function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;

  let peak = equityCurve[0];
  let maxDrawdown = 0;

  for (const value of equityCurve) {
    if (value > peak) peak = value;
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown * 100; // Returns positive percentage
}

export function calculateProfitFactor(wins: number[], losses: number[]): number {
  const sumWins = wins.reduce((sum, val) => sum + Math.abs(val), 0);
  const sumLosses = losses.reduce((sum, val) => sum + Math.abs(val), 0);
  
  if (sumLosses === 0) return sumWins > 0 ? 99 : 0;
  return sumWins / sumLosses;
}

export function calculateStreaks(trades: any[]) {
  // Assuming trades are sorted oldest to newest
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;

  for (const t of trades) {
    if ((t.pnl || 0) >= 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > maxConsecutiveWins) maxConsecutiveWins = currentWinStreak;
    } else {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentLossStreak;
    }
  }

  return {
    maxConsecutiveWins,
    maxConsecutiveLosses,
    currentWinStreak,
    currentLossStreak,
    currentStreakText: currentWinStreak > 0 
      ? `+${currentWinStreak} wins in a row` 
      : `-${currentLossStreak} losses in a row`
  };
}
