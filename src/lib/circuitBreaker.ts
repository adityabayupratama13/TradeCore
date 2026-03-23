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
  dailyProfitTarget: number;
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

  const targetSetting = await prisma.appSettings.findUnique({ where: { key: 'daily_profit_target_usd' } });
  const dailyProfitTarget = targetSetting ? parseFloat(targetSetting.value) : 350;

  if (!rules) {
    return {
      canTrade: baseCanTrade, isLocked: baseIsLocked, lockedUntil: baseLockedUntil,
      reason: baseReason, dailyLossPct: 0, weeklyLossPct: 0, drawdownPct: 0, warnings, rules: {}, capital: startingCapital, dailyProfitTarget
    };
  }

  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + wibOffset);
  const startOfTodayWIB = new Date(nowWIB);
  startOfTodayWIB.setUTCHours(0, 0, 0, 0); 
  const startOfDay = new Date(startOfTodayWIB.getTime() - wibOffset);
  
  const tempStartOfWeek = new Date(nowWIB);
  const day = tempStartOfWeek.getUTCDay() || 7; 
  if (day !== 1) tempStartOfWeek.setUTCHours(-24 * (day - 1));
  tempStartOfWeek.setUTCHours(0,0,0,0);
  const startOfWeek = new Date(tempStartOfWeek.getTime() - wibOffset);

  // ── SIMULATED CAPITAL BASELINE ────────────────────────────────────────
  // Jika simulated capital aktif, gunakan waktu aktivasi sebagai floor
  // sehingga loss sebelum aktivasi tidak masuk perhitungan circuit breaker
  const simulatedCapSetting = await prisma.appSettings.findUnique({ where: { key: 'simulated_capital_usd' } });
  const simulatedActivatedAt = await prisma.appSettings.findUnique({ where: { key: 'simulated_capital_activated_at' } });
  const isSimulated = simulatedCapSetting?.value && parseFloat(simulatedCapSetting.value) > 0;
  const baselineTime = isSimulated && simulatedActivatedAt?.value
    ? new Date(simulatedActivatedAt.value)
    : null;

  // Effective start times: gunakan yang paling baru antara normal window vs baseline aktivasi
  const effectiveStartOfDay = baselineTime && baselineTime > startOfDay ? baselineTime : startOfDay;
  const effectiveStartOfWeek = baselineTime && baselineTime > startOfWeek ? baselineTime : startOfWeek;
  
  if (baselineTime) {
    console.log(`🎭 [Simulated Capital] Using baseline: ${baselineTime.toISOString()} — ignoring trades before this time`);
  }
  // ─────────────────────────────────────────────────────────────────────

  // Fetch closed trades for today and this week
  const recentTrades = await prisma.trade.findMany({
    where: { status: 'CLOSED', exitAt: { gte: effectiveStartOfWeek } }
  });

  let todayPnl = 0;
  let weekPnl = 0;

  recentTrades.forEach((t: any) => {
    const pnl = t.pnl || 0;
    weekPnl += pnl;
    if (t.exitAt && t.exitAt >= effectiveStartOfDay) {
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
    
    // Lock until tomorrow 00:00 WIB
    const tomorrowWIB = new Date(nowWIB);
    tomorrowWIB.setDate(nowWIB.getDate() + 1);
    tomorrowWIB.setUTCHours(0, 0, 0, 0);
    lockedUntil = new Date(tomorrowWIB.getTime() - wibOffset).toISOString();
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

    const activeSetting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
    if (activeSetting?.value) {
      const activePairs = JSON.parse(activeSetting.value);
      for (const pair of activePairs) {
        try { await cancelAllOrders(pair.symbol); } catch (err) { }
      }
    }
    
    await sendTelegramAlert({
      type: 'LOCK',
      data: {
        capital: startingCapital,
        limit: rules.maxDailyLossPct,
        lossPct: dailyLossPct.toFixed(2),
        unlockTime: new Date(lockedUntil).toLocaleString()
      }
    });
    console.log('🔒 CIRCUIT BREAKER LOCKED until', lockedUntil);
  }

  // Enforce Daily Profit Target Lock
  if (!isLocked && todayPnl >= dailyProfitTarget) {
    canTrade = false;
    isLocked = true;
    
    // Lock until tomorrow 00:00 WIB
    const tomorrowWIB = new Date(nowWIB);
    tomorrowWIB.setDate(nowWIB.getDate() + 1);
    tomorrowWIB.setUTCHours(0, 0, 0, 0);
    lockedUntil = new Date(tomorrowWIB.getTime() - wibOffset).toISOString();
    reason = `Daily profit target of $${dailyProfitTarget} reached.`;

    await prisma.appSettings.upsert({
      where: { key: 'circuit_breaker_lock_until' },
      update: { value: lockedUntil },
      create: { key: 'circuit_breaker_lock_until', value: lockedUntil }
    });

    await prisma.riskEvent.create({
      data: {
        eventType: 'DAILY_TARGET_LOCK',
        description: reason,
        capitalAtEvent: startingCapital
      }
    });

    const activeSetting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
    if (activeSetting?.value) {
      const activePairs = JSON.parse(activeSetting.value);
      for (const pair of activePairs) {
        try { await cancelAllOrders(pair.symbol); } catch (err) { }
      }
    }
    
    await sendTelegramAlert({
      type: 'TARGET_REACHED',
      data: {
        capital: startingCapital,
        reason: reason,
        profitAmt: todayPnl.toFixed(2),
        unlockTime: new Date(lockedUntil).toLocaleString()
      }
    });
    console.log('🎯 DAILY TARGET REACHED. LOCKED until', lockedUntil);
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
  // Jika simulated capital aktif, hanya hitung trade setelah baseline untuk drawdown
  const allTrades = await prisma.trade.findMany({
    where: {
      status: 'CLOSED',
      ...(baselineTime ? { exitAt: { gte: baselineTime } } : {})
    },
    orderBy: { exitAt: 'asc' }
  });

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
    capital: startingCapital,
    dailyProfitTarget
  };
}
