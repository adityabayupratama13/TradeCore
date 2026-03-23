import { getKlines, getMarkPrice } from './binance';
import { prisma } from '../../lib/prisma';
import { executeAIAndTrade } from './tradingEngine';
import { calculateEMA, calculateRSI, calculateVolumeProfile, calculateADX } from './aiEngine';
import { FALLBACK_PAIRS } from './constants';


export interface TriggerResult {
  triggered: boolean;
  symbol: string;
  triggerType: string;
  strength: number;
}

async function getActivePairsForWatching() {
  const setting = await prisma.appSettings.findUnique({
    where: { key: 'active_trading_pairs' }
  });
  
  let pairs = FALLBACK_PAIRS.map(symbol => ({ symbol, biasSide: 'NEUTRAL' }));
  if (setting?.value) {
    try {
      pairs = JSON.parse(setting.value);
    } catch (e) {}
  }
  
  // Extra safety: disabled to allow organic selection
  const safePairs = pairs;
  
  // If less than 3 safe pairs, use fallback
  if (safePairs.length < 3) {
    return FALLBACK_PAIRS.map(s => ({ symbol: s, biasSide: 'NEUTRAL' }));
  }
  
  return safePairs;
}

export async function runPriceWatcher(): Promise<void> {
  const isEngineStr = await prisma.appSettings.findUnique({ where: { key: 'ENGINE_ENABLED' } });
  if ((isEngineStr?.value || 'false') !== 'true') return;

  // Concurrency Lock for Price Watcher
  const lastWatcher = await prisma.appSettings.findUnique({ where: { key: 'watcher_last_run' } });
  if (lastWatcher && lastWatcher.value) {
    const lastRunMs = new Date(lastWatcher.value).getTime();
    if (Date.now() - lastRunMs < 45000) return;
  }

  await prisma.appSettings.upsert({
    where: { key: 'watcher_last_run' },
    update: { value: new Date().toISOString() },
    create: { key: 'watcher_last_run', value: new Date().toISOString() }
  });

  const activePairs = await getActivePairsForWatching();
  console.log(`👁️ Watching ${activePairs.length} pairs:`, activePairs.map((p: any) => p.symbol).join(', '));

  for (const pair of activePairs) {
    try {
      await checkTriggersForPair(pair.symbol, pair);
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`PriceWatcher error for ${pair.symbol}:`, err);
    }
  }
}

async function checkTriggersForPair(symbol: string, pair: any) {
  // Removed SAFE_UNIVERSE static boundary entirely

  const [klines15m, klines1h, markPriceObj] = await Promise.all([
    getKlines(symbol, '15m', 50),
    getKlines(symbol, '1h', 50),
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

  const last8 = klines15m.slice(-8);
  const high2h = Math.max(...last8.map(c => c.high));
  const low2h = Math.min(...last8.map(c => c.low));

  const volSlice = volumes.slice(-21, -1);
  const avgVol = volSlice.reduce((a, b) => a + b, 0) / volSlice.length || 1;
  const currentVol = volumes[volumes.length - 1];

  const last3 = klines15m.slice(-3);
  const greenCount = last3.filter(c => c.close > c.open).length;
  const redCount = last3.filter(c => c.close < c.open).length;
  const isDominatedMatch = greenCount >= 2 || redCount >= 2;
  const bodyRatios = last3.map(c => Math.abs(c.close - c.open) / (c.high - c.low || 1));
  const hasBigBodies = bodyRatios.every(r => r > 0.5);
  const increasingVol = last3[1].volume < last3[2].volume || last3[0].volume < last3[2].volume;
  const momentumContinuation = isDominatedMatch && hasBigBodies && increasingVol;

  let trigger: TriggerResult | null = null;

  if (markPrice > high2h * 1.001 || markPrice < low2h * 0.999) {
     trigger = { triggered: true, symbol, triggerType: 'BREAKOUT', strength: 3 };
  } else if (currentVol > avgVol * 3.0) {
     trigger = { triggered: true, symbol, triggerType: 'VOLUME_SPIKE', strength: 3 };
  } else if (currentVol > avgVol * 1.7) {
     trigger = { triggered: true, symbol, triggerType: 'VOLUME_SPIKE', strength: 2 };
  } else if (momentumContinuation) {
     trigger = { triggered: true, symbol, triggerType: 'MOMENTUM_CONTINUATION', strength: 2 };
  } else if (prevEma20 < prevEma50 && currEma20 > currEma50) {
     trigger = { triggered: true, symbol, triggerType: 'EMA_CROSS', strength: 2 }; 
  } else if (prevEma20 > prevEma50 && currEma20 < currEma50) {
     trigger = { triggered: true, symbol, triggerType: 'EMA_CROSS', strength: 2 }; 
  } else if (prevRsi < 30 && currRsi >= 30) {
     trigger = { triggered: true, symbol, triggerType: 'RSI_REVERSAL', strength: 2 };
  } else if (prevRsi > 70 && currRsi <= 70) {
     trigger = { triggered: true, symbol, triggerType: 'RSI_REVERSAL', strength: 2 };
  } else if (prevRsi < 55 && currRsi >= 55) {
     trigger = { triggered: true, symbol, triggerType: 'RSI_MOMENTUM', strength: 1 };
  } else if (prevRsi > 45 && currRsi <= 45) {
     trigger = { triggered: true, symbol, triggerType: 'RSI_MOMENTUM', strength: 1 };
  } else if (fundingRate > 0.05 || fundingRate < -0.05) {  
     trigger = { triggered: true, symbol, triggerType: 'FUNDING_EXTREME', strength: 1 };
  }
  
  const cooldownKey = `last_ai_call_${symbol}`;
  const lastCallSetting = await prisma.appSettings.findUnique({ where: { key: cooldownKey } });
  const lastCallTime = lastCallSetting ? new Date(lastCallSetting.value).getTime() : 0;
  
  const minsSinceLLM = (Date.now() - lastCallTime) / 60000;
  
  if (!trigger && minsSinceLLM >= 45) {
      const closes1h = klines1h.map(k => k.close);
      const highs1h = klines1h.map(k => k.high);
      const lows1h = klines1h.map(k => k.low);
      const adx1h = calculateADX(highs1h, lows1h, closes1h, 14);
      const volRatio = currentVol / avgVol;
      
      if (adx1h > 25 && volRatio > 1.2 && currRsi >= 35 && currRsi <= 65) {
         trigger = { triggered: true, symbol, triggerType: 'SCHEDULED_FALLBACK', strength: 2 };
      } else {
         console.log(`⏭️ ${symbol} 45m cycle conditions not met (ADX 1h: ${adx1h.toFixed(1)}, VolRatio: ${volRatio.toFixed(2)}, RSI: ${currRsi.toFixed(1)}). Skipping.`);
      }
  }

  if (trigger && trigger.strength < 2) {
    console.log(`Min trigger strength: 2. Skipping ${symbol}.`);
    return;
  }

  if (trigger) {
     let cooldownMinutes = 15; 
     if (trigger.triggerType === 'EMA_CROSS' || trigger.triggerType === 'RSI_REVERSAL' || trigger.triggerType === 'RSI_MOMENTUM') cooldownMinutes = 20;
     else if (trigger.triggerType === 'FUNDING_EXTREME') cooldownMinutes = 30;
     else if (trigger.triggerType === 'SCHEDULED_FALLBACK') cooldownMinutes = 30;

     if (minsSinceLLM >= cooldownMinutes) {
         if (trigger.strength < 2) return;

         const closes1h = klines1h.map(k => k.close);
         const highs1h = klines1h.map(k => k.high);
         const lows1h = klines1h.map(k => k.low);
         const adx = calculateADX(highs1h, lows1h, closes1h, 14);
         const rsi = currRsi;
         const volumeRatio = currentVol / avgVol;

         if (adx < 20) {
            console.log(`⏭️ ${symbol} ADX ${adx.toFixed(1)} < 20. No trend. Skip.`);
            return;
         }
         
         if (rsi > 75 || rsi < 25) {
            console.log(`⏭️ ${symbol} RSI ${rsi.toFixed(1)} overextended. Skip.`);
            return;
         }
         
         if (volumeRatio < 1.0) {
            console.log(`⏭️ ${symbol} Volume ${volumeRatio.toFixed(2)}x below avg. Skip.`);
            return;
         }

         console.log(`✅ ${symbol} passed all gates. Dispatching AI.`);

         await prisma.engineLog.create({
           data: { cycleNumber: 0, symbol, action: 'TRIGGER_FIRED', reason: `Watcher caught ${trigger.triggerType} (Str: ${trigger.strength})`, result: 'DISPATCHING_AI' }
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

         executeAIAndTrade(symbol, trigger).catch(err => console.error(`AI Background Hook Error:`, err));
     } 
  }
}
