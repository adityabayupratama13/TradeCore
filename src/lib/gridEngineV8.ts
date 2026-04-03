// ═══════════════════════════════════════════════════════════════
// V8 SMART GRID BOT ENGINE — "Weekend / Tight Range Mode"
// Config: 15x leverage, 12 grids per side, 0.25% spacing
// Designed for low-volatility / weekend markets with short sideways range
// NO circuit breaker — NO auto-close — NO stop loss
// Range escape handled via Soft Expand (adds levels, never closes positions)
// ═══════════════════════════════════════════════════════════════

import { prisma } from '../../lib/prisma';
import {
  getMarkPrice, placeOrder, cancelAllOrders, getOpenOrders,
  setLeverage, setMarginType, getSymbolPrecision, roundPrice,
  roundQuantity, getBalance, getPositions
} from './binance';
import { sendTelegramAlert } from './telegram';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface GridLevel {
  index: number;
  price: number;
  side: 'BUY' | 'SELL';
  status: 'EMPTY' | 'ORDER_PLACED' | 'FILLED';
  orderId?: number;
  counterOrderId?: number;
  fillPrice?: number;
  profit?: number;
}

interface GridStateV8 {
  symbol: string;
  isActive: boolean;
  leverage: number;
  gridCount: number;
  gridSpacingPct: number;
  basePrice: number;
  upperBound: number;
  lowerBound: number;
  qtyPerGrid: number;
  levels: GridLevel[];
  totalProfit: number;
  totalFills: number;
  expandCount: number;
  createdAt: string;
  lastCycleAt: string;
}

interface GridConfigV8 {
  symbol?: string;
  leverage?: number;
  gridCount?: number;
  gridSpacingPct?: number;
  capitalPct?: number;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS — V8 DEFAULTS
// Optimized for weekend/tight-range: more grids, tighter spacing
// ─────────────────────────────────────────────────────────────

const GRID_STATE_KEY_V8 = 'grid_v8_state';
const DEFAULT_SYMBOL      = 'ETHUSDT';
const DEFAULT_LEVERAGE    = 15;     // Keep at 15x — safer for tight-spacing
const DEFAULT_GRID_COUNT  = 12;     // 12 levels per side (24 total) — more fill chances
const DEFAULT_SPACING_PCT = 0.25;   // 0.25% — narrower for tight sideways range
const DEFAULT_CAPITAL_PCT = 85;     // 85% of available balance
const MAX_EXPAND_COUNT    = 5;      // Alert user after 5 expands
const EXPAND_LEVELS       = 3;      // Add 3 levels per soft expand
const ESCAPE_THRESHOLD    = 0.5;    // Trigger soft expand at 0.5% beyond edge (tighter than V7)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// LOAD / SAVE STATE
// ─────────────────────────────────────────────────────────────

async function loadGridStateV8(): Promise<GridStateV8 | null> {
  const setting = await prisma.appSettings.findUnique({ where: { key: GRID_STATE_KEY_V8 } });
  if (!setting?.value) return null;
  try {
    return JSON.parse(setting.value);
  } catch {
    return null;
  }
}

async function saveGridStateV8(state: GridStateV8): Promise<void> {
  state.lastCycleAt = new Date().toISOString();
  await prisma.appSettings.upsert({
    where:  { key: GRID_STATE_KEY_V8 },
    update: { value: JSON.stringify(state) },
    create: { key: GRID_STATE_KEY_V8, value: JSON.stringify(state) }
  });
}

// ─────────────────────────────────────────────────────────────
// INITIALIZE GRID V8
// ─────────────────────────────────────────────────────────────

export async function initializeGridV8(config: GridConfigV8 = {}): Promise<GridStateV8> {
  const symbol         = config.symbol        ?? DEFAULT_SYMBOL;
  const leverage       = config.leverage      ?? DEFAULT_LEVERAGE;
  const gridCount      = config.gridCount     ?? DEFAULT_GRID_COUNT;
  const gridSpacingPct = config.gridSpacingPct ?? DEFAULT_SPACING_PCT;
  const capitalPct     = config.capitalPct    ?? DEFAULT_CAPITAL_PCT;

  console.log(`\n🟦 [GRID V8] Initializing for ${symbol}…`);
  console.log(`⚙️  Config: ${leverage}x leverage, ${gridCount} grids/side, ${gridSpacingPct}% spacing (Weekend Mode)`);

  // 1. Current price
  const priceData = await getMarkPrice(symbol);
  const currentPrice = priceData.markPrice;
  console.log(`📊 Current price: $${currentPrice}`);

  // 2. Grid boundaries
  const totalRange = gridCount * gridSpacingPct;
  const upperBound = currentPrice * (1 + totalRange / 100);
  const lowerBound = currentPrice * (1 - totalRange / 100);
  console.log(`📏 Grid range: $${lowerBound.toFixed(2)} — $${upperBound.toFixed(2)} (±${totalRange.toFixed(1)}%)`);

  // 3. Capital & quantity per grid
  const balances = await getBalance();
  const usdtBalance = balances.find((b: any) => b.asset === 'USDT');
  const availableCapital = (usdtBalance?.availableBalance || 0) * (capitalPct / 100);

  // ── Enforce Binance minimum $20 notional per order ──
  const MIN_NOTIONAL = 20; // Binance futures minimum
  const totalNotional = availableCapital * leverage;
  // Max orders we can place within minimum notional requirement
  const maxOrders    = Math.floor(totalNotional / MIN_NOTIONAL);
  const maxGridCount = Math.floor(maxOrders / 2); // per side

  let effectiveGridCount = gridCount;
  if (maxGridCount < gridCount) {
    effectiveGridCount = Math.max(1, maxGridCount);
    console.warn(`⚠️ [V8] Capital $${availableCapital.toFixed(2)} × ${leverage}x = $${totalNotional.toFixed(2)} notional`);
    console.warn(`⚠️ [V8] Max grids per side: ${maxGridCount} (need $${MIN_NOTIONAL}/order). Reducing from ${gridCount} → ${effectiveGridCount}`);
    if (effectiveGridCount < 2) {
      throw new Error(
        `V8 Grid: Insufficient capital. Need at least $${Math.ceil((MIN_NOTIONAL * 4) / leverage)} USDT for 2 grids/side. ` +
        `Available: $${availableCapital.toFixed(2)}. Add capital or reduce leverage.`
      );
    }
  }

  const notionalPerGrid = totalNotional / (effectiveGridCount * 2);
  const qtyPerGrid      = notionalPerGrid / currentPrice;

  const precision  = await getSymbolPrecision(symbol);
  const roundedQty = await roundQuantity(symbol, qtyPerGrid);

  console.log(`💰 Capital: $${availableCapital.toFixed(2)} × ${leverage}x | Notional/grid: $${notionalPerGrid.toFixed(2)} (min $${MIN_NOTIONAL})`);
  console.log(`📦 Qty/grid: ${roundedQty} ${symbol.replace('USDT', '')} (~$${(roundedQty * currentPrice).toFixed(2)})`);
  if (effectiveGridCount !== gridCount) {
    console.log(`📐 Grid count adjusted: ${gridCount} → ${effectiveGridCount} per side`);
  }

  if (roundedQty < precision.minQty) {
    throw new Error(
      `V8 Grid qty ${roundedQty} is below Binance minimum ${precision.minQty}. ` +
      `Need more capital or fewer grid levels.`
    );
  }

  // Use effectiveGridCount for the rest of the function
  const finalGridCount = effectiveGridCount;


  // 4. Set leverage & margin type
  await setMarginType(symbol, 'ISOLATED');
  await setLeverage(symbol, leverage);

  // 5. Build grid levels (use finalGridCount — adjusted for min notional)
  const levels: GridLevel[] = [];
  const spacing = currentPrice * (gridSpacingPct / 100);

  // Recalculate bounds using finalGridCount
  const totalRangeActual = finalGridCount * gridSpacingPct;
  const upperBoundActual = currentPrice * (1 + totalRangeActual / 100);
  const lowerBoundActual = currentPrice * (1 - totalRangeActual / 100);

  // BUY levels below current price
  for (let i = finalGridCount; i >= 1; i--) {
    const price = await roundPrice(symbol, currentPrice - spacing * i);
    levels.push({ index: finalGridCount - i, price, side: 'BUY', status: 'EMPTY' });
  }
  // SELL levels above current price
  for (let i = 1; i <= finalGridCount; i++) {
    const price = await roundPrice(symbol, currentPrice + spacing * i);
    levels.push({ index: finalGridCount + i - 1, price, side: 'SELL', status: 'EMPTY' });
  }

  const state: GridStateV8 = {
    symbol, isActive: true, leverage,
    gridCount: finalGridCount,  // store the effective grid count
    gridSpacingPct,
    basePrice:  currentPrice,
    upperBound: upperBoundActual,
    lowerBound: lowerBoundActual,
    qtyPerGrid: roundedQty, levels,
    totalProfit: 0, totalFills: 0, expandCount: 0,
    createdAt: new Date().toISOString(),
    lastCycleAt: new Date().toISOString()
  };

  // 6. Cancel existing orders
  try { await cancelAllOrders(symbol); } catch (_) {}
  await sleep(500);

  // 7. Place initial orders
  await placeGridOrdersV8(state);

  // 8. Save state
  await saveGridStateV8(state);

  console.log(`✅ [GRID V8] Initialized: ${levels.length} levels, ${gridSpacingPct}% spacing, ${leverage}x leverage`);
  if (finalGridCount !== gridCount) {
    console.log(`📐 Grid reduced: ${gridCount} → ${finalGridCount}/side due to capital. Notional/grid: $${notionalPerGrid.toFixed(2)}`);
  }

  await sendTelegramAlert({
    type: 'RAW_MESSAGE',
    data: {
      text: `🟦 GRID V8 STARTED (Weekend Mode)\n━━━━━━━━━━━━━━\n📊 ${symbol} @ $${currentPrice.toFixed(2)}\n📏 Range: $${lowerBoundActual.toFixed(2)} — $${upperBoundActual.toFixed(2)}\n📦 ${levels.length} levels (${finalGridCount}/side, ${gridSpacingPct}% spacing)\n⚡ Leverage: ${leverage}x\n💰 Per grid: ~$${notionalPerGrid.toFixed(2)} (~${roundedQty} ETH)\n━━━━━━━━━━━━━━\n🟦 V8: High-freq Soft Expand — NO auto-close`
    }
  } as any);

  return state;
}

// ─────────────────────────────────────────────────────────────
// PLACE GRID ORDERS (only EMPTY levels)
// ─────────────────────────────────────────────────────────────

async function placeGridOrdersV8(state: GridStateV8): Promise<void> {
  const { symbol, qtyPerGrid } = state;
  let placed = 0;

  for (const level of state.levels) {
    if (level.status !== 'EMPTY') continue;
    try {
      const order = await placeOrder({
        symbol,
        side: level.side,
        type: 'LIMIT',
        quantity: qtyPerGrid,
        price: level.price,
        timeInForce: 'GTC'
      });
      level.status = 'ORDER_PLACED';
      level.orderId = order.orderId;
      placed++;
      await sleep(100);
    } catch (err: any) {
      console.warn(`⚠️ [V8] Failed to place ${level.side} @ ${level.price}: ${err.message}`);
    }
  }

  console.log(`🟦 [V8] Placed ${placed} limit orders`);
}

// ─────────────────────────────────────────────────────────────
// SOFT EXPAND — Price escaped range, extend grid outward
// NEVER closes existing positions or cancels existing orders
// Escape threshold is tighter than V7 (0.5% vs 1.0%)
// ─────────────────────────────────────────────────────────────

async function softExpandGridV8(state: GridStateV8, currentPrice: number): Promise<void> {
  const { symbol } = state;
  const spacing = state.basePrice * (state.gridSpacingPct / 100);
  const newLevels: GridLevel[] = [];

  if (currentPrice > state.upperBound) {
    console.log(`📈 [V8] Price $${currentPrice} > upper $${state.upperBound.toFixed(2)} — Soft Expand UP`);
    for (let i = 1; i <= EXPAND_LEVELS; i++) {
      const price = await roundPrice(symbol, state.upperBound + spacing * i);
      newLevels.push({ index: state.levels.length + i, price, side: 'SELL', status: 'EMPTY' });
    }
    state.upperBound += spacing * EXPAND_LEVELS;
    state.levels.push(...newLevels);

  } else if (currentPrice < state.lowerBound) {
    console.log(`📉 [V8] Price $${currentPrice} < lower $${state.lowerBound.toFixed(2)} — Soft Expand DOWN`);
    for (let i = EXPAND_LEVELS; i >= 1; i--) {
      const price = await roundPrice(symbol, state.lowerBound - spacing * i);
      newLevels.unshift({
        index: -(state.expandCount * EXPAND_LEVELS + i),
        price, side: 'BUY', status: 'EMPTY'
      });
    }
    state.lowerBound -= spacing * EXPAND_LEVELS;
    state.levels.unshift(...newLevels);
  }

  state.expandCount = (state.expandCount || 0) + 1;

  for (const level of newLevels) {
    try {
      const order = await placeOrder({
        symbol, side: level.side, type: 'LIMIT',
        quantity: state.qtyPerGrid, price: level.price, timeInForce: 'GTC'
      });
      level.status  = 'ORDER_PLACED';
      level.orderId = order.orderId;
      await sleep(100);
    } catch (err: any) {
      console.warn(`⚠️ [V8] Soft Expand order failed @ ${level.price}: ${err.message}`);
    }
  }

  console.log(`✅ [V8] Soft Expand #${state.expandCount}: Added ${newLevels.length} levels. Range: $${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}`);

  const alertText = state.expandCount >= MAX_EXPAND_COUNT
    ? `⚠️ V8 GRID EXPAND #${state.expandCount}\n━━━━━━━━━━━━━━\n📊 ${symbol} @ $${currentPrice.toFixed(2)}\nRange: $${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}\n🔁 Grid expanded ${state.expandCount}× — consider manual review\n💡 Bot continues — posisi existing TIDAK ditutup`
    : `📐 V8 Soft Expand #${state.expandCount}\n${symbol} @ $${currentPrice.toFixed(2)}\nNew range: $${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}\n+${newLevels.length} levels`;

  await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: alertText } } as any);
}

// ─────────────────────────────────────────────────────────────
// MAIN V8 GRID CYCLE — Called every 30 seconds
// ─────────────────────────────────────────────────────────────

export async function runGridCycleV8(): Promise<void> {
  const state = await loadGridStateV8();
  if (!state || !state.isActive) return;
  state.levels = state.levels || [];

  // Concurrency lock
  const nowStr = Date.now().toString();
  const lock = await prisma.appSettings.findUnique({ where: { key: 'grid_v8_cycle_lock' } });
  if (lock && Date.now() - parseInt(lock.value) < 15000) return;
  await prisma.appSettings.upsert({
    where:  { key: 'grid_v8_cycle_lock' },
    update: { value: nowStr },
    create: { key: 'grid_v8_cycle_lock', value: nowStr }
  });

  // ── NO circuit breaker in V8 ──

  const { symbol } = state;

  try {
    const openOrders   = await getOpenOrders(symbol);
    const openOrderIds = new Set(openOrders.map((o: any) => o.orderId));

    const priceData    = await getMarkPrice(symbol);
    const currentPrice = priceData.markPrice;

    let stateChanged = false;
    const spacing    = state.basePrice * (state.gridSpacingPct / 100);

    // Check each level for fills
    for (const level of state.levels) {

      // ── Check if limit order was filled ──
      if (level.status === 'ORDER_PLACED' && level.orderId) {
        if (!openOrderIds.has(level.orderId)) {
          level.status    = 'FILLED';
          level.fillPrice = level.price;
          stateChanged    = true;

          console.log(`✅ [V8] ${level.side} FILLED @ $${level.price}`);

          const counterSide  = level.side === 'BUY' ? 'SELL' : 'BUY';
          const counterPrice = level.side === 'BUY'
            ? await roundPrice(symbol, level.price + spacing)
            : await roundPrice(symbol, level.price - spacing);

          try {
            const counterOrder = await placeOrder({
              symbol, side: counterSide, type: 'LIMIT',
              quantity: state.qtyPerGrid, price: counterPrice,
              timeInForce: 'GTC', reduceOnly: true
            });
            level.counterOrderId = counterOrder.orderId;
            console.log(`📤 [V8] Counter ${counterSide} placed @ $${counterPrice}`);
          } catch (err: any) {
            console.warn(`⚠️ [V8] Counter order failed: ${err.message}`);
            try {
              await placeOrder({
                symbol, side: counterSide, type: 'MARKET',
                quantity: state.qtyPerGrid, reduceOnly: true
              });
            } catch (_) {}
          }

          await sleep(200);
        }
      }

      // ── Check if counter-order was filled (cycle complete!) ──
      if (level.status === 'FILLED' && level.counterOrderId) {
        if (!openOrderIds.has(level.counterOrderId)) {
          const gridProfit   = state.qtyPerGrid * spacing;
          level.profit       = gridProfit;
          state.totalProfit += gridProfit;
          state.totalFills++;
          stateChanged = true;

          const counterPrice = level.side === 'BUY'
            ? level.price + spacing
            : level.price - spacing;

          console.log(`🎯 [V8] Cycle #${state.totalFills} complete! +$${gridProfit.toFixed(4)} (Total: $${state.totalProfit.toFixed(2)})`);

          await sendTelegramAlert({
            type: 'RAW_MESSAGE',
            data: {
              text: `🟦 V8 FILL #${state.totalFills}\n━━━━━━━━━━━\n${level.side === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${symbol} @ $${level.price}\n→ TP @ ~$${counterPrice.toFixed(2)}\n💰 +$${gridProfit.toFixed(4)}\n📊 Session: $${state.totalProfit.toFixed(2)} (${state.totalFills} fills)`
            }
          } as any);

          // Record trade in DB
          try {
            const portfolio = await prisma.portfolio.findFirst();
            await prisma.trade.create({
              data: {
                portfolioId:   portfolio!.id,
                marketType:    'FUTURES',
                symbol,
                direction:     level.side === 'BUY' ? 'LONG' : 'SHORT',
                entryPrice:    level.price,
                exitPrice:     counterPrice,
                quantity:      state.qtyPerGrid,
                leverage:      state.leverage,
                stopLoss:      0,
                takeProfit:    0,
                status:        'CLOSED',
                engineVersion: 'v8',
                pnl:           gridProfit,
                entryAt:       new Date(),
                exitAt:        new Date()
              }
            });
          } catch (e: any) {
            console.warn(`[V8] Failed to record trade: ${e.message}`);
          }

          // Reset level for next cycle
          level.status         = 'EMPTY';
          level.orderId        = undefined;
          level.counterOrderId = undefined;
          level.fillPrice      = undefined;
          level.profit         = undefined;
        }
      }
    }

    // Re-place EMPTY levels
    const emptyLevels = state.levels.filter(l => l.status === 'EMPTY');
    for (const level of emptyLevels) {
      const distPct = Math.abs((currentPrice - level.price) / currentPrice) * 100;
      if (distPct > state.gridSpacingPct * (state.gridCount + EXPAND_LEVELS * MAX_EXPAND_COUNT) * 1.5) continue;

      try {
        const order = await placeOrder({
          symbol, side: level.side, type: 'LIMIT',
          quantity: state.qtyPerGrid, price: level.price, timeInForce: 'GTC'
        });
        level.status  = 'ORDER_PLACED';
        level.orderId = order.orderId;
        stateChanged  = true;
        await sleep(100);
      } catch (_) {}
    }

    // Soft Expand if price escaped grid range (0.5% threshold — tighter than V7's 1%)
    const escapePct = ESCAPE_THRESHOLD / 100;
    if (
      currentPrice > state.upperBound * (1 + escapePct) ||
      currentPrice < state.lowerBound * (1 - escapePct)
    ) {
      await softExpandGridV8(state, currentPrice);
      stateChanged = true;
    }

    if (stateChanged) await saveGridStateV8(state);

  } catch (err: any) {
    console.error(`❌ [V8] Cycle error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// STOP GRID V8 — Manual stop only
// ─────────────────────────────────────────────────────────────

export async function stopGridV8(): Promise<{ totalProfit: number; totalFills: number }> {
  const state = await loadGridStateV8();
  if (!state) return { totalProfit: 0, totalFills: 0 };

  console.log(`🛑 [V8] Stopping grid for ${state.symbol}…`);

  try { await cancelAllOrders(state.symbol); } catch (_) {}
  await sleep(500);

  const positions = await getPositions();
  const pos = positions.find((p: any) => p.symbol === state.symbol);
  if (pos && pos.positionAmt !== 0) {
    const closeSide = pos.positionAmt > 0 ? 'SELL' : 'BUY';
    try {
      await placeOrder({
        symbol:     state.symbol,
        side:       closeSide,
        type:       'MARKET',
        quantity:   Math.abs(pos.positionAmt),
        reduceOnly: true
      });

      try {
        const portfolio = await prisma.portfolio.findFirst();
        await prisma.trade.create({
          data: {
            portfolioId:   String(portfolio?.id ?? 1),
            marketType:    'FUTURES',
            symbol:        state.symbol,
            direction:     closeSide === 'BUY' ? 'SHORT' : 'LONG',
            entryPrice:    pos.entryPrice,
            exitPrice:     state.basePrice,
            quantity:      Math.abs(pos.positionAmt),
            leverage:      pos.leverage || state.leverage,
            stopLoss:      0,
            takeProfit:    0,
            status:        'CLOSED',
            engineVersion: 'v8',
            pnl:           pos.unrealizedProfit || 0,
            entryAt:       new Date(state.createdAt),
            exitAt:        new Date()
          }
        });
      } catch (_) {}
    } catch (e: any) {
      console.warn(`[V8] Failed to close position: ${e.message}`);
    }
  }

  state.isActive = false;
  await saveGridStateV8(state);

  const result = { totalProfit: state.totalProfit, totalFills: state.totalFills };

  await sendTelegramAlert({
    type: 'RAW_MESSAGE',
    data: {
      text: `🛑 GRID V8 STOPPED\n━━━━━━━━━━━━━━\n📊 ${state.symbol}\n💰 Total profit: $${state.totalProfit.toFixed(2)}\n📈 Total fills: ${state.totalFills}\n🔁 Expands: ${state.expandCount}×\n⏱️ Runtime: ${getRuntime(state.createdAt)}`
    }
  } as any);

  return result;
}

// ─────────────────────────────────────────────────────────────
// STATUS — For UI
// ─────────────────────────────────────────────────────────────

export async function getGridStatusV8(): Promise<any> {
  const state = await loadGridStateV8();
  if (!state) return { isActive: false };

  const activeLevels = (state.levels || []).filter(l => l.status === 'ORDER_PLACED').length;
  const filledLevels = (state.levels || []).filter(l => l.status === 'FILLED').length;

  return {
    isActive:       state.isActive,
    symbol:         state.symbol,
    basePrice:      state.basePrice,
    upperBound:     state.upperBound,
    lowerBound:     state.lowerBound,
    leverage:       state.leverage,
    gridCount:      state.gridCount,
    gridSpacingPct: state.gridSpacingPct,
    activeLevels,
    filledLevels,
    totalLevels:    (state.levels || []).length,
    totalProfit:    state.totalProfit || 0,
    totalFills:     state.totalFills  || 0,
    expandCount:    state.expandCount || 0,
    runtime:        getRuntime(state.createdAt),
    lastCycleAt:    state.lastCycleAt
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getRuntime(createdAt: string): string {
  const ms      = Date.now() - new Date(createdAt).getTime();
  const hours   = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}
