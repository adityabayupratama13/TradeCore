export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatUSDCompact(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return '$' + (amount / 1000).toFixed(2) + 'K';
  }
  return formatUSD(amount);
}

export function formatPnL(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return sign + formatUSD(amount);
}

export function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}
