import { getPositions, getOpenAlgoOrders, placeAlgoOrder, getUserTrades } from './binance';
import { prisma } from '../../lib/prisma';
import { sendTelegramAlert } from './telegram';
import { getCoinCategory } from './coinCategories';
import { checkAndEnforceCircuitBreaker } from './circuitBreaker';

let isSyncing = false;
let lastSyncTime = 0;

export async function syncPositions(): Promise<void> {
  if (isSyncing) return;
  if (Date.now() - lastSyncTime < 10000) return; // Prevent spamming within 10 seconds
  
  isSyncing = true;
  try {
    lastSyncTime = Date.now();
    const binancePositions = await getPositions();
    const dbTrades = await prisma.trade.findMany({ where: { status: 'OPEN' } });

    // Update active DB positions with latest markPrice and Unrealized PNL
    for (const pos of binancePositions) {
      const existing = dbTrades.find(t => t.symbol === pos.symbol && t.status === 'OPEN');
      if (existing) {
        let hasSL = false;
        try {
           const openOrders = await getOpenAlgoOrders(pos.symbol);
           const slOrder = openOrders.find((o: any) => o.orderType === 'STOP_MARKET' || o.orderType === 'STOP');
           if (slOrder) {
               hasSL = true;
               if (!existing.slAlgoId || existing.slAlgoId !== slOrder.algoId.toString()) {
                   await prisma.trade.update({ where: { id: existing.id }, data: { slAlgoId: slOrder.algoId.toString() } });
               }
           }
        } catch(e) {
           console.error(`[PosSync] Error fetching open orders for ${pos.symbol}:`, e);
           // Fallback assume true to avoid spamming recreation if API errors natively
           hasSL = true; 
        }

        if (!hasSL && existing.stopLoss) {
           try {
             const newSl = await placeAlgoOrder({
               algoType: 'CONDITIONAL',
               symbol: pos.symbol,
               side: pos.positionAmt > 0 ? 'SELL' : 'BUY',
               type: 'STOP_MARKET',
               quantity: Math.abs(pos.positionAmt).toString(),
               triggerPrice: existing.stopLoss.toString(),
               closePosition: 'true',
               workingType: 'MARK_PRICE',
               priceProtect: 'FALSE',
               timeInForce: 'GTC'
             });
             
             await prisma.trade.update({
               where: { id: existing.id },
               data: { slAlgoId: newSl.algoId.toString() }
             });
             
             console.log(`[PosSync] Recreated missing SL Algo for ${pos.symbol}: ${newSl.algoId}`);
           } catch(e: any) {
             await sendTelegramAlert({
               type: 'RAW_MESSAGE',
               data: { text: `🚨 URGENT: ${pos.symbol} has no Stop Loss!\nManual action required immediately.\nCurrent P&L: ${pos.unrealizedProfit}` } as any
             });
           }
        }

        const pnlPct = ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.positionAmt > 0 ? 1 : -1) * pos.leverage;
        await prisma.trade.update({
          where: { id: existing.id },
          data: {
            pnl: pos.unrealizedProfit,
            pnlPct
          }
        });
      } else {
        // Prevent race condition: If trading engine is currently entering this trade, do not adopt it yet
        const execLock = await prisma.appSettings.findUnique({ where: { key: `exec_lock_${pos.symbol}` } });
        if (execLock?.value) {
            const lockAge = Date.now() - parseInt(execLock.value);
            if (lockAge < 90_000) {
                console.log(`[PosSync] Skipping adoption of ${pos.symbol} — engine is currently executing it (${(lockAge/1000).toFixed(0)}s ago)`);
                continue; // Skip this iteration
            }
        }

        // Double check it wasn't inserted during the await above
        const doubleCheck = await prisma.trade.findFirst({ where: { symbol: pos.symbol, status: 'OPEN' } });
        if (doubleCheck) {
            console.log(`[PosSync] ${pos.symbol} was just inserted by engine, skipping adoption`);
            continue;
        }

        console.log(`[PosSync] Adopting orphaned/manual position ${pos.symbol} into DB`);
        try {
            let portfolio = await prisma.portfolio.findFirst();
            if (!portfolio) {
                portfolio = await prisma.portfolio.create({ data: { name: 'Main Portfolio', totalCapital: 1000, currency: 'USD' } });
            }
            await prisma.trade.create({
              data: {
                portfolioId: portfolio.id,
                symbol: pos.symbol,
                direction: pos.positionAmt > 0 ? "LONG" : "SHORT",
                entryPrice: pos.entryPrice,
                quantity: Math.abs(pos.positionAmt),
                leverage: pos.leverage,
                status: "OPEN",
                marketType: "FUTURES",
              }
            });
            console.log(`[PosSync] Successfully adopted ${pos.symbol}`);
        } catch(e) {
            console.error(`[PosSync] Failed to adopt position ${pos.symbol}`, e);
        }
      }
    }

    const binanceSymbols = new Set(binancePositions.map(p => p.symbol));

    for (const trade of dbTrades) {
      if (!binanceSymbols.has(trade.symbol)) {
        // Trade closed on Binance! Fetch actual fill data.
        
        let exitPrice = trade.entryPrice;
        let realizedPnl = trade.pnl || 0;
        let totalCommission = 0;
        
        // Fetch ACTUAL exit price and PNL from Binance userTrades
        try {
          const recentTrades = await getUserTrades(trade.symbol, 20);
          // Find close trades (reduce-only) that happened after entry
          const entryTime = trade.entryAt ? new Date(trade.entryAt).getTime() : 0;
          // FIX 1: Filter by opposite side to avoid counting entry fills or unrelated trades.
          // Only "closing" fills (opposite side of position direction) count as exit trades.
          const isLongPos = trade.direction === 'LONG' || trade.direction === 'BUY';
          const closeSide = isLongPos ? 'SELL' : 'BUY';
          const closeTrades = recentTrades.filter(t => t.time > entryTime && t.side === closeSide);
          
          if (closeTrades.length > 0) {
            // Calculate volume-weighted average exit price
            let totalQty = 0;
            let totalValue = 0;
            realizedPnl = 0;
            totalCommission = 0;
            
            for (const ct of closeTrades) {
              totalQty += ct.qty;
              totalValue += ct.price * ct.qty;
              realizedPnl += ct.realizedPnl;
              totalCommission += ct.commission;
            }
            
            if (totalQty > 0) {
              exitPrice = totalValue / totalQty; // VWAP exit price
            }
            
            // Subtract commission from PNL for net profit
            realizedPnl = realizedPnl - totalCommission;
            
            console.log(`📊 [PosSync] ${trade.symbol} actual close data:`);
            console.log(`   Exit price: ${exitPrice.toFixed(6)} (VWAP from ${closeTrades.length} fills)`);
            console.log(`   Realized PNL: $${realizedPnl.toFixed(4)} (after $${totalCommission.toFixed(4)} fees)`);
          } else {
            // Fallback: use last known PNL snapshot
            console.log(`[PosSync] ${trade.symbol}: no recent userTrades found, using last PNL snapshot`);
          }
        } catch (utErr: any) {
          console.error(`[PosSync] Failed to fetch userTrades for ${trade.symbol}:`, utErr.message);
          // Fallback: use SL/TP estimate like before
          const isWin = trade.pnlPct && trade.pnlPct > 0;
          if (isWin && trade.takeProfit) exitPrice = trade.takeProfit;
          else if (trade.stopLoss) exitPrice = trade.stopLoss;
        }
        
        const isLong = trade.direction === 'LONG' || trade.direction === 'BUY';
        const pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * (isLong ? 1 : -1) * trade.leverage;

        await prisma.trade.update({
          where: { id: trade.id },
          data: {
            status: 'CLOSED',
            exitAt: new Date(),
            exitPrice,
            pnl: realizedPnl,
            pnlPct,
          }
        });

        // ----------------------------------------------------------------------
        // FAST SL BLACKLIST & MILESTONE CLEANUP
        // ----------------------------------------------------------------------
        await prisma.appSettings.deleteMany({ where: { key: `milestone_${trade.id}` } }).catch(()=>{});
        // Also clean up V3 TP levels
        await prisma.appSettings.deleteMany({ where: { key: `v3_tp_${trade.id}` } }).catch(()=>{});

        const isWin = realizedPnl > 0;
        if (!isWin && trade.entryAt) {
          const holdMinutes = (Date.now() - new Date(trade.entryAt).getTime()) / 60000;
          if (holdMinutes <= 5) {
            console.log(`⚡ Fast SL detected: ${trade.symbol} lost in ${holdMinutes.toFixed(1)}min`);
            const midnight = new Date();
            midnight.setDate(midnight.getDate() + 1);
            midnight.setHours(0, 0, 0, 0);

            await prisma.appSettings.upsert({
              where: { key: `blacklist_${trade.symbol}_until` },
              update: { value: midnight.toISOString() },
              create: { key: `blacklist_${trade.symbol}_until`, value: midnight.toISOString() }
            });

            console.log(`🚫 ${trade.symbol} blacklisted until ${midnight.toISOString()}`);

            await sendTelegramAlert({
              type: 'FAST_SL_BLACKLIST',
              data: { symbol: trade.symbol, holdMinutes: holdMinutes.toFixed(1), loss: trade.pnl?.toFixed(2) || '0', blacklistedUntil: 'midnight' }
            });
          }
        }

        // 1. Auto Journal insertion!
        await prisma.tradeJournal.create({
          data: {
            tradeId: trade.id,
            emotionState: "CALM",
            ruleFollowed: true,
            notes: 'AI Engine Autonomous Close',
            lessonsLearned: `Signal Integrity Held`,
          }
        });

        // 2. Alert
            await sendTelegramAlert({
                type: 'TRADE_CLOSE',
                data: {
                    symbol: trade.symbol, direction: trade.direction,
                    exitPrice: exitPrice, pnl: realizedPnl,
                    pnlPct: pnlPct.toFixed(2),
                    reason: `Closed on Binance${totalCommission > 0 ? ` (fee: $${totalCommission.toFixed(4)})` : ''}`
                }
            });
            await checkAndEnforceCircuitBreaker();
        } else {     }
    }

  } catch (error) {
    console.error('Position Sync Error:', error);
  } finally {
    isSyncing = false;
  }
}
