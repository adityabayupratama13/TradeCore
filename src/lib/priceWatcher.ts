import { getKlines, getMarkPrice } from './binance';
import { prisma } from '../../lib/prisma';
import { executeAIAndTrade } from './tradingEngine';
import { calculateEMA, calculateRSI, calculateVolumeProfile } from './aiEngine';

export interface TriggerResult {
  triggered: boolean;
  symbol: string;
  triggerType: string;
  strength: number;
}

async function getActivePairs() {
  const setting = await prisma.appSettings.findUnique({
    where: { key: 'active_trading_pairs' }
  });
  if (!setting?.value) return [{symbol: 'BTCUSDT'}, {symbol: 'ETHUSDT'}, {symbol: 'SOLUSDT'}];
  
  try {
    return JSON.parse(setting.value);
  } catch (e) {
    return [{symbol: 'BTCUSDT'}, {symbol: 'ETHUSDT'}, {symbol: 'SOLUSDT'}];
  }
}

export async function runPriceWatcher(): Promise<void> {
  const isEngineStr = await prisma.appSettings.findUnique({ where: { key: 'ENGINE_ENABLED' } });
  if ((isEngineStr?.value || 'false') !== 'true') {
     return;
  }

  // Concurrency Lock for Price Watcher
  const lastWatcher = await prisma.appSettings.findUnique({ where: { key: 'watcher_last_run' } });
  if (lastWatcher && lastWatcher.value) {
    const lastRunMs = new Date(lastWatcher.value).getTime();
    if (Date.now() - lastRunMs < 45000) {
       return;
    }
  }

  await prisma.appSettings.upsert({
    where: { key: 'watcher_last_run' },
    update: { value: new Date().toISOString() },
    create: { key: 'watcher_last_run', value: new Date().toISOString() }
  });

  const activePairs = await getActivePairs();

  for (const pair of activePairs) {
    const symbol = pair.symbol;
    try {
      const [klines15m, markPriceObj] = await Promise.all([
        getKlines(symbol, '15m', 50),
        getMarkPrice(symbol)
      ]);

      const closes = klines15m.map(k => k.close);
      const volumes = klines15m.map(k => k.volume);
      const markPrice = markPriceObj.markPrice;
      const fundingRate = markPriceObj.fundingRate;

      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);
      
      const prevEma20 = ema20[ema20.length - 2];
      const prevEma50 = ema50[ema50.length - 2];
      const currEma20 = ema20[ema20.length - 1];
      const currEma50 = ema50[ema50.length - 1];
      
      const currRsi = calculateRSI(closes, 14);
      const prevRsi = calculateRSI(closes.slice(0, -1), 14);

      // 2h high/low (use last 8 x 15m candles = 2h)
      const last8 = klines15m.slice(-8);
      const high2h = Math.max(...last8.map(c => c.high));
      const low2h = Math.min(...last8.map(c => c.low));

      // VOLUME_SPIKE
      const volSlice = volumes.slice(-21, -1);
      const avgVol = volSlice.reduce((a, b) => a + b, 0) / volSlice.length || 1;
      const currentVol = volumes[volumes.length - 1];

      // MOMENTUM_CONTINUATION
      const last3 = klines15m.slice(-3);
      const isAllGreen = last3.every(c => c.close > c.open);
      const isAllRed = last3.every(c => c.close < c.open);
      const bodyRatios = last3.map(c => Math.abs(c.close - c.open) / (c.high - c.low || 1));
      const hasBigBodies = bodyRatios.every(r => r > 0.6);
      const increasingVol = last3[0].volume < last3[1].volume && last3[1].volume < last3[2].volume;
      const momentumContinuation = (isAllGreen || isAllRed) && hasBigBodies && increasingVol;

      let trigger: TriggerResult | null = null;

      // 1. BREAKOUT
      if (markPrice > high2h * 1.0015 || markPrice < low2h * 0.9985) {
         trigger = { triggered: true, symbol, triggerType: 'BREAKOUT', strength: 3 };
      }
      // 2. VOLUME SPIKE
      else if (currentVol > avgVol * 4.0) {
         trigger = { triggered: true, symbol, triggerType: 'VOLUME_SPIKE', strength: 3 };
      }
      else if (currentVol > avgVol * 2.0) {
         trigger = { triggered: true, symbol, triggerType: 'VOLUME_SPIKE', strength: 2 };
      }
      // 3. MOMENTUM_CONTINUATION
      else if (momentumContinuation) {
         trigger = { triggered: true, symbol, triggerType: 'MOMENTUM_CONTINUATION', strength: 2 };
      }
      // 4. EMA CROSSOVER
      else if (prevEma20 < prevEma50 && currEma20 > currEma50) {
         trigger = { triggered: true, symbol, triggerType: 'EMA_CROSS', strength: 2 }; 
      }
      else if (prevEma20 > prevEma50 && currEma20 < currEma50) {
         trigger = { triggered: true, symbol, triggerType: 'EMA_CROSS', strength: 2 }; 
      }
      // 5. RSI REVERSAL
      else if (prevRsi < 30 && currRsi >= 30) {
         trigger = { triggered: true, symbol, triggerType: 'RSI_REVERSAL', strength: 2 };
      }
      else if (prevRsi > 70 && currRsi <= 70) {
         trigger = { triggered: true, symbol, triggerType: 'RSI_REVERSAL', strength: 2 };
      }
      // 6. FUNDING RATE EXTREME
      else if (fundingRate > 0.05 || fundingRate < -0.05) {  
         trigger = { triggered: true, symbol, triggerType: 'FUNDING_EXTREME', strength: 1 };
      }
      
      // 7. SCHEDULED FALLBACK
      const cooldownKey = `last_ai_call_${symbol}`;
      const lastCallSetting = await prisma.appSettings.findUnique({ where: { key: cooldownKey } });
      const lastCallTime = lastCallSetting ? new Date(lastCallSetting.value).getTime() : 0;
      
      const minsSinceLLM = (Date.now() - lastCallTime) / 60000;
      
      if (!trigger && minsSinceLLM >= 90) {
         trigger = { triggered: true, symbol, triggerType: 'SCHEDULED_FALLBACK', strength: 1 };
      }

      if (trigger) {
         let cooldownMinutes = 15; 
         if (trigger.triggerType === 'EMA_CROSS' || trigger.triggerType === 'RSI_REVERSAL') cooldownMinutes = 20;
         else if (trigger.triggerType === 'FUNDING_EXTREME') cooldownMinutes = 30;
         else if (trigger.triggerType === 'SCHEDULED_FALLBACK') cooldownMinutes = 60;

         if (minsSinceLLM >= cooldownMinutes) {
             await prisma.engineLog.create({
               data: {
                 cycleNumber: 0,
                 symbol,
                 action: 'TRIGGER_FIRED',
                 reason: `Watcher caught ${trigger.triggerType} (Str: ${trigger.strength})`,
                 result: 'DISPATCHING_AI'
               }
             });

             await prisma.appSettings.upsert({
               where: { key: cooldownKey },
               update: { value: new Date().toISOString() },
               create: { key: cooldownKey, value: new Date().toISOString() }
             });

             await prisma.appSettings.upsert({
                where: { key: `watcher_last_trigger_${symbol}` },
                update: { value: JSON.stringify(trigger) },
                create: { key: `watcher_last_trigger_${symbol}`, value: JSON.stringify(trigger) }
             });

             executeAIAndTrade(symbol, trigger).catch(e => console.error(`AI Background Hook Error:`, e));
         } 
      }

    } catch (e) {
       console.error(`PriceWatcher error for ${symbol}`, e);
    }
  }
}
