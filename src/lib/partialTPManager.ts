import { prisma } from '../../lib/prisma';
import { placeAlgoOrder, cancelAlgoOrder, placeOrder, roundPrice, roundQuantity, getMarkPrice } from './binance';

// ==========================================
// ENGINE V3: PARTIAL TP MANAGER
// TP1/TP2/TP3 + Move SL to BE/TP1
// ==========================================

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface V3TPLevels {
  tp1: number;       // R/R 1:2 — close 50%
  tp2: number;       // R/R 1:4 — close 30%
  tp3: number;       // R/R 1:6+ — trailing 20%
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  originalSL: number;
  currentSL: number;
  trailingActivated: boolean;
}

// ------------------------------------------
// SAVE V3 TP LEVELS TO DB
// ------------------------------------------

export async function saveV3TPLevels(tradeId: string, levels: V3TPLevels): Promise<void> {
  const key = `v3_tp_${tradeId}`;
  await prisma.appSettings.upsert({
    where: { key },
    create: { key, value: JSON.stringify(levels) },
    update: { value: JSON.stringify(levels) }
  });
}

export async function getV3TPLevels(tradeId: string): Promise<V3TPLevels | null> {
  const key = `v3_tp_${tradeId}`;
  const setting = await prisma.appSettings.findUnique({ where: { key } });
  if (!setting?.value) return null;
  try {
    return JSON.parse(setting.value) as V3TPLevels;
  } catch {
    return null;
  }
}

export async function deleteV3TPLevels(tradeId: string): Promise<void> {
  const key = `v3_tp_${tradeId}`;
  await prisma.appSettings.delete({ where: { key } }).catch(() => {});
}

// ------------------------------------------
// MANAGE V3 TRADE: Check & Execute Partial TPs
// ------------------------------------------

export async function manageV3Trade(trade: any): Promise<{ action: string; detail: string } | null> {
  const tpLevels = await getV3TPLevels(trade.id);
  if (!tpLevels) return null; // Not a V3 trade

  const markPriceObj = await getMarkPrice(trade.symbol);
  const currentPrice = markPriceObj.markPrice;
  const isLong = trade.direction === 'LONG' || trade.direction === 'BUY';
  const oppSide = isLong ? 'SELL' : 'BUY';

  // ------ TP1: Close 50%, move SL to breakeven ------
  if (!tpLevels.tp1Hit) {
    const tp1Hit = isLong ? currentPrice >= tpLevels.tp1 : currentPrice <= tpLevels.tp1;
    
    if (tp1Hit) {
      console.log(`🎯 V3 TP1 HIT: ${trade.symbol} at ${currentPrice} (target: ${tpLevels.tp1})`);

      // Cancel existing SL and TP algo orders
      if (trade.slAlgoId) await cancelAlgoOrder(trade.symbol, parseInt(trade.slAlgoId)).catch(() => {});
      if (trade.tpAlgoId) await cancelAlgoOrder(trade.symbol, parseInt(trade.tpAlgoId)).catch(() => {});
      await sleep(500);

      // Close 50% of position
      const closeQty = trade.quantity * 0.50;
      const roundedQty = await roundQuantity(trade.symbol, closeQty);
      
      try {
        await placeOrder({
          symbol: trade.symbol,
          side: oppSide,
          type: 'MARKET',
          quantity: roundedQty,
          reduceOnly: true
        });
        console.log(`💰 V3 Partial TP1: closed ${roundedQty} of ${trade.symbol} (50%)`);
      } catch (err: any) {
        console.error(`❌ V3 TP1 partial close failed:`, err.message);
        return { action: 'TP1_FAILED', detail: err.message };
      }
      await sleep(300);

      // Move SL to breakeven (entry price)
      const beSL = await roundPrice(trade.symbol, trade.entryPrice);
      const newSL = await placeAlgoOrder({
        algoType: 'CONDITIONAL',
        symbol: trade.symbol,
        side: oppSide,
        type: 'STOP_MARKET',
        triggerPrice: beSL.toString(),
        closePosition: 'true',
        workingType: 'MARK_PRICE',
        priceProtect: 'FALSE',
        timeInForce: 'GTC'
      }).catch(err => { console.error('Move SL to BE failed:', err.message); return null; });
      await sleep(300);

      // Place TP2 as next algo order
      const roundedTP2 = await roundPrice(trade.symbol, tpLevels.tp2);
      const newTP = await placeAlgoOrder({
        algoType: 'CONDITIONAL',
        symbol: trade.symbol,
        side: oppSide,
        type: 'TAKE_PROFIT_MARKET',
        triggerPrice: roundedTP2.toString(),
        closePosition: 'true',
        workingType: 'MARK_PRICE',
        priceProtect: 'FALSE',
        timeInForce: 'GTC'
      }).catch(err => { console.error('Place TP2 failed:', err.message); return null; });

      // Calculate realized PnL
      const profitRaw = isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
      const partialPnl = parseFloat((profitRaw * roundedQty).toFixed(4));
      const remaining = parseFloat((trade.quantity - roundedQty).toFixed(8));

      // Update DB
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          quantity: remaining,
          stopLoss: beSL,
          takeProfit: tpLevels.tp2,
          slAlgoId: newSL?.algoId?.toString() || null,
          tpAlgoId: newTP?.algoId?.toString() || null,
          pnlUsd: (trade.pnlUsd || 0) + partialPnl
        }
      });

      // Update TP levels
      tpLevels.tp1Hit = true;
      tpLevels.currentSL = trade.entryPrice;
      await saveV3TPLevels(trade.id, tpLevels);

      console.log(`🛡️ V3 SL → BE at ${trade.entryPrice}. Next target: TP2 at ${tpLevels.tp2}`);
      return { action: 'TP1_HIT', detail: `Closed 50% (+$${partialPnl.toFixed(2)}), SL→BE` };
    }
  }

  // ------ TP2: Close 30% more, move SL to TP1 level ------
  if (tpLevels.tp1Hit && !tpLevels.tp2Hit) {
    const tp2Hit = isLong ? currentPrice >= tpLevels.tp2 : currentPrice <= tpLevels.tp2;

    if (tp2Hit) {
      console.log(`🎯🎯 V3 TP2 HIT: ${trade.symbol} at ${currentPrice} (target: ${tpLevels.tp2})`);

      if (trade.slAlgoId) await cancelAlgoOrder(trade.symbol, parseInt(trade.slAlgoId)).catch(() => {});
      if (trade.tpAlgoId) await cancelAlgoOrder(trade.symbol, parseInt(trade.tpAlgoId)).catch(() => {});
      await sleep(500);

      // Close 30% of REMAINING position (which is 50% of original → 30%×remaining ≈ 60% of current)
      // Actually we want 30% of ORIGINAL. Since we have 50% left, close 60% of remaining.
      const closeRatio = 0.60; // 30% of original = 60% of remaining 50%
      const closeQty = trade.quantity * closeRatio;
      const roundedQty = await roundQuantity(trade.symbol, closeQty);

      try {
        await placeOrder({
          symbol: trade.symbol,
          side: oppSide,
          type: 'MARKET',
          quantity: roundedQty,
          reduceOnly: true
        });
        console.log(`💰 V3 Partial TP2: closed ${roundedQty} of ${trade.symbol} (30% original)`);
      } catch (err: any) {
        console.error(`❌ V3 TP2 partial close failed:`, err.message);
        return { action: 'TP2_FAILED', detail: err.message };
      }
      await sleep(300);

      // Move SL to TP1 level
      const tp1SL = await roundPrice(trade.symbol, tpLevels.tp1);
      const newSL = await placeAlgoOrder({
        algoType: 'CONDITIONAL',
        symbol: trade.symbol,
        side: oppSide,
        type: 'STOP_MARKET',
        triggerPrice: tp1SL.toString(),
        closePosition: 'true',
        workingType: 'MARK_PRICE',
        priceProtect: 'FALSE',
        timeInForce: 'GTC'
      }).catch(err => { console.error('Move SL to TP1 failed:', err.message); return null; });

      const profitRaw = isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
      const partialPnl = parseFloat((profitRaw * roundedQty).toFixed(4));
      const remaining = parseFloat((trade.quantity - roundedQty).toFixed(8));

      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          quantity: remaining,
          stopLoss: tp1SL,
          takeProfit: tpLevels.tp3,
          slAlgoId: newSL?.algoId?.toString() || null,
          tpAlgoId: null,
          pnlUsd: (trade.pnlUsd || 0) + partialPnl
        }
      });

      tpLevels.tp2Hit = true;
      tpLevels.currentSL = tpLevels.tp1;
      tpLevels.trailingActivated = true;
      await saveV3TPLevels(trade.id, tpLevels);

      console.log(`🛡️ V3 SL → TP1 at ${tpLevels.tp1}. Trailing mode ON for remaining 20%`);
      return { action: 'TP2_HIT', detail: `Closed 30% (+$${partialPnl.toFixed(2)}), SL→TP1, trailing ON` };
    }
  }

  // ------ TP3: Trailing Stop for last 20% ------
  if (tpLevels.tp2Hit && !tpLevels.tp3Hit && tpLevels.trailingActivated) {
    // Trail SL 0.5% behind current price
    const trailPct = 0.005; // 0.5%
    const newTrailSL = isLong 
      ? currentPrice * (1 - trailPct)
      : currentPrice * (1 + trailPct);

    // Only move SL forward, never backward
    const shouldMove = isLong 
      ? newTrailSL > tpLevels.currentSL
      : newTrailSL < tpLevels.currentSL;

    if (shouldMove) {
      console.log(`📈 V3 Trailing SL update: ${trade.symbol} ${tpLevels.currentSL.toFixed(4)} → ${newTrailSL.toFixed(4)}`);

      if (trade.slAlgoId) await cancelAlgoOrder(trade.symbol, parseInt(trade.slAlgoId)).catch(() => {});
      await sleep(300);

      const roundedTrailSL = await roundPrice(trade.symbol, newTrailSL);
      const newSL = await placeAlgoOrder({
        algoType: 'CONDITIONAL',
        symbol: trade.symbol,
        side: oppSide,
        type: 'STOP_MARKET',
        triggerPrice: roundedTrailSL.toString(),
        closePosition: 'true',
        workingType: 'MARK_PRICE',
        priceProtect: 'FALSE',
        timeInForce: 'GTC'
      }).catch(err => { console.error('Trailing SL update failed:', err.message); return null; });

      if (newSL?.algoId) {
        await prisma.trade.update({
          where: { id: trade.id },
          data: { stopLoss: roundedTrailSL, slAlgoId: newSL.algoId.toString() }
        });

        tpLevels.currentSL = newTrailSL;
        await saveV3TPLevels(trade.id, tpLevels);
      }

      // Check if TP3 target hit → close everything
      const tp3Hit = isLong ? currentPrice >= tpLevels.tp3 : currentPrice <= tpLevels.tp3;
      if (tp3Hit) {
        console.log(`🎯🎯🎯 V3 TP3 HIT: ${trade.symbol} — closing remaining position!`);
        tpLevels.tp3Hit = true;
        await saveV3TPLevels(trade.id, tpLevels);
        return { action: 'TP3_HIT', detail: 'All targets hit! Trailing will close via SL.' };
      }

      return { action: 'TRAILING_UPDATE', detail: `SL trailed to ${roundedTrailSL}` };
    }
  }

  return null; // No action needed this cycle
}
