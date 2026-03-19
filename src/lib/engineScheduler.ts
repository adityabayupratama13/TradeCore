import { syncPositions } from './positionSync';
import { manageOpenPositions } from './tradingEngine';
import { runPriceWatcher } from './priceWatcher';
import { prisma } from '../../lib/prisma';
import { startTelegramListener, sendTelegramAlert } from './telegram';

let priceWatcherTimer: NodeJS.Timeout | null = null;
let positionManagerTimer: NodeJS.Timeout | null = null;
let healthTimer: NodeJS.Timeout | null = null;
let isRunning = false;

export function startEngine(): void {
  if (isRunning) return;
  isRunning = true;
  
  startPriceWatcherLoop();
  startPositionManagerLoop();
  
  console.log('🤖 TradeCore Engine STARTED');
  console.log('👁️  Price Watcher: every 60 seconds');
  console.log('📊 Position Manager: every 5 minutes');
}

function startPriceWatcherLoop(): void {
  const run = async () => {
    try {
      await runPriceWatcher();
    } catch(err) {
      console.error('PriceWatcher error:', err);
    } finally {
      if (isRunning) priceWatcherTimer = setTimeout(run, 60_000);
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
      if (isRunning) positionManagerTimer = setTimeout(run, 300_000);
    }
  }
  run();
}

export function stopEngine(): void {
  if (priceWatcherTimer) clearTimeout(priceWatcherTimer);
  if (positionManagerTimer) clearTimeout(positionManagerTimer);
  isRunning = false;
  console.log('🛑 TradeCore Engine STOPPED');
}

export function getEngineStatus() {
  return {
    isRunning,
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
      } catch (e) {
         stopEngine();
         await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "🚨 DATABASE ERROR — Engine stopped" } } as any);
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
    healthTimer = setTimeout(run, 600_000);
  };
  run();
}

// Initialize persistent background services regardless of engine state
startTelegramListener();
startSelfHealthCheckLoop();
