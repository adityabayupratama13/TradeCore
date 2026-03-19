import { getPositions, getBalance, enterTrade, closePosition, placeOrder, cancelAllOrders, getMarkPrice, getKlines } from './binance';
import { analyzeMarket, calculateATR } from './aiEngine';
import { syncPositions } from './positionSync';
import { prisma } from '../../lib/prisma';
import { sendTelegramAlert } from './telegram';
import { checkAndEnforceCircuitBreaker } from './circuitBreaker';

const TRADING_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 
  'LTCUSDT', 'BCHUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 
  'OPUSDT', 'INJUSDT', 'RNDRUSDT', 'SUIUSDT', 'PEPEUSDT'
];

let cycleNumber = 0;

export async function manageOpenPositions() {
  await syncPositions();
  await checkAndEnforceCircuitBreaker();
  
  const openTrades = await prisma.trade.findMany({ where: { status: 'OPEN' } });
  if (openTrades.length === 0) return;

  const currentHourWIB = new Date().getHours();

  for (const trade of openTrades) {
    try {
      const [markPriceObj, klines15m] = await Promise.all([
         getMarkPrice(trade.symbol),
         getKlines(trade.symbol, '15m', 15)
      ]);
      const currentPrice = markPriceObj.markPrice;
      const closes = klines15m.map(k => k.close);
      const highs = klines15m.map(k => k.high);
      const lows = klines15m.map(k => k.low);
      
      const atr_15m = calculateATR(highs, lows, closes, 14);
      const atrPct = (atr_15m / currentPrice) * 100;

      const isLong = trade.direction === 'LONG';
      const profitRaw = isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
      const profitPct = (profitRaw / trade.entryPrice) * 100;

      let holdHours = (Date.now() - new Date(trade.entryAt).getTime()) / 3600000;
      let takeProfitSafe = trade.takeProfit || (trade.entryPrice * (isLong ? 1.05 : 0.95));

      // RULE 1: PARTIAL TP
      const isPartialEnabled = process.env.PARTIAL_TP_ENABLED === 'true';
      const partialKey = `partial_tp_${trade.id}`;
      const hasPartial = await prisma.appSettings.findUnique({ where: { key: partialKey } });
      
      if (isPartialEnabled && profitPct >= atrPct && !hasPartial) {
           await closePosition(trade.symbol, trade.quantity / 2);
           await prisma.appSettings.create({ data: { key: partialKey, value: 'true' } });
           await prisma.trade.update({ where: { id: trade.id }, data: { quantity: trade.quantity / 2 } });
           await sendTelegramAlert({
              type: 'PARTIAL_TP',
              data: {
                 symbol: trade.symbol,
                 partialPnl: Math.round((profitRaw * (trade.quantity / 2)) * 16000), 
                 partialPct: profitPct.toFixed(2),
                 takeProfit: takeProfitSafe
              }
           });
           await logEngine({ symbol: trade.symbol, action: 'PARTIAL_TP', result: 'EXECUTED', reason: `Hit ATR ${atrPct.toFixed(2)}%` });
           continue; 
      }

      // RULE 2: BREAKEVEN MOVE
      const beTrigger = parseFloat(process.env.BREAKEVEN_TRIGGER_PCT || '1.5');
      if (profitPct >= beTrigger && trade.stopLoss !== trade.entryPrice) {
           await cancelAllOrders(trade.symbol);
           await sleep(500);
           const oppositeSide = isLong ? 'SELL' : 'BUY';
           await placeOrder({ symbol: trade.symbol, side: oppositeSide, type: 'STOP_MARKET', stopPrice: trade.entryPrice, closePosition: "true", timeInForce: "GTE_GTC", workingType: "MARK_PRICE", priceProtect: "TRUE"} as any);
           await sleep(500);
           await placeOrder({ symbol: trade.symbol, side: oppositeSide, type: 'TAKE_PROFIT_MARKET', stopPrice: takeProfitSafe, closePosition: "true", timeInForce: "GTE_GTC", workingType: "MARK_PRICE", priceProtect: "TRUE"} as any);

           await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: trade.entryPrice } });
           await sendTelegramAlert({ type: 'BREAKEVEN_MOVE', data: { symbol: trade.symbol, direction: trade.direction, takeProfit: takeProfitSafe, currentPnl: profitPct.toFixed(2) } });
      }

      // RULE 3: TRAIL STOP
      if (profitPct >= 3.0 && profitPct < 5.0 && trade.stopLoss !== (isLong ? trade.entryPrice * 1.01 : trade.entryPrice * 0.99)) {
           const trailPrice = isLong ? trade.entryPrice * 1.01 : trade.entryPrice * 0.99;
           if ((isLong && trailPrice > (trade.stopLoss || 0)) || (!isLong && trailPrice < (trade.stopLoss || 999999))) {
               await cancelAllOrders(trade.symbol);
               await sleep(500);
               const oppositeSide = isLong ? 'SELL' : 'BUY';
               await placeOrder({ symbol: trade.symbol, side: oppositeSide, type: 'STOP_MARKET', stopPrice: trailPrice, closePosition: "true", timeInForce: "GTE_GTC", workingType: "MARK_PRICE", priceProtect: "TRUE"} as any);
               await sleep(500);
               await placeOrder({ symbol: trade.symbol, side: oppositeSide, type: 'TAKE_PROFIT_MARKET', stopPrice: takeProfitSafe, closePosition: "true", timeInForce: "GTE_GTC", workingType: "MARK_PRICE", priceProtect: "TRUE"} as any);
               await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: trailPrice } });
           }
      } else if (profitPct >= 5.0) {
           const trailPrice2 = isLong ? trade.entryPrice * 1.025 : trade.entryPrice * 0.975;
           if ((isLong && trailPrice2 > (trade.stopLoss || 0)) || (!isLong && trailPrice2 < (trade.stopLoss || 999999))) {
               await cancelAllOrders(trade.symbol);
               await sleep(500);
               const oppositeSide = isLong ? 'SELL' : 'BUY';
               await placeOrder({ symbol: trade.symbol, side: oppositeSide, type: 'STOP_MARKET', stopPrice: trailPrice2, closePosition: "true", timeInForce: "GTE_GTC", workingType: "MARK_PRICE", priceProtect: "TRUE"} as any);
               await sleep(500);
               await placeOrder({ symbol: trade.symbol, side: oppositeSide, type: 'TAKE_PROFIT_MARKET', stopPrice: takeProfitSafe, closePosition: "true", timeInForce: "GTE_GTC", workingType: "MARK_PRICE", priceProtect: "TRUE"} as any);
               await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: trailPrice2 } });
           }
      }

      // RULE 4: MAX HOLD
      const maxHold = parseInt(process.env.MAX_HOLD_HOURS || '8');
      if (holdHours >= maxHold) {
         if (profitPct > 0) {
             await closePosition(trade.symbol, trade.quantity);
             await prisma.trade.update({ where: { id: trade.id }, data: { status: 'CLOSED', exitPrice: currentPrice, exitAt: new Date(), pnlPct: profitPct } });
             await sendTelegramAlert({ type: 'SESSION_CLOSE', data: { symbol: trade.symbol, direction: trade.direction, reason: 'Max hold 8h reached', pnl: Math.round(profitRaw * trade.quantity * 16000), pnlPct: profitPct.toFixed(2), holdDuration: '8h' }});
             continue;
         } else {
             await logEngine({ symbol: trade.symbol, action: 'MAX_HOLD', result: 'IGNORED', reason: 'In loss, letting SL work naturally' });
         }
      }

      // RULE 5: SESSION CLOSE (NY close)
      const isSessionCloseEnabled = process.env.SESSION_CLOSE_ENABLED === 'true';
      if (isSessionCloseEnabled && currentHourWIB >= 4 && currentHourWIB <= 5) {
         if (profitPct > 0.5) {
             await closePosition(trade.symbol, trade.quantity);
             await prisma.trade.update({ where: { id: trade.id }, data: { status: 'CLOSED', exitPrice: currentPrice, exitAt: new Date(), pnlPct: profitPct } });
             await sendTelegramAlert({ type: 'SESSION_CLOSE', data: { symbol: trade.symbol, direction: trade.direction, reason: 'NY session closing', pnl: Math.round(profitRaw * trade.quantity * 16000), pnlPct: profitPct.toFixed(2), holdDuration: `${holdHours.toFixed(1)}h` }});
             continue;
         }
      }

    } catch (e) {
       console.error(`Error managing open position for ${trade.symbol}`, e);
    }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function executeAIAndTrade(symbol: string, triggerData: any = null, isManual = false): Promise<any> {
  cycleNumber++;

  try {
    const isTestMode = process.env.ENGINE_TEST_MODE === 'true';
    if (isTestMode) {
       const testFired = await prisma.appSettings.findUnique({ where: { key: 'test_trade_fired' } });
       if (testFired) {
          console.log('[TEST MODE] Blocked - engine already executed 1 test trade. Set ENGINE_TEST_MODE=false to resume live trading.');
          return { success: false, reason: 'TEST MODE ALREADY FIRED 1 TRADE' };
       }
    }

    const enabledSetting = await prisma.appSettings.findUnique({ where: { key: 'ENGINE_ENABLED' } });
    const isEngineStr = process.env.ENGINE_ENABLED || (enabledSetting ? enabledSetting.value : 'false');
    if (isEngineStr !== 'true' && !isTestMode) return;

    // ADDITION 1: ANTI-OVERTRADING GUARD
    // 1. MAX TRADES PER DAY
    const startOfDayWib = new Date();
    startOfDayWib.setHours(0,0,0,0);
    const todayTradeCount = await prisma.trade.count({
      where: { entryAt: { gte: startOfDayWib }, status: { not: 'CANCELLED' } }
    });
    if (todayTradeCount >= 4) {
       const lockKey = `daily_limit_alert_${startOfDayWib.toISOString()}`;
       const hasAlerted = await prisma.appSettings.findUnique({ where: { key: lockKey } });
       if (!hasAlerted) {
          await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "🚫 Daily trade limit reached. Engine paused until tomorrow." } } as any);
          await prisma.appSettings.create({ data: { key: lockKey, value: 'true' } });
       }
       await logEngine({ symbol, action: 'ABORT', result: 'BLOCKED', reason: `Daily trade limit reached (4/4)` });
       return;
    }

    // 2. MAX CONSECUTIVE LOSSES
    const lossCooldown = await prisma.appSettings.findUnique({ where: { key: 'consecutive_loss_cooldown' } });
    if (lossCooldown && new Date(lossCooldown.value).getTime() > Date.now()) {
       await logEngine({ symbol, action: 'ABORT', result: 'BLOCKED', reason: `Cooling down from consecutive losses` });
       return;
    }
    const lastTwoTrades = await prisma.trade.findMany({
       where: { status: 'CLOSED' },
       orderBy: { exitAt: 'desc' },
       take: 2
    });
    if (lastTwoTrades.length === 2) {
       const isLoss1 = lastTwoTrades[0].pnlPct !== null && lastTwoTrades[0].pnlPct! < 0;
       const isLoss2 = lastTwoTrades[1].pnlPct !== null && lastTwoTrades[1].pnlPct! < 0;
       if (isLoss1 && isLoss2) {
          const resumeTime = new Date(Date.now() + 2 * 3600000); 
          await prisma.appSettings.upsert({
             where: { key: 'consecutive_loss_cooldown' },
             update: { value: resumeTime.toISOString() },
             create: { key: 'consecutive_loss_cooldown', value: resumeTime.toISOString() }
          });
          const timeStr = resumeTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `⛔ 2 CONSECUTIVE LOSSES DETECTED\nEngine cooling down for 2 hours.\nReview your journal before next trade.\nResumes at: ${timeStr} WIB` } } as any);
          await logEngine({ symbol, action: 'ABORT', result: 'BLOCKED', reason: `2 consecutive losses — cooling down 2 hours` });
          return;
       }
    }

    // 3. MIN TIME BETWEEN TRADES (30 minutes)
    const lastTrade = await prisma.appSettings.findUnique({ where: { key: 'last_trade_executed_at' } });
    if (lastTrade) {
       const minWait = 30 * 60000;
       if (Date.now() - new Date(lastTrade.value).getTime() < minWait) {
          await logEngine({ symbol, action: 'ABORT', result: 'BLOCKED', reason: `Min time between trades (30 min) not reached` });
          return;
       }
    }

    const { isLocked } = await checkAndEnforceCircuitBreaker();
    if (isLocked) {
      await logEngine({ symbol, action: 'ABORT', result: 'BLOCKED', reason: 'Circuit Breaker LOCKED' });
      return;
    }

    const maxPosLimit = parseInt(process.env.MAX_CONCURRENT_POSITIONS || '3');
    const dbOpenCount = await prisma.trade.count({ where: { status: 'OPEN' } });
    
    if (dbOpenCount >= maxPosLimit) return;
    
    const currentPositions = await getPositions();
    const currentSymbols = new Set(currentPositions.map((p: any) => p.symbol));

    if (currentSymbols.has(symbol)) return;

    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) throw new Error("No portfolio configured");

    const balances = await getBalance();
    const usdtBalance = balances.find((b: any) => b.asset === 'USDT');
    const availableBalance = usdtBalance ? usdtBalance.availableBalance : 0;
    const totalWalletBalance = usdtBalance ? usdtBalance.balance : 0;
    
    if (portfolio && totalWalletBalance > 0) {
        await prisma.portfolio.update({
            where: { id: portfolio.id },
            data: { totalCapital: totalWalletBalance * 16000 }
        });
    }

    // ADDITION 2: PRE-TRADE CAPITAL CHECK
    if (availableBalance < 10) {
       await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "⚠️ Insufficient balance to trade." } } as any);
       await logEngine({ symbol, action: 'ABORT', result: 'BLOCKED', reason: `availableBalance < 10 USDT` });
       return;
    }
    
    if (availableBalance < totalWalletBalance * 0.05) {
       await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "⚠️ Less than 5% capital remaining — protect reserves. New trades blocked." } } as any);
       await logEngine({ symbol, action: 'ABORT', result: 'BLOCKED', reason: `availableBalance < 5% of total capital` });
       return;
    }

    const signal = await analyzeMarket(symbol, triggerData);

    await prisma.tradeSignalHistory.create({
      data: {
        symbol,
        action: signal.action,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        leverage: signal.leverage,
        riskReward: signal.riskReward,
        keySignal: signal.keySignal,
        wasExecuted: false
      }
    });

    let positionSizeMult = 1.0;
    
    if (signal.action === 'SKIP') {
      await logEngine({ symbol, action: signal.action, signal, result: 'SKIPPED', reason: `AI SKIP: ${signal.reasoning}` });
      return { success: false, reason: `AI SKIP: ${signal.reasoning}` };
    }

    if (isTestMode) {
      if (signal.confidence < 50) {
         await logEngine({ symbol, action: signal.action, signal, result: 'SKIPPED', reason: `Test mode low confidence: ${signal.confidence}` });
         return { success: false, reason: `Test mode low confidence: ${signal.confidence}` };
      }
      signal.leverage = 1;
      positionSizeMult = 1.0; 
    } else {
      if (signal.confidence >= 60) {
        positionSizeMult = 1.0;
      } else if (signal.confidence >= 55) {
        positionSizeMult = 0.5;
        signal.leverage = 1;
      } else {
        await logEngine({ symbol, action: signal.action, signal, result: 'SKIPPED', reason: `Low confidence (Threshold 55): ${signal.confidence}` });
        return;
      }
    }

    if (!signal.entryPrice || !signal.stopLoss || !signal.takeProfit) {
        await logEngine({ symbol, action: signal.action, signal, result: 'ERROR', reason: `LLM missing targets` });
        return; 
    }

    const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
    if (slDistance === 0) return;

    const maxRiskPct = 2 * positionSizeMult; 
    const riskAmountUsdt = availableBalance * (maxRiskPct / 100);
    
    let quantity = riskAmountUsdt / slDistance;

    if (isTestMode) {
       const minQty = 10 / signal.entryPrice;
       quantity = Math.max(quantity, minQty);
    }
    
    quantity = Math.floor(quantity * 1000) / 1000;

    const notionalValue = quantity * signal.entryPrice;
    const marginRequired = notionalValue / signal.leverage;

    if (marginRequired > availableBalance * 0.5) {
       const reductionFactor = (availableBalance * 0.5) / marginRequired;
       quantity = Math.floor((quantity * reductionFactor) * 1000) / 1000;
       await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `⚠️ Position too large — auto-reducing to 50% of available margin for ${symbol}` } } as any);
    }

    if (quantity <= 0) {
       await logEngine({ symbol, action: signal.action, signal, result: 'BLOCKED', reason: `Quantity too small: ${quantity}` });
       return; 
    }

    try {
      const res = await enterTrade({
        symbol,
        side: signal.action === 'LONG' ? 'BUY' : 'SELL',
        quantity,
        leverage: signal.leverage,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit
      });

      await prisma.trade.create({
        data: {
          portfolioId: portfolio.id,
          marketType: 'CRYPTO',
          symbol,
          direction: signal.action,
          status: 'OPEN',
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          quantity,
          leverage: signal.leverage
        }
      });

      await logEngine({ symbol, action: signal.action, signal, result: 'EXECUTED' });

      await sendTelegramAlert({
        type: 'TRADE_OPEN',
        data: {
          symbol, direction: signal.action,
          price: signal.entryPrice, size: quantity,
          sl: signal.stopLoss, tp: signal.takeProfit,
          rr: parseFloat(String(signal.riskReward || 2)).toFixed(2),
          riskPct: maxRiskPct
        }
      });

      await prisma.appSettings.upsert({
         where: { key: 'last_trade_executed_at' },
         update: { value: new Date().toISOString() },
         create: { key: 'last_trade_executed_at', value: new Date().toISOString() }
      });
      
      if (isTestMode) {
         await prisma.appSettings.create({ data: { key: 'test_trade_fired', value: 'true' } });
      }

      return { success: true, order: res, signal };

    } catch (execErr: any) {
      await logEngine({ symbol, action: signal.action, signal, result: 'ERROR', reason: execErr.message });
      return { success: false, reason: `EXECUTION ERROR: ${execErr.message}` };
    }

    await prisma.appSettings.upsert({
       where: { key: 'engine_status' },
       update: { value: 'RUNNING' },
       create: { key: 'engine_status', value: 'RUNNING' }
    });

  } catch (globalErr: any) {
    console.error('CRITICAL ENGINE LOOP FAILURE:', globalErr);
    return { success: false, reason: `CRITICAL ERROR: ${globalErr.message}` };
  }
}

async function logEngine({ symbol, action, signal, result, reason }: any) {
  await prisma.engineLog.create({
    data: {
      cycleNumber,
      symbol,
      action,
      signal: signal ? JSON.stringify(signal) : undefined,
      result,
      reason
    }
  });
}
