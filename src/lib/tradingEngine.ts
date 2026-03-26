import { getPositions, getBalance, enterTrade, closePosition, placeOrder, cancelAllOrders, getMarkPrice, getKlines, getSymbolPrecision, placeAlgoOrder, cancelAlgoOrder, roundPrice, roundQuantity, getOpenAlgoOrders } from './binance';
import { FALLBACK_PAIRS, MIN_CONFIDENCE_FULL, MIN_CONFIDENCE_HALF } from './constants';
import { analyzeMarket, analyzeMarketV3, analyzeMarketV4, calculateATR } from './aiEngine';
import { manageV3Trade, saveV3TPLevels, V3TPLevels } from './partialTPManager';
import { syncPositions } from './positionSync';
import { prisma } from '../../lib/prisma';
import { sendTelegramAlert } from './telegram';
import { checkAndEnforceCircuitBreaker } from './circuitBreaker';
import { getCoinCategory } from './coinCategories';
import { checkBtcRegime, isLiquidPair, getV4Leverage } from './btcRegime';

let cycleNumber = 0;

export async function manageOpenPositions() {
  await processPendingSignals();
  await syncPositions();
  await checkAndEnforceCircuitBreaker();
  
  const openTrades = await prisma.trade.findMany({ where: { status: 'OPEN' } });
  if (openTrades.length === 0) return;

  // V3 Partial TP Management — check each open trade for TP hits
  for (const trade of openTrades) {
    try {
      const v3Result = await manageV3Trade(trade);
      if (v3Result) {
        console.log(`[V3 TP] ${trade.symbol}: ${v3Result.action} — ${v3Result.detail}`);
      }
    } catch (e) {
      // V3 TP management is non-critical, don't break the loop
    }
  }

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

      const isLong = trade.direction === 'LONG' || trade.direction === 'BUY';
      const profitRaw = isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
      const profitPct = (profitRaw / trade.entryPrice) * trade.leverage * 100;

      let holdHours = (Date.now() - new Date(trade.entryAt).getTime()) / 3600000;
      let takeProfitSafe = trade.takeProfit || (trade.entryPrice * (isLong ? 1.05 : 0.95));

      // ----------------------------------------------------------------------
      // PROGRESSIVE PROFIT TAKING (MILESTONES)
      // ----------------------------------------------------------------------
      const milestoneKey = `milestone_${trade.id}`;
      const milestoneSetting = await prisma.appSettings.findUnique({ where: { key: milestoneKey } });
      const milestones = milestoneSetting?.value 
        ? JSON.parse(milestoneSetting.value) 
        : { milestone1Hit: false, milestone2Hit: false, milestone3Hit: false };

      // MILESTONE 1: +30% profit (ROE)
      if (profitPct >= 30 && !milestones.milestone1Hit) {
        console.log(`🎯 ${trade.symbol} Milestone 1: +${profitPct.toFixed(1)}%`);
        
        // FIX: Cancel BOTH SL and TP before placing new orders
        // Binance hanya izinkan satu closePosition:true per arah — harus cancel semua dulu
        if (trade.slAlgoId) await cancelAlgoOrder(trade.symbol, parseInt(trade.slAlgoId)).catch(()=>{});
        if (trade.tpAlgoId) await cancelAlgoOrder(trade.symbol, parseInt(trade.tpAlgoId)).catch(()=>{});
        await sleep(500);

        const oppSide = isLong ? 'SELL' : 'BUY';
        
        // Place new SL at BEP
        const roundedTrig = await roundPrice(trade.symbol, trade.entryPrice);
        const newSl = await placeAlgoOrder({
          algoType: 'CONDITIONAL', symbol: trade.symbol, side: oppSide,
          type: 'STOP_MARKET', triggerPrice: roundedTrig.toString(),
          closePosition: 'true', workingType: 'MARK_PRICE', priceProtect: 'FALSE', timeInForce: 'GTC'
        });
        await sleep(300);

        // Re-place TP at original take profit price
        let newTpAlgoId = trade.tpAlgoId;
        if (trade.takeProfit) {
          const roundedTP = await roundPrice(trade.symbol, trade.takeProfit);
          const newTp = await placeAlgoOrder({
            algoType: 'CONDITIONAL', symbol: trade.symbol, side: oppSide,
            type: 'TAKE_PROFIT_MARKET', triggerPrice: roundedTP.toString(),
            closePosition: 'true', workingType: 'MARK_PRICE', priceProtect: 'FALSE', timeInForce: 'GTC'
          }).catch(err => { console.error(`[M1] Re-place TP failed:`, err.message); return null; });
          if (newTp?.algoId) newTpAlgoId = newTp.algoId.toString();
        }

        await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: roundedTrig, slAlgoId: newSl?.algoId?.toString(), tpAlgoId: newTpAlgoId } });
        console.log(`🛡️ SL moved to BEP: ${trade.entryPrice} for ${trade.symbol}`);

        // 2. Close 30% of position
        const closeQty = trade.quantity * 0.30;
        const roundedQty = await roundQuantity(trade.symbol, closeQty);
        await placeOrder({ symbol: trade.symbol, side: oppSide, type: 'MARKET', quantity: roundedQty, reduceOnly: true }).catch(err => console.error(err));
        console.log(`💰 Partial close MILESTONE_1: ${roundedQty} ${trade.symbol}`);

        // FIX B: Hitung realized PnL dari partial close
        const partialPnlUsd1 = parseFloat((profitRaw * roundedQty).toFixed(2));
        const remainingQty1 = parseFloat((trade.quantity - roundedQty).toFixed(8));

        // FIX B: Update DB — quantity sisa + catat partial PnL
        await prisma.trade.update({
          where: { id: trade.id },
          data: { quantity: remainingQty1 }
        });
        await prisma.engineLog.create({
          data: {
            cycleNumber,
            symbol: trade.symbol,
            action: 'PARTIAL_CLOSE',
            result: 'EXECUTED',
            reason: `Milestone 1 (+${profitPct.toFixed(1)}% ROE): Closed 30% (${roundedQty} units). Realized PnL: +$${partialPnlUsd1}. SL moved to BEP. Remaining: ${remainingQty1} units.`
          }
        });

        // 3. Update milestone state
        milestones.milestone1Hit = true;
        await prisma.appSettings.upsert({ where: { key: milestoneKey }, update: { value: JSON.stringify(milestones) }, create: { key: milestoneKey, value: JSON.stringify(milestones) } });

        // 4. FIX A: Telegram alert
        await sendTelegramAlert({
          type: 'PARTIAL_TP',
          data: {
            symbol: trade.symbol,
            direction: trade.direction,
            partialPnl: partialPnlUsd1.toFixed(2),
            partialPct: profitPct.toFixed(1),
            takeProfit: trade.takeProfit ?? 'N/A'
          }
        });
      }
      // MILESTONE 2: +60% profit (ROE)
      if (profitPct >= 60 && !milestones.milestone2Hit) {
        console.log(`🎯 ${trade.symbol} Milestone 2: +${profitPct.toFixed(1)}%`);
        
        const oppSide = isLong ? 'SELL' : 'BUY';
        const closeQty = trade.quantity * 0.30;
        const roundedQty = await roundQuantity(trade.symbol, closeQty);
        await placeOrder({ symbol: trade.symbol, side: oppSide, type: 'MARKET', quantity: roundedQty, reduceOnly: true }).catch(err => console.error(err));
        console.log(`💰 Partial close MILESTONE_2: ${roundedQty} ${trade.symbol}`);

        const partialPnlUsd2 = parseFloat((profitRaw * roundedQty).toFixed(2));
        const remainingQty2 = parseFloat((trade.quantity - roundedQty).toFixed(8));

        await prisma.trade.update({ where: { id: trade.id }, data: { quantity: remainingQty2 } });
        await prisma.engineLog.create({
          data: {
            cycleNumber, symbol: trade.symbol, action: 'PARTIAL_CLOSE', result: 'EXECUTED',
            reason: `Milestone 2 (+${profitPct.toFixed(1)}% ROE): Closed 30% (${roundedQty} units). Realized PnL: +$${partialPnlUsd2}. Remaining: ${remainingQty2} units (40%).`
          }
        });

        milestones.milestone2Hit = true;
        await prisma.appSettings.upsert({ where: { key: milestoneKey }, update: { value: JSON.stringify(milestones) }, create: { key: milestoneKey, value: JSON.stringify(milestones) } });

        await sendTelegramAlert({
          type: 'PARTIAL_TP',
          data: {
            symbol: trade.symbol, direction: trade.direction,
            partialPnl: partialPnlUsd2.toFixed(2), partialPct: profitPct.toFixed(1),
            takeProfit: trade.takeProfit ?? 'N/A'
          }
        });
      }

      // ─────────────────────────────────────────────────────────────────
      // TP AUTO-RESTORE — Cek dan re-place TP jika hilang (misal setelah partial close)
      // Binance kadang auto-cancel TP algo saat posisi size berubah
      // ─────────────────────────────────────────────────────────────────
      if (trade.tpAlgoId && trade.takeProfit) {
        try {
          const algoOrders = await getOpenAlgoOrders(trade.symbol);
          // Handle both response formats: { orders: [...] } or direct array
          const ordersList = Array.isArray(algoOrders) ? algoOrders : (algoOrders?.orders || []);
          const tpStillActive = ordersList.some((o: any) =>
            String(o.algoId) === String(trade.tpAlgoId) || o.type === 'TAKE_PROFIT_MARKET'
          );
          if (!tpStillActive) {
            console.log(`⚠️ [TP RESTORE] ${trade.symbol} TP algo gone! Re-placing TP at ${trade.takeProfit}`);
            const oppSide = isLong ? 'SELL' : 'BUY';
            const roundedTP = await roundPrice(trade.symbol, trade.takeProfit);
            try {
              const newTp = await placeAlgoOrder({
                algoType: 'CONDITIONAL', symbol: trade.symbol, side: oppSide,
                type: 'TAKE_PROFIT_MARKET', triggerPrice: roundedTP.toString(),
                closePosition: 'true', workingType: 'MARK_PRICE', priceProtect: 'FALSE', timeInForce: 'GTC'
              });
              if (newTp?.algoId) {
                await prisma.trade.update({ where: { id: trade.id }, data: { tpAlgoId: newTp.algoId.toString() } });
                await logEngine({ symbol: trade.symbol, action: 'TP_RESTORE', result: 'EXECUTED', reason: `TP algo was missing, re-placed at ${roundedTP}` });
                console.log(`✅ [TP RESTORE] ${trade.symbol} TP restored at ${roundedTP} (algoId: ${newTp.algoId})`);
              }
            } catch (placeErr: any) {
              // If Binance says TP already exists, the TP is actually still active — just our tracking was wrong
              if (placeErr.message?.includes('existing') || placeErr.message?.includes('already')) {
                console.log(`ℹ️ [TP RESTORE] ${trade.symbol} TP already exists on Binance — no action needed`);
              } else {
                throw placeErr; // Re-throw other errors
              }
            }
          }
        } catch (tpErr: any) {
          console.error(`[TP RESTORE] Failed for ${trade.symbol}:`, tpErr.message);
        }
      }

      // RULE 4: MAX HOLD (configurable dari UI, default 16 jam WIB)

      const maxHoldSetting = await prisma.appSettings.findUnique({ where: { key: 'max_hold_hours' } });
      const maxHold = maxHoldSetting?.value ? parseInt(maxHoldSetting.value) : 16;
      if (holdHours >= maxHold) {
         if (profitPct > 0) {
             await closePosition(trade.symbol, trade.quantity);
             await prisma.trade.update({ where: { id: trade.id }, data: { status: 'CLOSED', exitPrice: currentPrice, exitAt: new Date(), pnlPct: profitPct } });
             await checkAndEnforceCircuitBreaker();
             await sendTelegramAlert({ type: 'SESSION_CLOSE', data: { symbol: trade.symbol, direction: trade.direction, reason: `Max hold ${maxHold}h reached`, pnl: profitRaw * trade.quantity, pnlPct: profitPct.toFixed(2), holdDuration: `${holdHours.toFixed(1)}h` }});
             continue;
         } else if (profitPct <= -15) {
             // CRITICAL FIX: Force close positions with deep loss at max hold
             // Previously these would hold forever "letting SL work naturally"
             console.log(`🚨 [FORCE CLOSE] ${trade.symbol} at ${profitPct.toFixed(1)}% ROE after ${holdHours.toFixed(1)}h — cutting loss`);
             await closePosition(trade.symbol, trade.quantity);
             const pnlUsd = profitRaw * trade.quantity;
             await prisma.trade.update({ where: { id: trade.id }, data: { status: 'CLOSED', exitPrice: currentPrice, exitAt: new Date(), pnl: pnlUsd, pnlPct: profitPct } });
             await checkAndEnforceCircuitBreaker();
             await sendTelegramAlert({ type: 'SESSION_CLOSE', data: { symbol: trade.symbol, direction: trade.direction, reason: `Max hold ${maxHold}h + deep loss force close`, pnl: pnlUsd, pnlPct: profitPct.toFixed(2), holdDuration: `${holdHours.toFixed(1)}h` }});
             continue;
         } else {
             await logEngine({ symbol: trade.symbol, action: 'MAX_HOLD', result: 'WAITING', reason: `In minor loss (${profitPct.toFixed(1)}%), SL still within range — waiting up to ${maxHold + 4}h` });
             // Extended grace: if still holding 4h after max hold, force close regardless
             if (holdHours >= maxHold + 4) {
               console.log(`🚨 [EXTENDED FORCE CLOSE] ${trade.symbol} at ${profitPct.toFixed(1)}% after ${holdHours.toFixed(1)}h — absolute max reached`);
               await closePosition(trade.symbol, trade.quantity);
               const pnlUsd = profitRaw * trade.quantity;
               await prisma.trade.update({ where: { id: trade.id }, data: { status: 'CLOSED', exitPrice: currentPrice, exitAt: new Date(), pnl: pnlUsd, pnlPct: profitPct } });
               await checkAndEnforceCircuitBreaker();
               await sendTelegramAlert({ type: 'SESSION_CLOSE', data: { symbol: trade.symbol, direction: trade.direction, reason: `Extended max hold force close`, pnl: pnlUsd, pnlPct: profitPct.toFixed(2), holdDuration: `${holdHours.toFixed(1)}h` }});
               continue;
             }
         }
      }

      // RULE 5: SESSION CLOSE (NY close)
      const isSessionCloseEnabled = process.env.SESSION_CLOSE_ENABLED === 'true';
      if (isSessionCloseEnabled && currentHourWIB >= 4 && currentHourWIB <= 5) {
         if (profitPct > 0.5) {
             await closePosition(trade.symbol, trade.quantity);
             await prisma.trade.update({ where: { id: trade.id }, data: { status: 'CLOSED', exitPrice: currentPrice, exitAt: new Date(), pnlPct: profitPct } });
             await checkAndEnforceCircuitBreaker();
             await sendTelegramAlert({ type: 'SESSION_CLOSE', data: { symbol: trade.symbol, direction: trade.direction, reason: 'NY session closing', pnl: profitRaw * trade.quantity, pnlPct: profitPct.toFixed(2), holdDuration: `${holdHours.toFixed(1)}h` }});
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

    // UI RiskRule settings dictate max positions further down
    const currentPositions = await getPositions();
    const currentSymbols = new Set(currentPositions.map((p: any) => p.symbol));

    if (currentSymbols.has(symbol)) return;

    // Fetch Engine Version (default v1)
    const execVersionSetting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
    const engineVersionForExec = execVersionSetting?.value || 'v1';

    // V4 Block: Removed per user request. V4 now scans ALL coins for scalping/daytrading
    // (It retains BTC Regime Gate and Balance-Aware Leverage protections but drops the pair whitelist)

    // FIX: DB-level per-symbol execution lock to prevent race condition double entries
    // Two concurrent AI calls can both pass the Binance position check before either completes
    const execLockKey = `exec_lock_${symbol}`;
    const execLock = await prisma.appSettings.findUnique({ where: { key: execLockKey } });
    if (execLock?.value) {
      const lockAge = Date.now() - parseInt(execLock.value);
      if (lockAge < 90_000) { // Lock valid for 90 seconds
        console.log(`🔒 [EXEC LOCK] ${symbol} already being processed (${(lockAge/1000).toFixed(0)}s ago). Skipping duplicate.`);
        return;
      }
    }
    // Acquire lock immediately before async AI analysis
    await prisma.appSettings.upsert({
      where: { key: execLockKey },
      update: { value: Date.now().toString() },
      create: { key: execLockKey, value: Date.now().toString() }
    });

        const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) throw new Error("No portfolio configured");

    const balances = await getBalance();
    const usdtBalance = balances.find((b: any) => b.asset === 'USDT');
    const realAvailableBalance = usdtBalance ? usdtBalance.availableBalance : 0;
    const realWalletBalance = usdtBalance ? usdtBalance.balance : 0;

    // ── CAPITAL OVERRIDE (Simulated Capital) ──────────────────────────
    // Jika user set simulated_capital_usd di Risk Manager, gunakan nilai itu
    // sebagai totalWalletBalance untuk kalkulasi position size & risk,
    // tapi tetap pakai real balance untuk check kecukupan margin.
    const capitalOverrideSetting = await prisma.appSettings.findUnique({ where: { key: 'simulated_capital_usd' } });
    const simulatedCapital = capitalOverrideSetting?.value ? parseFloat(capitalOverrideSetting.value) : 0;
    const isCapitalOverride = simulatedCapital > 0;

    const availableBalance = realAvailableBalance;
    const totalWalletBalance = isCapitalOverride ? simulatedCapital : realWalletBalance;

    if (isCapitalOverride) {
      console.log(`🎭 [CAPITAL OVERRIDE] Trading as if capital = $${simulatedCapital} (real balance: $${realWalletBalance.toFixed(2)})`);
    }
    // ─────────────────────────────────────────────────────────────────

    if (portfolio && realWalletBalance > 0) {
        await prisma.portfolio.update({
            where: { id: portfolio.id },
            data: { totalCapital: isCapitalOverride ? simulatedCapital : realWalletBalance }
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

    const nowWIB = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const startOfDayWIB = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
    startOfDayWIB.setHours(startOfDayWIB.getHours() - 7); // Back to UTC

    const tradesTodayCount = await prisma.trade.count({
      where: {
        entryAt: { gte: startOfDayWIB },
        status: { not: 'CANCELLED' }
      }
    });

    let dynamicMinConf = riskRule?.minConfidence ?? 55;
    const setting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
    let activePairs = [{symbol: 'BTCUSDT'}, {symbol: 'ETHUSDT'}, {symbol: 'SOLUSDT'}];
    if (setting?.value) { try { activePairs = JSON.parse(setting.value); } catch(e){} }
    
    // Filter out already open symbols
    const availablePairs = activePairs.filter((p: any) => !currentSymbols.has(p.symbol));

    const maxPositions = riskRule?.maxOpenPositions ?? 5;
    const availableSlots = maxPositions - currentSymbols.size;

    if (availableSlots <= 0) {
      console.log(`🚫 All ${maxPositions} positions full. Skipping AI analysis to save tokens.`);
      return;
    }

    // Fetch Engine Version (default v1)
    const versionSetting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
    const engineVersion = versionSetting?.value || 'v1';

    // V4: Check BTC regime ONCE before analyzing all pairs
    // This avoids redundant API calls and ensures consistent regime across all pair analyses this cycle
    let btcRegime: Awaited<ReturnType<typeof checkBtcRegime>> | null = null;
    if (engineVersion === 'v4') {
      btcRegime = await checkBtcRegime();
      console.log(`[V4] BTC Regime: ${btcRegime.regime} | Allow LONG: ${btcRegime.allowLong} | Allow SHORT: ${btcRegime.allowShort}`);
    }

    // OPTIMIZATION: Di V4 kita kirim SEMUA koin (up to 30) untuk dijaring
    const aiScanLimit = engineVersion === 'v4' ? availablePairs.length : Math.min(availableSlots * 3, availablePairs.length);
    let pairsToAnalyze = availablePairs.slice(0, aiScanLimit);

    // V4: Filter out non-liquid pairs (meme coins etc.) before sending to AI
    // Removed per user request. V4 now scans ALL coins like V3 for aggressive scalping.
    // Hunter sudah sort by score, jadi slice pertama = pair terbaik

    console.log(`🔍 Slots tersedia: ${availableSlots} — Mengirim ${pairsToAnalyze.length}/${availablePairs.length} pair ke AI (Engine: ${engineVersion.toUpperCase()}) (Mode: ${riskRule?.activeMode || 'SAFE'})...`);
    console.log(`💡 Token saved: skipping ${availablePairs.length - pairsToAnalyze.length} pair dari AI scan`);
    
    // FIX: Batch AI thinking to prevent SQLite Database Connection Timouts (locking) & Rate limits
    const chunkSize = 4;
    const results: any[] = [];
    
    for (let i = 0; i < pairsToAnalyze.length; i += chunkSize) {
        const batch = pairsToAnalyze.slice(i, i + chunkSize);
        console.log(`   Processing AI batch ${Math.floor(i/chunkSize) + 1}/${Math.ceil(pairsToAnalyze.length/chunkSize)}...`);
        
        const aiPromises = batch.map(async (pair: any) => {
            try {
                if (engineVersion === 'v4') {
                    // V4: BTC regime gate — skip if signal direction blocked by BTC regime
                    const signal = await analyzeMarketV4(
                        pair.symbol,
                        pair.symbol === symbol ? triggerData : null,
                        riskRule?.activeMode || 'SAFE',
                        btcRegime?.regime || 'UNKNOWN'
                    );
                    // Post-filter: if BTC gate blocks this direction, override to SKIP
                    if (signal.action === 'LONG' && btcRegime && !btcRegime.allowLong) {
                        console.log(`[V4-GATE] ${pair.symbol}: LONG blocked by BTC regime (${btcRegime.regime})`);
                        return { ...signal, action: 'SKIP' as const, reasoning: `V4 BTC gate: LONG blocked (BTC ${btcRegime.regime})` };
                    }
                    if (signal.action === 'SHORT' && btcRegime && !btcRegime.allowShort) {
                        console.log(`[V4-GATE] ${pair.symbol}: SHORT blocked by BTC regime (${btcRegime.regime})`);
                        return { ...signal, action: 'SKIP' as const, reasoning: `V4 BTC gate: SHORT blocked (BTC ${btcRegime.regime})` };
                    }
                    return signal;
                }
                if (engineVersion === 'v3') {
                    return await analyzeMarketV3(
                        pair.symbol,
                        pair.symbol === symbol ? triggerData : null,
                        riskRule?.activeMode || 'SAFE'
                    );
                }
                return await analyzeMarket(
                    pair.symbol, 
                    pair.symbol === symbol ? triggerData : null, 
                    riskRule?.activeMode || 'SAFE',
                    engineVersion
                );
            } catch (err: any) {
                console.error(`[Engine] Error analyzing ${pair.symbol}:`, err.message);
                return null;
            }
        });
        
        const batchResults = await Promise.all(aiPromises);
        results.push(...batchResults);
    }
    const signals: any[] = results.filter(s => s !== null);

    // FIX: Log ALL signals to history, even if SKIP or low confidence, for debugging visibility
    for (const s of signals) {
      await prisma.tradeSignalHistory.create({
        data: {
          symbol: s.symbol,
          action: s.action,
          confidence: s.confidence,
          reasoning: s.reasoning,
          entryPrice: s.entryPrice || 0, // Fallback if null
          stopLoss: s.stopLoss || 0,
          takeProfit: s.takeProfit || 0,
          leverage: s.leverage || 1,
          riskReward: s.riskReward || 0,
          keySignal: s.keySignal || 'N/A',
          wasExecuted: false,
          engineVersion: engineVersion
        }
      }).catch(err => console.error("Error saving signal history", err));
    }

    // Gunakan minConfidence dari riskRule (configurable dari UI Risk Manager, default 55)
    // Jangan ganjal lagi pakai Math.max(..., 70) karena V4 memang mentargetkan 55+
    const minConf = dynamicMinConf;

    const validSignals = signals
      .filter(s => {
         if (s.action === 'SKIP') return false;
         if (s.confidence < minConf) {
            console.log(`⏭️ Min confidence: ${minConf}%. Actual ${s.confidence}%. Skip.`);
            return false;
         }
         return true;
      })
      .sort((a, b) => b.confidence - a.confidence);

    console.log(`✅ Valid signals: ${validSignals.length} (>=${minConf}%). Executing up to ${availableSlots}...`);


    for (let i = 0; i < Math.min(validSignals.length, availableSlots); i++) {
        await executeTradeSignal(validSignals[i], portfolio, availableBalance, totalWalletBalance, isTestMode, riskRule, engineVersion);
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

async function executeTradeSignal(signal: any, portfolio: any, availableBalance: number, totalWalletBalance: number, isTestMode: boolean, riskRule: any, engineVersion: string, isFromPending = false) {
    const symbol = signal.symbol;

    if (signal.entryUrgency === 'WAIT_PULLBACK' && !isFromPending) {
        const pullbackPct = signal.pullbackPct || 1.0;
        const targetPrice = signal.action === 'LONG' 
            ? signal.entryPrice * (1 - (pullbackPct / 100))
            : signal.entryPrice * (1 + (pullbackPct / 100));
            
        console.log(`⏳ [PULLBACK] ${symbol} ${signal.action} waiting for retracement to ${targetPrice.toFixed(4)} (${pullbackPct}% buffer)`);
        
        const sigObj = {
            symbol, direction: signal.action, confidence: signal.confidence,
            entryPrice: signal.entryPrice, targetPrice,
            stopLoss: signal.stopLoss, takeProfit: signal.takeProfit,
            leverage: signal.leverage, timestamp: Date.now(),
            engineVersion: engineVersion
        };
        
        await prisma.$transaction(async (tx) => {
            const setting = await tx.appSettings.findUnique({ where: { key: 'pending_signals' }});
            let pendingArr = setting?.value ? JSON.parse(setting.value) : [];
            pendingArr = pendingArr.filter((s:any) => s.symbol !== symbol); // remove old
            pendingArr.push(sigObj);
            await tx.appSettings.upsert({
                where: { key: 'pending_signals' },
                update: { value: JSON.stringify(pendingArr) },
                create: { key: 'pending_signals', value: JSON.stringify(pendingArr) }
            });
        });
        
        await logEngine({ symbol, action: signal.action, signal, result: 'PENDING', reason: `Waiting for ${pullbackPct}% pullback to ${targetPrice.toFixed(4)}` });
        return;
    }

    // ABSOLUTE FIRST CHECK — Removed SAFE_UNIVERSE check for 100% organic operation

    const startOfDayWIB = new Date();
    startOfDayWIB.setHours(0, 0, 0, 0);

    const blacklistSetting = await prisma.appSettings.findUnique({
      where: { key: `blacklist_${symbol}_until` }
    });
    if (blacklistSetting?.value) {
      const blacklistUntil = new Date(blacklistSetting.value);
      if (blacklistUntil > new Date()) {
        const hoursLeft = ((blacklistUntil.getTime() - Date.now()) / 3600000).toFixed(1);
        console.log(`🚫 ${symbol} blacklisted for ${hoursLeft}h more (fast SL rule)`);
        await logEngine({ symbol, action: signal.action, result: 'BLOCKED', reason: `Fast SL Blacklisted until ${blacklistUntil.toISOString()}` });
        return;
      }
    }
    
    const tradesTodaySymbol = await prisma.trade.count({
      where: {
        symbol: symbol,
        createdAt: { gte: startOfDayWIB },
        status: { not: 'CANCELLED' }
      }
    });

    const maxTradesSettingSymbol = await prisma.appSettings.findUnique({ where: { key: 'max_trades_per_symbol' } });
    const maxTradesPerSymbol = parseInt(maxTradesSettingSymbol?.value || '3');

    if (tradesTodaySymbol >= maxTradesPerSymbol) {
        console.log(`❌ Max ${maxTradesPerSymbol} trades per day reached for ${symbol}. Skipping.`);
        await logEngine({ symbol, action: signal.action, result: 'BLOCKED', reason: `MAX_TRADES_PER_SYMBOL (${maxTradesPerSymbol}) reached today for ${symbol}` });
        return;
    }

    
    // Check bypassed

    // 

    if (!signal.entryPrice || !signal.stopLoss || !signal.takeProfit) {
        await logEngine({ symbol, action: signal.action, signal, result: 'ERROR', reason: `LLM missing targets` });
        return; 
    }

    // ─────────────────────────────────────────────────────────────────
    // PRICE DRIFT VALIDATION — Cegah "stale signal entry" yang langsung SL
    // Jika harga saat ini sudah bergerak terlalu jauh dari harga yg AI analisa,
    // skip trade karena kondisi pasar sudah berubah
    // ─────────────────────────────────────────────────────────────────
    try {
      const currentMarkObj = await getMarkPrice(symbol);
      const currentMark = currentMarkObj.markPrice;
      const aiEntryPrice = signal.entryPrice;
      const driftPct = ((currentMark - aiEntryPrice) / aiEntryPrice) * 100;
      // Baca threshold dari DB (bisa diubah dari Risk Manager UI)
      const driftSetting = await prisma.appSettings.findUnique({ where: { key: 'max_entry_drift_pct' } });
      const MAX_DRIFT_PCT = parseFloat(driftSetting?.value || '0.8');

      // Untuk LONG: jika harga naik jauh (> MAX_DRIFT) = sudah telat masuk = overpriced
      // Untuk SHORT: jika harga turun jauh (< -MAX_DRIFT) = sudah telat masuk = kita akan short di harga lebih rendah
      const isStale = signal.action === 'LONG'
        ? driftPct > MAX_DRIFT_PCT    // harga sudah naik, LONG jadi mahal
        : driftPct < -MAX_DRIFT_PCT;  // harga sudah turun, SHORT jadi terlalu dalam

      if (isStale) {
        const dir = driftPct > 0 ? '+' : '';
        console.log(`⚠️ [STALE SIGNAL] ${symbol} ${signal.action} — Price drift: ${dir}${driftPct.toFixed(2)}% (max ${MAX_DRIFT_PCT}%). AI entry: ${aiEntryPrice}, Current: ${currentMark}. SKIPPING to avoid immediate SL.`);
        await logEngine({
          symbol,
          action: signal.action,
          signal,
          result: 'IGNORED',
          reason: `Stale signal: price drifted ${dir}${driftPct.toFixed(2)}% since AI analysis (max allowed: ${MAX_DRIFT_PCT}%). Entry price stale.`
        });
        return;
      }

      // Update signal.entryPrice ke harga sekarang jika masih dalam range (lebih akurat)
      signal.entryPrice = currentMark;
      console.log(`✅ [PRICE CHECK] ${symbol} drift: ${driftPct > 0 ? '+' : ''}${driftPct.toFixed(3)}% — OK, using current mark: ${currentMark}`);
    } catch (driftErr) {
      console.error(`[PriceCheck] Could not verify drift for ${symbol}, proceeding with AI price:`, driftErr);
    }


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

    const positionValue = margin * leverage;
    const riskAmount = Math.abs(signal.entryPrice - signal.stopLoss) * quantity;
    const riskPct = ((riskAmount / totalWalletBalance) * 100).toFixed(2);
    const lvStr = leverage.toString();

    console.log(`
╔═══════════════════════════════╗
║     PRE-TRADE VALIDATION      ║
╠═══════════════════════════════╣
║ Symbol:   ${signal.symbol.padEnd(20)}║
║ USDT Bal: $${availableBalance.toFixed(2).padEnd(19)}║
║ Risk:     ${riskPct}% = $${riskAmount.toFixed(2).padEnd(13)}║
║ Position: $${positionValue.toFixed(2).padEnd(19)}║
║ Margin:   $${margin.toFixed(2).padEnd(19)}║
║ Leverage: ${lvStr}x${' '.repeat(20 - lvStr.length)}║
╚═══════════════════════════════╝`);

    if (availableBalance < 1) {
      console.error('❌ Balance < $1. Cannot trade.');
      return;
    }

    if (positionValue > availableBalance * 15) {
      console.error(`❌ Position $${positionValue.toFixed(2)} > 15x balance. BLOCKED.`);
      return;
    }

    if (margin > availableBalance * 0.40) {
      console.error(`❌ Margin $${margin.toFixed(2)} > 40% balance. BLOCKED.`);
      return;
    }

    // NEW FIX 4: TP MINIMUM 15% ENFORCE
    // FIX 2: Turunkan default dari 15% → 5%. 15% terlalu agresif untuk small account ($58).
    // Nilai 15% memaksa TP terlalu jauh, sehingga TP jarang kena dan kebanyakan kena SL duluan.
    signal = enforceMinProfitTarget(signal, margin * leverage, totalWalletBalance, riskRule?.minProfitTargetPct ?? 5);
    
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
    // Min margin guard: balance $51 × risk 2% = $1.02 risk → margin ~$2-3 at 8x lev
    // $5 threshold was blocking 100% of all valid trades on small accounts
    // $2 threshold: $2 margin × 8x = $16 position → fee $0.013 round-trip (still worth it)
    if (margin < 2.0) {
      console.log(`Position margin ${margin.toFixed(2)} < $2, skipping (too small for fees)`);
      await logEngine({ symbol, action: signal.action, signal, result: 'SKIPPED', reason: `Calculated margin $${margin.toFixed(2)} < $2 minimum (fee protection)` });
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
          tpAlgoId: res.tpAlgoId?.toString(),
          engineVersion: engineVersion
        }
      });

      // V3: Save multi-level TP data for partial TP management
      if (engineVersion === 'v3' && (signal as any).v3Data) {
        const v3 = (signal as any).v3Data;
        const createdTrade = await prisma.trade.findFirst({
          where: { symbol, status: 'OPEN' },
          orderBy: { entryAt: 'desc' }
        });
        if (createdTrade) {
          const tpLevels: V3TPLevels = {
            tp1: v3.tp1,
            tp2: v3.tp2,
            tp3: v3.tp3,
            tp1Hit: false,
            tp2Hit: false,
            tp3Hit: false,
            originalSL: signal.stopLoss,
            currentSL: signal.stopLoss,
            trailingActivated: false
          };
          await saveV3TPLevels(createdTrade.id, tpLevels);
          console.log(`📊 V3 TP Levels saved: TP1=${v3.tp1.toFixed(4)} TP2=${v3.tp2.toFixed(4)} TP3=${v3.tp3.toFixed(4)}`);
        }
      }

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
  if (result === 'ERROR' || result === 'BLOCKED') {
    console.error(`❌ [ENGINE ${result}] ${symbol} ${action}: ${reason}`);
  }
  try {
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
  } catch (logErr: any) {
    console.error(`❌ Failed to write engine log to DB: ${logErr.message}`, logErr);
  }
}

// ==========================================
// FIX 11: SMART ENTRY PENDING SIGNALS PULLBACK
// ==========================================
async function processPendingSignals() {
  try {
    const pendingSetting = await prisma.appSettings.findUnique({ where: { key: 'pending_signals' } });
    if (!pendingSetting || !pendingSetting.value) return;
    
    let pendingSignals = JSON.parse(pendingSetting.value);
    if (!Array.isArray(pendingSignals) || pendingSignals.length === 0) return;
    
    const now = Date.now();
    let executedCount = 0;
    
    const validSignals = pendingSignals.filter((sig: any) => (now - sig.timestamp) < (4 * 3600 * 1000));
    
    for (const sig of validSignals) {
       try {
           const markPriceObj = await getMarkPrice(sig.symbol);
           const currentPrice = markPriceObj.markPrice;
           
           let isHit = false;
           if (sig.direction === 'LONG' && currentPrice <= sig.targetPrice) isHit = true;
           if (sig.direction === 'SHORT' && currentPrice >= sig.targetPrice) isHit = true;
           
           if (isHit) {
              console.log(`🎯 PENDING HIT: ${sig.symbol} ${sig.direction} target ${sig.targetPrice} reached (Current: ${currentPrice})`);
              
              const balances = await getBalance();
              const usdtBalance = balances.find((b: any) => b.asset === 'USDT');
              const availableBalance = usdtBalance ? usdtBalance.availableBalance : 0;
              const totalWalletBalance = usdtBalance ? usdtBalance.balance : 0;
              const portfolio = await prisma.portfolio.findFirst();
              const riskRule = await prisma.riskRule.findFirst({ where: { isActive: true } });
              
              const mockSignal = {
                 symbol: sig.symbol,
                 action: sig.direction,
                 confidence: sig.confidence,
                 entryPrice: currentPrice, // Execute at current hit price
                 stopLoss: sig.stopLoss,
                 takeProfit: sig.takeProfit,
                 leverage: sig.leverage,
                 entryUrgency: 'MARKET' // Override to market since target is met
              };
              
              const isTestMode = process.env.ENGINE_TEST_MODE === 'true';
              await executeTradeSignal(mockSignal, portfolio, availableBalance, totalWalletBalance, isTestMode, riskRule, sig.engineVersion || 'v1', true);
              sig.executed = true;
              executedCount++;
           }
       } catch (err) {
           console.error(`Error processing pending signal for ${sig.symbol}:`, err);
       }
    }
    
    const remainingSignals = validSignals.filter((sig: any) => !sig.executed);
    if (remainingSignals.length !== pendingSignals.length || executedCount > 0) {
        await prisma.appSettings.update({
            where: { key: 'pending_signals' },
            data: { value: JSON.stringify(remainingSignals) }
        });
    }
  } catch(e) {
      console.error("Error processing pending signals:", e);
  }
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
  totalCapitalOverride: number, // Simulated capital override (set di Risk Manager)
  signalConfidence: number
): Promise<{ quantity: number, margin: number, leverage: number, liqPrice: number, adjustedSl: number } | null> {
  
  const balance = await getBalance();
  const usdtBalance = balance.find((b: any) => b.asset === 'USDT');
  const realAvailable = usdtBalance?.availableBalance ?? 0;
  
  // Gunakan override jika aktif (simulated capital), otherwise real balance
  const totalCapital = totalCapitalOverride > 0 ? totalCapitalOverride : realAvailable;
  
  console.log(`💰 USDT Balance: $${realAvailable.toFixed(2)}${totalCapitalOverride > 0 ? ` (Override: $${totalCapitalOverride})` : ''}`);
  
  // Check real available balance untuk pastikan margin bisa dipenuhi
  if (realAvailable < 5) {
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

  // Determine engine version for leverage strategy
  const versionSettingForLev = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
  const engineVersionForLev = versionSettingForLev?.value || 'v1';

  let leverage: number;
  if (engineVersionForLev === 'v4') {
    // V4: Balance-aware leverage — ignores riskRule leverage settings entirely
    // This prevents the 20-25x madness that was causing -8 to -12% ROE per loss
    leverage = getV4Leverage(symbol, realAvailable);
    console.log(`[V4-LEV] ${symbol}: ${leverage}x (balance-aware, balance: $${realAvailable.toFixed(2)})`);
  } else {
    // V1/V2/V3: Use riskRule leverage (configurable from UI)
    leverage = getCategoryLeverage(symbol, riskRule);
    console.log(`📊 Leverage: ${leverage}x (from mode settings)`);
  }

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

  // FIX 3: Fee Guard — skip jika potensi profit < 3x estimated round-trip fee.
  // Binance maker/taker fee ≈ 0.04% per side = 0.08% round trip.
  // Kalau profit bruto < 3× fee, secara statistik akan rugi setelah beberapa trade.
  const estimatedFeeUsd = positionValue * 0.0008; // 0.08% round trip
  if (potentialProfit < estimatedFeeUsd * 3 && signal.action !== 'SKIP') {
    console.log(`⚠️ [FEE GUARD] ${signal.symbol} potential profit $${potentialProfit.toFixed(4)} < 3x fee $${(estimatedFeeUsd*3).toFixed(4)}. SKIP.`);
    signal.action = 'SKIP';
    signal.reasoning = `Fee guard: profit too small vs trading cost`;
    return signal;
  }

  console.log(`🎯 TP analysis:
    Potential profit: ${potentialProfit.toFixed(2)} USDT
    As % of capital: ${profitAsPctOfCapital.toFixed(2)}%
    Minimum target: ${minProfitTargetPct}%
    Est. fees: $${estimatedFeeUsd.toFixed(4)} (3x = $${(estimatedFeeUsd*3).toFixed(4)})`);

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
