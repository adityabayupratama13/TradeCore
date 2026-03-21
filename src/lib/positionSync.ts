import { getPositions, getOpenAlgoOrders, placeAlgoOrder } from './binance';
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

    // Check if any DB positions CLOSED on Binance (TP/SL hit)
    const binanceSymbols = new Set(binancePositions.map(p => p.symbol));

    for (const trade of dbTrades) {
      if (!binanceSymbols.has(trade.symbol)) {
        // Trade closed!
        
        // Finalize PNL logic: Since it closed, get realistic DB snapshot of exit price
        // (In a true production app, we would fetch /fapi/v1/userTrades to find exact exit price)
        // For simulation completeness based on SL/TP bounds:
        let exitPrice = trade.entryPrice; 
        
        // Mock proxy for exit price: PNL dictates where it closed roughly
        const isWin = trade.pnlPct && trade.pnlPct > 0;
        if (isWin && trade.takeProfit) exitPrice = trade.takeProfit;
        else if (trade.stopLoss) exitPrice = trade.stopLoss;

        await prisma.trade.update({
          where: { id: trade.id },
          data: {
            status: 'CLOSED',
            exitAt: new Date(),
            exitPrice,
          }
        });

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
                    exitPrice: exitPrice, pnl: trade.pnl || 0,
                    pnlPct: (trade.pnlPct || 0).toFixed(2),
                    reason: 'Closed on Binance'
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
