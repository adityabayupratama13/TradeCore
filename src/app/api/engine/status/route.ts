import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getEngineStatus } from '../../../../../src/lib/engineScheduler';
import { getPositions, getOpenOrders } from '../../../../../src/lib/binance';
import { SAFE_UNIVERSE } from '../../../../../src/lib/constants';

export async function GET() {
  try {
    const memoryStatus = getEngineStatus();
    const dbStatus = await prisma.appSettings.findUnique({ where: { key: 'engine_status' } });
    const lastRunRaw = await prisma.appSettings.findUnique({ where: { key: 'watcher_last_run' } });
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const watcherStatus: any = {};
    const lastWatcherTime = lastRunRaw?.value ? new Date(lastRunRaw.value).getTime() : 0;
    const globalLastCheckSecs = lastWatcherTime ? Math.floor((now.getTime() - lastWatcherTime) / 1000) : null;

    const activePairsSetting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
    let activeSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    if (activePairsSetting?.value) {
      try {
        const parsed = JSON.parse(activePairsSetting.value);
        activeSymbols = parsed.map((p: any) => p.symbol).filter((s: string) => SAFE_UNIVERSE.has(s));
      } catch (e) {}
    }

    for (const sym of activeSymbols) {
      const lastTriggerSetting = await prisma.appSettings.findUnique({ where: { key: `watcher_last_trigger_${sym}` } });
      const lastLLMSetting = await prisma.appSettings.findUnique({ where: { key: `last_ai_call_${sym}` } });

      let lastTrigger = null;
      let lastTriggerTime = null;
      if (lastTriggerSetting?.value) {
         try {
           const parsed = JSON.parse(lastTriggerSetting.value);
           lastTrigger = parsed.triggerType;
         } catch(e) {}
      }

      const latestTriggerLog = await prisma.engineLog.findFirst({
        where: { symbol: sym, action: 'TRIGGER_FIRED' },
        orderBy: { createdAt: 'desc' }
      });
      lastTriggerTime = latestTriggerLog ? latestTriggerLog.createdAt : null;

      const lastAiCallTimeMs = lastLLMSetting?.value ? new Date(lastLLMSetting.value).getTime() : 0;
      const minsSinceLLM = lastAiCallTimeMs ? Math.floor((now.getTime() - lastAiCallTimeMs) / 60000) : null;
      
      let cdRemaining = 0;
      if (lastTrigger && lastAiCallTimeMs) {
         let cooldownMinutes = 20; 
         if (lastTrigger === 'EMA_CROSS' || lastTrigger === 'RSI_REVERSAL') cooldownMinutes = 30;
         else if (lastTrigger === 'FUNDING_EXTREME') cooldownMinutes = 45;
         else if (lastTrigger === 'SCHEDULED_FALLBACK') cooldownMinutes = 90;

         const passedMins = (now.getTime() - lastAiCallTimeMs) / 60000;
         if (passedMins < cooldownMinutes) {
             cdRemaining = Math.ceil(cooldownMinutes - passedMins);
         }
      }

      const nextForcedMin = minsSinceLLM !== null ? Math.max(0, 90 - minsSinceLLM) : 0;

      watcherStatus[sym] = {
        lastCheckSecs: globalLastCheckSecs,
        lastTrigger: lastTrigger || 'None',
        lastTriggerTime,
        cooldownRemainingMins: cdRemaining,
        lastAiCallMins: minsSinceLLM,
        nextForcedMin
      };
    }

    const todayTrades = await prisma.trade.findMany({ where: { entryAt: { gte: startOfDay } } });
    
    let wins = 0, losses = 0, netPnl = 0, bestTrade = 0;
    
    todayTrades.forEach((t: any) => {
       if (t.status === 'CLOSED' && t.exitPrice) {
          const p = t.pnlPct || ((t.direction === 'LONG' ? (t.exitPrice - t.entryPrice) : (t.entryPrice - t.exitPrice)) / t.entryPrice) * 100;
          if (p >= 0) wins++; else losses++;
          netPnl += p;
          if (p > bestTrade) bestTrade = p;
       }
    });

    const bks = await prisma.engineLog.count({ where: { createdAt: { gte: startOfDay }, action: 'BREAKEVEN_MOVE' } });
    const pts = await prisma.engineLog.count({ where: { createdAt: { gte: startOfDay }, action: 'PARTIAL_TP' } });

    const [recentLogs, signalHistory] = await Promise.all([
      prisma.engineLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.tradeSignalHistory.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
    ]);

    const positions = await getPositions().catch(() => []);
    const openOrders = await getOpenOrders().catch(() => []);
    const unprotectedPositions = positions.filter(pos => {
       const hasSL = openOrders.some((o: any) => o.symbol === pos.symbol && (o.type === 'STOP_MARKET' || o.type === 'STOP'));
       return !hasSL;
    }).map(p => ({ symbol: p.symbol, direction: p.positionAmt > 0 ? 'LONG' : 'SHORT' }));

    return NextResponse.json({
      isRunning: memoryStatus.isRunning || (dbStatus?.value === 'RUNNING'),
      lastRun: lastRunRaw?.value || null,
      nextRun: memoryStatus.nextRun,
      cycleCount: memoryStatus.cycleCount,
      tradesToday: todayTrades.length,
      performanceStats: { wins, losses, netPnl, bestTrade, total: todayTrades.length, partials: pts, breakevens: bks },
      watcherStatus,
      signalHistory,
      recentLogs,
      unprotectedPositions
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
