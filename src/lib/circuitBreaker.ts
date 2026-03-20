import { prisma } from '../../lib/prisma';
import { cancelAllOrders, getPositions } from './binance';
import { sendTelegramAlert } from './telegram';

export interface CircuitBreakerStatus {
  canTrade: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  reason: string | null;
  dailyLossPct: number;
  weeklyLossPct: number;
  drawdownPct: number;
  warnings: string[];
  rules: any;
  capital: number;
}

export async function checkAndEnforceCircuitBreaker(): Promise<CircuitBreakerStatus> {
  const warnings: string[] = [];
  
  // 1. Get current lock status from AppSettings
  const lockSetting = await prisma.appSettings.findUnique({ where: { key: 'circuit_breaker_lock_until' } });
  
  if (lockSetting && lockSetting.value) {
    const lockTime = new Date(lockSetting.value);
    if (lockTime > new Date()) {
      // We are still locked!
      // But we still need to calculate percentages for the UI
      return await calculateMetrics(false, true, lockSetting.value, 'Daily loss limit reached', warnings);
    } else {
      // Lock has expired
      await prisma.appSettings.delete({ where: { key: 'circuit_breaker_lock_until' } });
      const portfolio = await prisma.portfolio.findFirst();
      await prisma.riskEvent.create({
        data: {
          eventType: 'LOCK_EXPIRED',
          description: 'Circuit breaker lock has expired. Trading resumed.',
          capitalAtEvent: portfolio?.totalCapital || 0
        }
      });
    }
  }

  return await calculateMetrics(true, false, null, null, warnings);
}

async function calculateMetrics(
  baseCanTrade: boolean, 
  baseIsLocked: boolean, 
  baseLockedUntil: string | null, 
  baseReason: string | null, 
  warnings: string[]
): Promise<CircuitBreakerStatus> {
  
  const rules = await prisma.riskRule.findFirst({ where: { isActive: true } });
  const portfolio = await prisma.portfolio.findFirst();
  const startingCapital = portfolio?.totalCapital || 1;

  if (!rules) {
    return {
      canTrade: baseCanTrade, isLocked: baseIsLocked, lockedUntil: baseLockedUntil,
      reason: baseReason, dailyLossPct: 0, weeklyLossPct: 0, drawdownPct: 0, warnings, rules: {}, capital: startingCapital
    };
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const tempStartOfWeek = new Date(now);
  const day = tempStartOfWeek.getDay() || 7; // Get current day number, converting Sun. to 7
  if (day !== 1) tempStartOfWeek.setHours(-24 * (day - 1)); // Set to previous Monday
  tempStartOfWeek.setHours(0,0,0,0);
  const startOfWeek = tempStartOfWeek;

  // Fetch closed trades for today and this week
  const recentTrades = await prisma.trade.findMany({
    where: { status: 'CLOSED', exitAt: { gte: startOfWeek } }
  });

  let todayPnl = 0;
  let weekPnl = 0;

  recentTrades.forEach((t: any) => {
    const pnl = t.pnl || 0;
    weekPnl += pnl;
    if (t.exitAt && t.exitAt >= startOfDay) {
      todayPnl += pnl;
    }
  });

  const dailyLossPct = todayPnl < 0 ? (Math.abs(todayPnl) / startingCapital) * 100 : 0;
  const weeklyLossPct = weekPnl < 0 ? (Math.abs(weekPnl) / startingCapital) * 100 : 0;

  let canTrade = baseCanTrade;
  let isLocked = baseIsLocked;
  let lockedUntil = baseLockedUntil;
  let reason = baseReason;

  // Enforce Daily Loss Limit
  if (!isLocked && dailyLossPct >= rules.maxDailyLossPct) {
    canTrade = false;
    isLocked = true;
    
    // Lock until tomorrow 07:00 WIB
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(7, 0, 0, 0); // Local time, assuming system timezone is roughly WIB or used locally
    lockedUntil = tomorrow.toISOString();
    reason = `Daily loss limit of ${rules.maxDailyLossPct}% reached.`;

    await prisma.appSettings.upsert({
      where: { key: 'circuit_breaker_lock_until' },
      update: { value: lockedUntil },
      create: { key: 'circuit_breaker_lock_until', value: lockedUntil }
    });

    await prisma.riskEvent.create({
      data: {
        eventType: 'DAILY_LOCK',
        description: reason,
        capitalAtEvent: startingCapital
      }
    });

    try {
      const positions = await getPositions();
      for (const pos of positions) {
        await cancelAllOrders(pos.symbol);
      }
      await sendTelegramAlert({
        type: 'LOCK',
        data: {
          capital: startingCapital,
          limit: rules.maxDailyLossPct,
          lossPct: dailyLossPct.toFixed(2),
          unlockTime: tomorrow.toLocaleTimeString()
        }
      });
    } catch (err) {
      console.error('Failed to cancel remote orders on CB Lock', err);
    }
  }

  // Check Weekly Limits
  if (weeklyLossPct >= rules.maxWeeklyLossPct) {
    warnings.push(`Weekly loss limit approaching or reached (${weeklyLossPct.toFixed(1)}%). Review mandatory.`);
    
    // Log warning once per day roughly (simplification: we'll log it if not already logged recently)
    const recentWeeklyWarning = await prisma.riskEvent.findFirst({
      where: { eventType: 'WEEKLY_WARNING', createdAt: { gte: startOfDay } }
    });
    if (!recentWeeklyWarning) {
      await prisma.riskEvent.create({
        data: {
          eventType: 'WEEKLY_WARNING',
          description: `Weekly loss reached ${weeklyLossPct.toFixed(1)}% of ${rules.maxWeeklyLossPct}% limit.`,
          capitalAtEvent: startingCapital
        }
      });
    }
  }

  // Check Drawdown Limit
  const allTrades = await prisma.trade.findMany({ where: { status: 'CLOSED' }, orderBy: { exitAt: 'asc' } });
  let currentEq = startingCapital;
  let peakEq = startingCapital;
  allTrades.forEach((t: any) => {
    currentEq += (t.pnl || 0);
    if (currentEq > peakEq) peakEq = currentEq;
  });
  
  const drawdownPct = peakEq > 0 ? ((peakEq - currentEq) / peakEq) * 100 : 0;

  if (drawdownPct >= rules.maxDrawdownPct) {
    warnings.push(`Critical: Maximum Drawdown reached (${drawdownPct.toFixed(1)}%). System evaluation required.`);
    const recentDDWarning = await prisma.riskEvent.findFirst({
      where: { eventType: 'DRAWDOWN_WARNING', createdAt: { gte: startOfDay } }
    });
    if (!recentDDWarning) {
      await prisma.riskEvent.create({
        data: {
          eventType: 'DRAWDOWN_WARNING',
          description: `Drawdown extremely high: ${drawdownPct.toFixed(1)}% (Limit: ${rules.maxDrawdownPct}%).`,
          capitalAtEvent: currentEq
        }
      });
    }
  }

  return {
    canTrade,
    isLocked,
    lockedUntil,
    reason,
    dailyLossPct,
    weeklyLossPct,
    drawdownPct,
    warnings,
    rules,
    capital: startingCapital
  };
}
