import { syncPositions } from './positionSync';
import { manageOpenPositions } from './tradingEngine';
import { runPriceWatcher } from './priceWatcher';
import { prisma } from '../../lib/prisma';
import { startTelegramListener, sendTelegramAlert } from './telegram';
import { runDynamicHunter } from './pairSelector';
import { runGridCycle, initializeGrid, stopGrid, getGridStatus } from './gridEngine';
import { runGridCycleV7, getGridStatusV7 } from './gridEngineV7';
import { runGridCycleV8, getGridStatusV8 } from './gridEngineV8';

const globalAny = global as any;

globalAny.priceWatcherTimer = globalAny.priceWatcherTimer || null;
globalAny.positionManagerTimer = globalAny.positionManagerTimer || null;
globalAny.healthTimer = globalAny.healthTimer || null;
globalAny.hunterTimer = globalAny.hunterTimer || null;
globalAny.gridTimer   = globalAny.gridTimer   || null;
globalAny.gridV7Timer = globalAny.gridV7Timer || null;
globalAny.gridV8Timer = globalAny.gridV8Timer || null;
globalAny.isRunning = globalAny.isRunning || false;



export async function startEngine(): Promise<void> {
  if (globalAny.isRunning) return;
  globalAny.isRunning = true;
  
  // Check which engine version is active
  const verSetting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
  const engineVersion = verSetting?.value || 'v1';

  if (engineVersion === 'v6') {
    // V6: Start Grid Bot instead of price watcher
    await startGridBotLoop();
    startPositionManagerLoop();
    console.log('🔲 TradeCore V6 GRID BOT STARTED');
    console.log('🔲 Grid Cycle: every 30 seconds');
    console.log('📊 Position Manager: every 5 minutes');

  } else if (engineVersion === 'v7') {
    // V7: Start optimized grid bot (15x, 8 grids, 0.5%, Soft Expand)
    const v7Status = await getGridStatusV7();
    if (!v7Status.isActive) {
      // Auto-initialize V7 if not yet started
      try {
        const { initializeGridV7 } = await import('./gridEngineV7');
        await initializeGridV7();
        await prisma.appSettings.upsert({
          where:  { key: 'grid_v7_active' },
          update: { value: 'true' },
          create: { key: 'grid_v7_active', value: 'true' }
        });
      } catch (err: any) {
        console.error('❌ [V7] Auto-init failed:', err.message);
      }
    }
    startGridV7Loop();
    startPositionManagerLoop();
    console.log('🔷 TradeCore V7 GRID BOT STARTED');
    console.log('🔷 Grid Cycle: every 30 seconds');
    console.log('📊 Position Manager: every 5 minutes');

  } else {
    // V1–V5: Traditional AI-based engine
    startPriceWatcherLoop();
    startPositionManagerLoop();
    startDynamicHunterLoop();
    console.log('🤖 TradeCore Engine STARTED');
    console.log('👁️  Price Watcher: every 60 seconds');
    console.log('📊 Position Manager: every 5 minutes');
    console.log('🦅 Dynamic Hunter: every 1 hour');
  }

  // V7 loop auto-resume if V7 state is active (regardless of engine version setting)
  if (engineVersion !== 'v7') {
    const v7Status2 = await getGridStatusV7();
    if (v7Status2.isActive) {
      startGridV7Loop();
      console.log('🔷 V7 Grid Bot loop resumed (independent)');
    }
  }

  // V8 loop auto-resume if V8 state is active
  if (engineVersion !== 'v8') {
    const v8Status = await getGridStatusV8();
    if (v8Status.isActive) {
      startGridV8Loop();
      console.log('🟦 V8 Grid Bot loop resumed (independent)');
    }
  }
} // ← end startEngine

function startPriceWatcherLoop(): void {

  const run = async () => {
    try {
      await runPriceWatcher();
    } catch(err) {
      console.error('PriceWatcher error:', err);
    } finally {
      if (globalAny.isRunning) globalAny.priceWatcherTimer = setTimeout(run, 60_000);
    }
  }
  run();
}

function startPositionManagerLoop(): void {
  const run = async () => {
    try {
      const lastRunSetting = await prisma.appSettings.findUnique({ where: { key: 'pos_manager_last_run' } });
      const lastRunMs = lastRunSetting?.value ? new Date(lastRunSetting.value).getTime() : 0;
      if (Date.now() - lastRunMs >= 290_000) {
         await prisma.appSettings.upsert({ where: { key: 'pos_manager_last_run' }, update: { value: new Date().toISOString() }, create: { key: 'pos_manager_last_run', value: new Date().toISOString() }});
         await manageOpenPositions();
      }
    } catch(err) {
      console.error('PositionManager error:', err);
    } finally {
      if (globalAny.isRunning) globalAny.positionManagerTimer = setTimeout(run, 300_000);
    }
  }
  run();
}

export async function stopEngine(): Promise<void> {
  if (globalAny.priceWatcherTimer) clearTimeout(globalAny.priceWatcherTimer);
  if (globalAny.positionManagerTimer) clearTimeout(globalAny.positionManagerTimer);
  if (globalAny.hunterTimer) clearTimeout(globalAny.hunterTimer);
  // Note: V7 timer is NOT stopped here — V7 is independent and managed via its own API
  if (globalAny.gridTimer) clearTimeout(globalAny.gridTimer);
  globalAny.isRunning = false;

  // If V6 grid is active, stop it cleanly
  const verSetting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
  if (verSetting?.value === 'v6') {
    try {
      await stopGrid();
    } catch (_) {}
  }
  
  prisma.appSettings.upsert({
    where: { key: 'engine_status' },
    update: { value: 'STOPPED' },
    create: { key: 'engine_status', value: 'STOPPED' }
  }).catch(console.error);

  sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "🛑 ENGINE STOPPED\nManual stop atau emergency stop aktif.\nCek System Logs untuk detail." } } as any).catch(console.error);


  console.log('🛑 TradeCore Engine STOPPED');
}

function startDynamicHunterLoop(): void {
  const run = async () => {
    try {
      console.log('🦅 Dynamic Hunter scanning 250+ pairs...')
      const result = await runDynamicHunter()
      console.log(`✅ Hunter: ${result.totalPassed} pairs passed filters`)
      console.log(`📡 Active: ${result.activePairs.map(p => p.symbol).join(', ')}`)
      await sendTelegramAlert({ type: 'PAIRS_UPDATED', data: result } as any)
    } catch(err) {
      console.error('DynamicHunter error:', err)
    } finally {
      if (globalAny.isRunning) globalAny.hunterTimer = setTimeout(run, 60 * 60 * 1000) // 1 hour
    }
  }
  run() // run immediately on engine start
}

// ─────────────────────────────────────────────────────────────
// V6: GRID BOT LOOP
// ─────────────────────────────────────────────────────────────

async function startGridBotLoop(): Promise<void> {
  // Initialize grid if not already active
  const gridStatus = await getGridStatus();
  if (!gridStatus.isActive) {
    try {
      await initializeGrid({
        symbol: 'ETHUSDT',   // ETH has good volatility for grids
        leverage: 20,        // Boosted to 20x to ensure $20 minimum notional per order on small accounts
        gridCount: 6,        // 6 levels per side = 12 total
        gridSpacingPct: 0.3, // 0.3% gap between levels
        capitalPct: 85       // Use 85% of available balance
      });
    } catch (err: any) {
      console.error('❌ [GRID] Failed to initialize:', err.message);
      return;
    }
  }

  const run = async () => {
    try {
      await runGridCycle();
    } catch (err) {
      console.error('GridCycle error:', err);
    } finally {
      if (globalAny.isRunning) globalAny.gridTimer = setTimeout(run, 30_000); // 30 seconds
    }
  };
  run();
}

// ─────────────────────────────────────────────────────────────
// V7: INDEPENDENT GRID BOT LOOP
// Started/stopped independently via /api/engine/grid-v7/start|stop
// ─────────────────────────────────────────────────────────────

export function startGridV7Loop(): void {
  if (globalAny.gridV7Timer) return; // Already running
  const run = async () => {
    try {
      await runGridCycleV7();
    } catch (err) {
      console.error('GridV7Cycle error:', err);
    } finally {
      globalAny.gridV7Timer = setTimeout(run, 30_000); // 30 seconds
    }
  };
  run();
  console.log('🔷 V7 Grid loop started');
}

export function stopGridV7Loop(): void {
  if (globalAny.gridV7Timer) {
    clearTimeout(globalAny.gridV7Timer);
    globalAny.gridV7Timer = null;
    console.log('🛑 V7 Grid loop stopped');
  }
}

// ─────────────────────────────────────────────────────────────
// V8: INDEPENDENT GRID BOT LOOP — Weekend / Tight Range Mode
// ─────────────────────────────────────────────────────────────

export function startGridV8Loop(): void {
  if (globalAny.gridV8Timer) return; // Already running
  const run = async () => {
    try {
      await runGridCycleV8();
    } catch (err) {
      console.error('GridV8Cycle error:', err);
    } finally {
      globalAny.gridV8Timer = setTimeout(run, 30_000);
    }
  };
  run();
  console.log('🟦 V8 Grid loop started');
}

export function stopGridV8Loop(): void {
  if (globalAny.gridV8Timer) {
    clearTimeout(globalAny.gridV8Timer);
    globalAny.gridV8Timer = null;
    console.log('🛑 V8 Grid loop stopped');
  }
}

export function getEngineStatus() {
  return {
    isRunning: globalAny.isRunning,
    lastRun: null,
    nextRun: null,
    cycleCount: 0
  };
}

async function selfHealthCheck(): Promise<void> {
   try {
      const BASE_URL = process.env.BINANCE_BASE_URL as string;
      let binanceOk = false;
      for (let i = 0; i < 3; i++) {
         try {
            const res = await fetch(`${BASE_URL}/fapi/v1/ping`);
            if (res.ok) { binanceOk = true; break; }
         } catch(e) {}
         if (!binanceOk) await new Promise(r => setTimeout(r, 1000));
      }
      if (!binanceOk) {
         stopEngine();
         await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "🔴 ENGINE STOPPED\nBinance API unreachable (3 attempts)\nAuto-restart in 15 minutes" } } as any);
         setTimeout(() => { startEngine(); }, 15 * 60000);
         return;
      }

      const orBase = process.env.OPENROUTER_BASE_URL;
      if (orBase) {
          try {
             const res = await fetch(`${orBase}/models`);
             if (!res.ok) {
                console.warn("OpenRouter API barely responsive");
                // The user says: "disable AI calls, log warning" - not specifically stopping the engine. We can just send alert since AI skip handles it.
             }
          } catch(e) {}
      }

      try {
         await prisma.appSettings.upsert({
            where: { key: 'health_check_ping' },
            update: { value: Date.now().toString() },
            create: { key: 'health_check_ping', value: Date.now().toString() }
         });
      } catch (e: any) {
         console.error('Health Check Database Error! Usually SQLITE_BUSY', e.message);
         stopEngine();
         await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `🚨 DATABASE ERROR — Engine stopped (${e.message})` } } as any);
         return;
      }

      const uptime = process.uptime(); 
      const uptimeLastCheckpoint = await prisma.appSettings.findUnique({ where: { key: 'uptime_checkpoint' } });
      const lastCp = uptimeLastCheckpoint ? parseFloat(uptimeLastCheckpoint.value) : 0;
      
      if (uptime > 86400 && (uptime - lastCp > 86400 || lastCp === 0)) {
         await prisma.appSettings.upsert({
            where: { key: 'uptime_checkpoint' },
            update: { value: uptime.toString() },
            create: { key: 'uptime_checkpoint', value: uptime.toString() }
         });
         console.log("24h uptime checkpoint — all systems nominal");
         await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "✅ 24H UPTIME — Engine healthy" } } as any);
      }
   } catch (err) {
      console.error('selfHealthCheck error:', err);
   }
}

function startSelfHealthCheckLoop(): void {
  const run = async () => {
    await selfHealthCheck();
    globalAny.healthTimer = setTimeout(run, 600_000);
  };
  run();
}

// Initialize persistent background services regardless of engine state
if (!globalAny.backgroundServicesStarted) {
  startTelegramListener();
  startSelfHealthCheckLoop();
  globalAny.backgroundServicesStarted = true;
}
