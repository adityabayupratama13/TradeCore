export function calculateLiquidationPrice(entry: number, leverage: number, direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL', mmr: number = 0.004) {
  if (direction === 'LONG' || direction === 'BUY') {
    return entry * (1 - 1 / leverage + mmr);
  } else {
    return entry * (1 + 1 / leverage - mmr);
  }
}

export function calculateRiskAmount(entry: number, stopLoss: number, quantity: number) {
  return Math.abs(entry - stopLoss) * quantity;
}

export function calculateRRRatio(entry: number, stopLoss: number, takeProfit: number) {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  if (risk === 0) return 0;
  return reward / risk;
}

export function calculatePositionSize(entry: number, quantity: number) {
  return entry * quantity;
}

export function calculateMarginRequired(positionSize: number, leverage: number) {
  if (leverage === 0) return positionSize;
  return positionSize / leverage;
}
