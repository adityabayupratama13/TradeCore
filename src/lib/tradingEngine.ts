import { getPositions, getBalance, enterTrade, closePosition, placeOrder, cancelAllOrders, getMarkPrice, getKlines, getSymbolPrecision, placeAlgoOrder, cancelAlgoOrder, roundPrice, roundQuantity } from './binance';
import { SAFE_UNIVERSE } from './constants';
import { analyzeMarket, calculateATR } from './aiEngine';
import { syncPositions } from './positionSync';
import { prisma } from '../../lib/prisma';
import { sendTelegramAlert } from './telegram';
import { checkAndEnforceCircuitBreaker } from './circuitBreaker';
import { MIN_CONFIDENCE_FULL, MIN_CONFIDENCE_HALF } from './constants';
import { getCoinCategory } from './coinCategories';

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
           const oppositeSide = isLong ? 'SELL' : 'BUY';
           if (trade.slAlgoId) await cancelAlgoOrder(trade.symbol, trade.slAlgoId).catch(()=>{});
           await sleep(300);
           
           const roundedTrig = await roundPrice(trade.symbol, trade.entryPrice);
           const newSl = await placeAlgoOrder({
             algoType: 'CONDITIONAL',
             symbol: trade.symbol,
             side: oppositeSide,
             type: 'STOP_MARKET',
             triggerPrice: roundedTrig.toString(),
             closePosition: 'true',
             workingType: 'MARK_PRICE',
             priceProtect: 'FALSE',
             timeInForce: 'GTC'
           });

           await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: roundedTrig, slAlgoId: newSl?.algoId?.toString() } });
           await sendTelegramAlert({ type: 'BREAKEVEN_MOVE', data: { symbol: trade.symbol, direction: trade.direction, takeProfit: takeProfitSafe, currentPnl: profitPct.toFixed(2) } });
      }

      // RULE 3: TRAIL STOP
      if (profitPct >= 3.0 && profitPct < 5.0 && trade.stopLoss !== (isLong ? trade.entryPrice * 1.01 : trade.entryPrice * 0.99)) {
           const trailPrice = isLong ? trade.entryPrice * 1.01 : trade.entryPrice * 0.99;
           if ((isLong && trailPrice > (trade.stopLoss || 0)) || (!isLong && trailPrice < (trade.stopLoss || 999999))) {
               const oppositeSide = isLong ? 'SELL' : 'BUY';
               if (trade.slAlgoId) await cancelAlgoOrder(trade.symbol, trade.slAlgoId).catch(()=>{});
               await sleep(300);
               
               const roundedTrig = await roundPrice(trade.symbol, trailPrice);
               const newSl = await placeAlgoOrder({
                 algoType: 'CONDITIONAL',
                 symbol: trade.symbol,
                 side: oppositeSide,
                 type: 'STOP_MARKET',
                 triggerPrice: roundedTrig.toString(),
                 closePosition: 'true',
                 workingType: 'MARK_PRICE',
                 priceProtect: 'FALSE',
                 timeInForce: 'GTC'
               });
               
               await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: roundedTrig, slAlgoId: newSl?.algoId?.toString() } });
           }
      } else if (profitPct >= 5.0) {
           const trailPrice2 = isLong ? trade.entryPrice * 1.025 : trade.entryPrice * 0.975;
           if ((isLong && trailPrice2 > (trade.stopLoss || 0)) || (!isLong && trailPrice2 < (trade.stopLoss || 999999))) {
               const oppositeSide = isLong ? 'SELL' : 'BUY';
               if (trade.slAlgoId) await cancelAlgoOrder(trade.symbol, trade.slAlgoId).catch(()=>{});
               await sleep(300);

               const roundedTrig = await roundPrice(trade.symbol, trailPrice2);
               const newSl = await placeAlgoOrder({
                 algoType: 'CONDITIONAL',
                 symbol: trade.symbol,
                 side: oppositeSide,
                 type: 'STOP_MARKET',
                 triggerPrice: roundedTrig.toString(),
                 closePosition: 'true',
                 workingType: 'MARK_PRICE',
                 priceProtect: 'FALSE',
                 timeInForce: 'GTC'
               });
               
               await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: roundedTrig, slAlgoId: newSl?.algoId?.toString() } });
           }
      }

      // RULE 4: MAX HOLD
      const maxHold = parseInt(process.env.MAX_HOLD_HOURS || '8');
      if (holdHours >= maxHold) {
         if (profitPct > 0) {
             await closePosition(trade.symbol, trade.quantity);
             await prisma.trade.update({ where: { id: trade.id }, data: { status: 'CLOSED', exitPrice: currentPrice, exitAt: new Date(), pnlPct: profitPct } });
             await checkAndEnforceCircuitBreaker();
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
             await checkAndEnforceCircuitBreaker();
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

    // REMOVED ANTI-OVERTRADING GUARDS (FIX 6: Delete restrictive arbitrary trade limits and consecutive stop-loss freezes)

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

    const riskRule = await prisma.riskRule.findFirst({ where: { isActive: true } });

    const pauseSetting = await prisma.appSettings.findUnique({ where: { key: 'engine_pause_until' } });
    if (pauseSetting && pauseSetting.value) {
        const pauseUntil = parseInt(pauseSetting.value);
        if (Date.now() < pauseUntil) {
           console.log(`⏸️ Engine is paused until ${new Date(pauseUntil).toLocaleTimeString()}`);
           return;
        }
    }

    const startOfDay = new Date(new Date().setHours(0,0,0,0));
    const todayTrades = await prisma.trade.findMany({ where: { entryAt: { gte: startOfDay } } });
    let wins = 0, losses = 0;
    todayTrades.forEach((t: any) => {
       if (t.status === 'CLOSED' && t.exitPrice) {
          const p = t.pnlPct || ((t.direction === 'LONG' ? (t.exitPrice - t.entryPrice) : (t.entryPrice - t.exitPrice)) / t.entryPrice) * (t.leverage || 1) * 100;
          if (p >= 0) wins++; else losses++;
       }
    });

    const totalTradesToday = todayTrades.length;
    const closedCount = wins + losses;
    const winRate = closedCount > 0 ? (wins / closedCount) * 100 : 100;

    let dynamicMinConf = Math.max(riskRule?.minConfidence ?? 70, 70);

    if (totalTradesToday >= 8 && winRate < 50) {
        console.log(`⏸️ Engine paused: 8 trades reached with ${winRate.toFixed(1)}% win rate. Engine pausing for 2 hours cooldown.`);
        await prisma.appSettings.upsert({
           where: { key: 'engine_pause_until' },
           update: { value: (Date.now() + 2 * 3600 * 1000).toString() },
           create: { key: 'engine_pause_until', value: (Date.now() + 2 * 3600 * 1000).toString() }
        });
        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `⏸️ Engine paused: 8 trades, win rate too low (${winRate.toFixed(1)}%). Review market conditions.` } } as any);
        return;
    } else if (totalTradesToday >= 5 && winRate < 40) {
        dynamicMinConf = Math.max(dynamicMinConf, 80);
        const alertedSetting = await prisma.appSettings.findUnique({ where: { key: `winrate_alert_${startOfDay.getTime()}` } });
        if (!alertedSetting) {
            console.log("⚠️ Low win rate detected. Raising confidence bar.");
            await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `⚠️ Win rate below 40% today (${winRate.toFixed(1)}%). Tightening entry criteria to 80% confidence.` } } as any);
            await prisma.appSettings.upsert({
               where: { key: `winrate_alert_${startOfDay.getTime()}` },
               update: { value: 'TRUE' },
               create: { key: `winrate_alert_${startOfDay.getTime()}`, value: 'TRUE' }
            });
        }
    }

    const setting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
    let activePairs = [{symbol: 'BTCUSDT'}, {symbol: 'ETHUSDT'}, {symbol: 'SOLUSDT'}];
    if (setting?.value) { try { activePairs = JSON.parse(setting.value); } catch(e){} }
    
    // Filter out already open symbols
    const availablePairs = activePairs.filter((p: any) => !currentSymbols.has(p.symbol));

    const maxPositions = riskRule?.maxOpenPositions ?? 5;
    const availableSlots = maxPositions - currentSymbols.size;

    if (availableSlots <= 0) {
      console.log(`Max ${maxPositions} positions open. Monitoring only.`);
      return;
    }

    console.log(`🔍 Analyzing ${availablePairs.length} pairs simultaneously... (Mode: ${riskRule?.activeMode || 'SAFE'})`);
    const signals = await Promise.all(
      availablePairs.map((pair: any) => analyzeMarket(pair.symbol, pair.symbol === symbol ? triggerData : null, riskRule?.activeMode || 'SAFE'))
    );

    const minConf = dynamicMinConf;

    const validSignals = signals
      .filter(s => {
         if (s.action === 'SKIP') return false;
         if (s.confidence < minConf) {
            console.log(`⏭️ Confidence ${s.confidence} < ${minConf} for ${s.symbol}. Skip.`);
            return false;
         }
         return true;
      })
      .sort((a, b) => b.confidence - a.confidence);

    console.log(`✅ Valid signals: ${validSignals.length} (>=${minConf}%). Executing up to ${availableSlots}...`);

    for (let i = 0; i < Math.min(validSignals.length, availableSlots); i++) {
        await executeTradeSignal(validSignals[i], portfolio, availableBalance, totalWalletBalance, isTestMode, riskRule);
        await sleep(1000);
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

async function checkSufficientMargin(requiredMargin: number): Promise<boolean> {
  const balance = await getBalance();
  const available = balance.find(b => b.asset === 'USDT')?.availableBalance ?? 0;
  
  // Keep 20% of total as emergency buffer
  const totalBalance = balance.find(b => b.asset === 'USDT')?.balance ?? 0;
  const safeBuffer = totalBalance * 0.20;
  const usableBalance = available - safeBuffer;
  
  if (requiredMargin > usableBalance) {
    console.log(`❌ Insufficient margin:
      Required: $${requiredMargin.toFixed(2)}
      Available: $${available.toFixed(2)}
      Safe buffer (20%): $${safeBuffer.toFixed(2)}
      Usable: $${usableBalance.toFixed(2)}`);
    return false;
  }
  
  return true;
}

async function executeTradeSignal(signal: any, portfolio: any, availableBalance: number, totalWalletBalance: number, isTestMode: boolean, riskRule: any) {
    const symbol = signal.symbol;

    // ABSOLUTE FIRST CHECK — NON-NEGOTIABLE
    if (!SAFE_UNIVERSE.has(symbol)) {
      console.log(`🚫 BLOCKED: ${symbol} not in SAFE_UNIVERSE. Skipping.`);
      return;
    }

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

    if (!signal.entryPrice || !signal.stopLoss || !signal.takeProfit) {
        await logEngine({ symbol, action: signal.action, signal, result: 'ERROR', reason: `LLM missing targets` });
        return; 
    }

    // NEW FIX 3: DYNAMIC POSITION SIZING
    const positionDetails = await calculatePositionSize(
      symbol, signal.entryPrice, signal.stopLoss, signal.action === 'LONG' ? 'BUY' : 'SELL', totalWalletBalance, signal.confidence
    );
    if (!positionDetails) {
       await logEngine({ symbol, action: signal.action, result: 'BLOCKED', reason: `Position calculation failed or insufficient safety balance.` });
       return;
    }
    const { quantity, margin, leverage, liqPrice, adjustedSl } = positionDetails;
    signal.stopLoss = adjustedSl;
    signal.leverage = leverage;

    // NEW FIX 4: TP MINIMUM 15% ENFORCE
    signal = enforceMinProfitTarget(signal, margin * leverage, totalWalletBalance, riskRule?.minProfitTargetPct ?? 15);
    
    // Round signal targets gracefully Native limits
    try {
      const precision = await getSymbolPrecision(symbol).catch(() => ({ pricePrecision: 2, tickSize: 0.01 }));
      const tickSize = precision.tickSize;
      const decStr = tickSize.toString().split('.')[1] || '';
      const decimals = decStr.length;
      signal.entryPrice = parseFloat((Math.round(signal.entryPrice / tickSize) * tickSize).toFixed(decimals));
      signal.stopLoss = parseFloat((Math.round(signal.stopLoss / tickSize) * tickSize).toFixed(decimals));
      signal.takeProfit = parseFloat((Math.round(signal.takeProfit / tickSize) * tickSize).toFixed(decimals));
    } catch(e) {}

    if (quantity <= 0) {
       await logEngine({ symbol, action: signal.action, signal, result: 'BLOCKED', reason: `Quantity too small: ${quantity}` });
       return; 
    }
    if (margin < 1.0) {
      console.log(`Position margin ${margin.toFixed(2)} < $1, skipping`);
      await logEngine({ symbol, action: signal.action, signal, result: 'SKIPPED', reason: `Calculated margin < $1` });
      return;
    }

    const hasMargin = await checkSufficientMargin(margin);
    if (!hasMargin) {
      console.log(`⏭️ Skipping ${signal.symbol} — insufficient margin`);
      await logEngine({ symbol, action: signal.action, signal, result: 'SKIPPED', reason: `Insufficient margin for $${margin.toFixed(2)} position` });
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
          leverage: signal.leverage,
          slAlgoId: res.slAlgoId?.toString(),
          tpAlgoId: res.tpAlgoId?.toString()
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
          // Append explicit info required by FIX 10
          leverage: signal.leverage, category: getCoinCategory(symbol).name,
          liqPrice: liqPrice.toFixed(4), buffer: ((Math.abs(signal.entryPrice - signal.stopLoss) / (signal.entryPrice / signal.leverage)) * 100).toFixed(1),
          margin: margin.toFixed(2), positionValue: (margin * signal.leverage).toFixed(2), riskAmount: (totalWalletBalance * 0.05).toFixed(2), riskPct: 5, profitAmount: 0, profitPct: 0
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

    } catch (execErr: any) {
      await logEngine({ symbol, action: signal.action, signal, result: 'ERROR', reason: execErr.message });
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

// ==========================================
// FIX 3: DYNAMIC POSITION SIZING & BUFFER
// ==========================================
function getCategoryLeverage(symbol: string, riskRule: any): number {
  const LARGE_CAP = new Set(['BTCUSDT','ETHUSDT','BNBUSDT'])
  const MID_CAP = new Set(['SOLUSDT','XRPUSDT','ADAUSDT','AVAXUSDT',
    'DOTUSDT','LINKUSDT','LTCUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
    'APTUSDT','INJUSDT','ARBUSDT','OPUSDT','SUIUSDT'])
  
  if (LARGE_CAP.has(symbol)) {
    return Math.min(riskRule?.leverageLargeCap ?? 5, riskRule?.maxLeverageLarge ?? 5)
  } else if (MID_CAP.has(symbol)) {
    return Math.min(riskRule?.leverageMidCap ?? 8, riskRule?.maxLeverageMid ?? 8)
  } else {
    return Math.min(riskRule?.leverageLowCap ?? 10, riskRule?.maxLeverageLow ?? 10)
  }
}

export async function calculatePositionSize(
  symbol: string,
  entryPrice: number,
  stopLoss: number,
  side: 'BUY' | 'SELL',
  _ignoredCapital: number, // Removed totalCapital dependency
  signalConfidence: number
): Promise<{ quantity: number, margin: number, leverage: number, liqPrice: number, adjustedSl: number } | null> {
  
  const balance = await getBalance();
  const usdtBalance = balance.find((b: any) => b.asset === 'USDT');
  const totalCapital = usdtBalance?.availableBalance ?? 0;
  
  console.log(`💰 USDT Balance: $${totalCapital.toFixed(2)}`);
  
  if (totalCapital < 5) {
    console.log('❌ Insufficient USDT balance < $5. Stopping.');
    return null;
  }

  const category = getCoinCategory(symbol);
  const riskRule = await prisma.riskRule.findFirst({ where: { isActive: true } });

  const riskPct = symbol === 'BTCUSDT' || symbol === 'ETHUSDT' || symbol === 'BNBUSDT'
    ? (riskRule?.riskPctLargeCap ?? category.riskPct)
    : category.symbols.includes(symbol)
    ? (riskRule?.riskPctMidCap ?? category.riskPct)
    : (riskRule?.riskPctLowCap ?? category.riskPct);

  const leverage = getCategoryLeverage(symbol, riskRule);

  const riskAmount = totalCapital * (riskPct / 100);

  const rawSlDistance = Math.abs(entryPrice - stopLoss);
  const effectiveSlDistance = rawSlDistance * 1.20; // 20% slippage gap buffer

  const positionValue = riskAmount / (effectiveSlDistance / entryPrice);
  const margin = positionValue / leverage;
  const rawQuantity = positionValue / entryPrice;
  // Apply binance scaling step sizes natively handling maxQty bounds
  const quantity = await roundQuantity(symbol, rawQuantity).catch(() => {
    const fallbackStep = 0.001;
    return parseFloat((Math.floor(rawQuantity / fallbackStep) * fallbackStep).toFixed(3));
  });

  const liqDistance = entryPrice / leverage;
  const liqPrice = side === 'BUY'
    ? entryPrice - liqDistance
    : entryPrice + liqDistance;

  const slBeforeLiq = side === 'BUY'
    ? stopLoss > liqPrice
    : stopLoss < liqPrice;

  let adjustedSl = stopLoss;
  if (!slBeforeLiq) {
    console.error('❌ SL beyond liquidation! Auto-adjusting...');
    if (side === 'BUY') {
      adjustedSl = liqPrice + (liqDistance * 0.30);
    } else {
      adjustedSl = liqPrice - (liqDistance * 0.30);
    }
  }

  const slBuffer = ((Math.abs(entryPrice - adjustedSl) / liqDistance) * 100).toFixed(1);

  console.log(`
📊 ${symbol} (${category.name}):
   Capital: ${totalCapital.toFixed(2)} USDT
   Risk: ${riskPct}% = ${riskAmount.toFixed(2)} USDT
   Leverage: ${leverage}x (confidence: ${signalConfidence}%)
   Position: ${positionValue.toFixed(2)} USDT
   Margin: ${margin.toFixed(2)} USDT
   Quantity: ${quantity}
   SL: ${adjustedSl} | Liq: ${liqPrice.toFixed(4)}
   Safety buffer: ${slBuffer}%`);

  return { quantity, margin, leverage, liqPrice, adjustedSl };
}

// ==========================================
// FIX 4: TP MINIMUM 15% TARGET ENFORCEMENT
// ==========================================
export function enforceMinProfitTarget(
  signal: any,
  positionValue: number,
  totalCapital: number,
  minProfitTargetPct: number
): any {
  if (signal.action === 'SKIP' || !signal.takeProfit) return signal;

  const tpDistance = Math.abs(signal.entryPrice - signal.takeProfit);
  const tpDistancePct = tpDistance / signal.entryPrice;
  const potentialProfit = positionValue * tpDistancePct;
  const profitAsPctOfCapital = (potentialProfit / totalCapital) * 100;

  console.log(`🎯 TP analysis:
    Potential profit: ${potentialProfit.toFixed(2)} USDT
    As % of capital: ${profitAsPctOfCapital.toFixed(2)}%
    Minimum target: ${minProfitTargetPct}%`);

  if (profitAsPctOfCapital < minProfitTargetPct) {
    const requiredTpDistancePct = (totalCapital * minProfitTargetPct / 100) / positionValue;
    const requiredTpDistance = signal.entryPrice * requiredTpDistancePct;

    if (signal.action === 'LONG') {
      signal.takeProfit = signal.entryPrice + requiredTpDistance;
    } else {
      signal.takeProfit = signal.entryPrice - requiredTpDistance;
    }

    console.log(`📈 TP adjusted to meet ${minProfitTargetPct}% target: ${signal.takeProfit}`);
  }

  return signal;
}
