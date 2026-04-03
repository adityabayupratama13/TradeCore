// ═══════════════════════════════════════════════════════════════
// V7 SMART GRID BOT ENGINE
// Optimized config: 15x leverage, 8 grids per side, 0.5% spacing
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

interface GridStateV7 {
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
  expandCount: number;      // How many times Soft Expand has been triggered
  createdAt: string;
  lastCycleAt: string;
}

interface GridConfigV7 {
  symbol?: string;
  leverage?: number;
  gridCount?: number;
  gridSpacingPct?: number;
  capitalPct?: number;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS — V7 DEFAULTS
// ─────────────────────────────────────────────────────────────

const GRID_STATE_KEY_V7 = 'grid_v7_state';
const DEFAULT_SYMBOL      = 'ETHUSDT';
const DEFAULT_LEVERAGE    = 15;     // Safer than 20x, still profitable
const DEFAULT_GRID_COUNT  = 8;      // 8 levels per side (16 total)
const DEFAULT_SPACING_PCT = 0.5;    // 0.5% between levels (wider = safer)
const DEFAULT_CAPITAL_PCT = 85;     // 85% of available balance
const MAX_EXPAND_COUNT    = 5;      // Alert user after 5 expands (bot keeps running)
const EXPAND_LEVELS       = 3;      // Add 3 new levels per soft expand
const ESCAPE_THRESHOLD    = 1.0;    // Trigger soft expand at 1% beyond grid edge

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// LOAD / SAVE STATE
// ─────────────────────────────────────────────────────────────

async function loadGridStateV7(): Promise<GridStateV7 | null> {
  const setting = await prisma.appSettings.findUnique({ where: { key: GRID_STATE_KEY_V7 } });
  if (!setting?.value) return null;
  try {
    return JSON.parse(setting.value);
  } catch {
    return null;
  }
}

async function saveGridStateV7(state: GridStateV7): Promise<void> {
  state.lastCycleAt = new Date().toISOString();
  await prisma.appSettings.upsert({
    where: { key: GRID_STATE_KEY_V7 },
    update: { value: JSON.stringify(state) },
    create: { key: GRID_STATE_KEY_V7, value: JSON.stringify(state) }
  });
}

// ─────────────────────────────────────────────────────────────
// INITIALIZE GRID V7
// ─────────────────────────────────────────────────────────────

export async function initializeGridV7(config: GridConfigV7 = {}): Promise<GridStateV7> {
  const symbol         = config.symbol        ?? DEFAULT_SYMBOL;
  const leverage       = config.leverage      ?? DEFAULT_LEVERAGE;
  const gridCount      = config.gridCount     ?? DEFAULT_GRID_COUNT;
  const gridSpacingPct = config.gridSpacingPct ?? DEFAULT_SPACING_PCT;
  const capitalPct     = config.capitalPct    ?? DEFAULT_CAPITAL_PCT;

  console.log(`\n🔷 [GRID V7] Initializing for ${symbol}…`);
  console.log(`⚙️  Config: ${leverage}x leverage, ${gridCount} grids/side, ${gridSpacingPct}% spacing`);

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
  const notionalPerGrid  = (availableCapital * leverage) / (gridCount * 2);
  const qtyPerGrid       = notionalPerGrid / currentPrice;

  const precision   = await getSymbolPrecision(symbol);
  const roundedQty  = await roundQuantity(symbol, qtyPerGrid);

  console.log(`💰 Capital: $${availableCapital.toFixed(2)} × ${leverage}x | Notional/grid: $${notionalPerGrid.toFixed(2)}`);
  console.log(`📦 Qty/grid: ${roundedQty} ${symbol.replace('USDT', '')} (~$${(roundedQty * currentPrice).toFixed(2)})`);

  if (roundedQty < precision.minQty) {
    throw new Error(
      `V7 Grid qty ${roundedQty} is below Binance minimum ${precision.minQty}. ` +
      `Need more capital or fewer grid levels.`
    );
  }

  // 4. Set leverage & margin type
  await setMarginType(symbol, 'ISOLATED');
  await setLeverage(symbol, leverage);

  // 5. Build grid levels
  const levels: GridLevel[] = [];
  const spacing = currentPrice * (gridSpacingPct / 100);

  // BUY levels below current price
  for (let i = gridCount; i >= 1; i--) {
    const price = await roundPrice(symbol, currentPrice - spacing * i);
    levels.push({ index: gridCount - i, price, side: 'BUY', status: 'EMPTY' });
  }
  // SELL levels above current price
  for (let i = 1; i <= gridCount; i++) {
    const price = await roundPrice(symbol, currentPrice + spacing * i);
    levels.push({ index: gridCount + i - 1, price, side: 'SELL', status: 'EMPTY' });
  }

  const state: GridStateV7 = {
    symbol, isActive: true, leverage, gridCount, gridSpacingPct,
    basePrice: currentPrice, upperBound, lowerBound,
    qtyPerGrid: roundedQty, levels,
    totalProfit: 0, totalFills: 0, expandCount: 0,
    createdAt: new Date().toISOString(),
    lastCycleAt: new Date().toISOString()
  };

  // 6. Cancel any existing orders
  try { await cancelAllOrders(symbol); } catch (_) {}
  await sleep(500);

  // 7. Place initial orders
  await placeGridOrdersV7(state);

  // 8. Save state
  await saveGridStateV7(state);

  console.log(`✅ [GRID V7] Initialized: ${levels.length} levels, ${gridSpacingPct}% spacing, ${leverage}x leverage`);

  await sendTelegramAlert({
    type: 'RAW_MESSAGE',
    data: {
      text: `🔷 GRID V7 STARTED\n━━━━━━━━━━━━━━\n📊 ${symbol} @ $${currentPrice.toFixed(2)}\n📏 Range: $${lowerBound.toFixed(2)} — $${upperBound.toFixed(2)}\n📦 ${levels.length} levels (${gridSpacingPct}% spacing)\n⚡ Leverage: ${leverage}x\n💰 Per grid: ~$${(roundedQty * currentPrice).toFixed(2)}\n━━━━━━━━━━━━━━\n🔷 V7: Soft Expand mode — NO auto-close`
    }
  } as any);

  return state;
}

// ─────────────────────────────────────────────────────────────
// PLACE GRID ORDERS (only EMPTY levels)
// ─────────────────────────────────────────────────────────────

async function placeGridOrdersV7(state: GridStateV7): Promise<void> {
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
      console.warn(`⚠️ [V7] Failed to place ${level.side} @ ${level.price}: ${err.message}`);
    }
  }

  console.log(`🔷 [V7] Placed ${placed} limit orders`);
}

// ─────────────────────────────────────────────────────────────
// SOFT EXPAND — Price escaped range, extend grid outward
// NEVER closes existing positions or cancels existing orders
// ─────────────────────────────────────────────────────────────

async function softExpandGrid(state: GridStateV7, currentPrice: number): Promise<void> {
  const { symbol } = state;
  // Use basePrice for consistent spacing calculation
  const spacing = state.basePrice * (state.gridSpacingPct / 100);
  const newLevels: GridLevel[] = [];

  if (currentPrice > state.upperBound) {
    // ── Price broke above grid ── add SELL levels above ──
    console.log(`📈 [V7] Price $${currentPrice} > upper $${state.upperBound.toFixed(2)} — Soft Expand UP`);
    for (let i = 1; i <= EXPAND_LEVELS; i++) {
      const price = await roundPrice(symbol, state.upperBound + spacing * i);
      newLevels.push({
        index: state.levels.length + i,
        price,
        side: 'SELL',
        status: 'EMPTY'
      });
    }
    state.upperBound += spacing * EXPAND_LEVELS;
    state.levels.push(...newLevels);

  } else if (currentPrice < state.lowerBound) {
    // ── Price broke below grid ── add BUY levels below ──
    console.log(`📉 [V7] Price $${currentPrice} < lower $${state.lowerBound.toFixed(2)} — Soft Expand DOWN`);
    for (let i = EXPAND_LEVELS; i >= 1; i--) {
      const price = await roundPrice(symbol, state.lowerBound - spacing * i);
      newLevels.unshift({
        index: -(state.expandCount * EXPAND_LEVELS + i),
        price,
        side: 'BUY',
        status: 'EMPTY'
      });
    }
    state.lowerBound -= spacing * EXPAND_LEVELS;
    state.levels.unshift(...newLevels);
  }

  state.expandCount = (state.expandCount || 0) + 1;

  // Place orders for new EMPTY levels only (existing orders untouched)
  for (const level of newLevels) {
    try {
      const order = await placeOrder({
        symbol,
        side: level.side,
        type: 'LIMIT',
        quantity: state.qtyPerGrid,
        price: level.price,
        timeInForce: 'GTC'
      });
      level.status = 'ORDER_PLACED';
      level.orderId = order.orderId;
      await sleep(100);
    } catch (err: any) {
      console.warn(`⚠️ [V7] Soft Expand order failed @ ${level.price}: ${err.message}`);
    }
  }

  console.log(`✅ [V7] Soft Expand #${state.expandCount}: Added ${newLevels.length} levels. New range: $${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}`);

  // Alert user if expand count reaches limit
  if (state.expandCount >= MAX_EXPAND_COUNT) {
    await sendTelegramAlert({
      type: 'RAW_MESSAGE',
      data: {
        text: `⚠️ V7 GRID EXPAND #${state.expandCount}\n━━━━━━━━━━━━━━\n📊 ${symbol} @ $${currentPrice.toFixed(2)}\n📏 New range: $${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}\n🔁 Grid has expanded ${state.expandCount}× — consider manual review\n💡 Bot continues running — posisi existing TIDAK ditutup`
      }
    } as any);
  } else {
    await sendTelegramAlert({
      type: 'RAW_MESSAGE',
      data: {
        text: `📐 V7 Soft Expand #${state.expandCount}\n${symbol} @ $${currentPrice.toFixed(2)}\nNew range: $${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}\n+${newLevels.length} new levels added`
      }
    } as any);
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN V7 GRID CYCLE — Called every 30 seconds
// ─────────────────────────────────────────────────────────────

export async function runGridCycleV7(): Promise<void> {
  const state = await loadGridStateV7();
  if (!state || !state.isActive) return;
  state.levels = state.levels || [];

  // Concurrency lock (prevent duplicate runs on hot reload)
  const nowStr = Date.now().toString();
  const lock = await prisma.appSettings.findUnique({ where: { key: 'grid_v7_cycle_lock' } });
  if (lock && Date.now() - parseInt(lock.value) < 15000) return;
  await prisma.appSettings.upsert({
    where:  { key: 'grid_v7_cycle_lock' },
    update: { value: nowStr },
    create: { key: 'grid_v7_cycle_lock', value: nowStr }
  });

  // ── NO circuit breaker check in V7 ──

  const { symbol } = state;

  try {
    // 1. Get open orders from Binance
    const openOrders   = await getOpenOrders(symbol);
    const openOrderIds = new Set(openOrders.map((o: any) => o.orderId));

    // 2. Current price
    const priceData    = await getMarkPrice(symbol);
    const currentPrice = priceData.markPrice;

    let stateChanged = false;
    const spacing    = state.basePrice * (state.gridSpacingPct / 100);

    // 3. Check each level for fills
    for (const level of state.levels) {

      // ── Check if limit order was filled ──
      if (level.status === 'ORDER_PLACED' && level.orderId) {
        if (!openOrderIds.has(level.orderId)) {
          level.status    = 'FILLED';
          level.fillPrice = level.price;
          stateChanged    = true;

          console.log(`✅ [V7] ${level.side} FILLED @ $${level.price}`);

          // Place counter-order (take profit — reduce only)
          const counterSide  = level.side === 'BUY' ? 'SELL' : 'BUY';
          const counterPrice = level.side === 'BUY'
            ? await roundPrice(symbol, level.price + spacing)
            : await roundPrice(symbol, level.price - spacing);

          try {
            const counterOrder = await placeOrder({
              symbol,
              side: counterSide,
              type: 'LIMIT',
              quantity: state.qtyPerGrid,
              price: counterPrice,
              timeInForce: 'GTC',
              reduceOnly: true
            });
            level.counterOrderId = counterOrder.orderId;
            console.log(`📤 [V7] Counter ${counterSide} placed @ $${counterPrice}`);
          } catch (err: any) {
            console.warn(`⚠️ [V7] Counter order failed: ${err.message}`);
            // Fallback: market close
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
          const gridProfit = state.qtyPerGrid * spacing;
          level.profit      = gridProfit;
          state.totalProfit += gridProfit;
          state.totalFills++;
          stateChanged = true;

          console.log(`🎯 [V7] Cycle #${state.totalFills} complete! +$${gridProfit.toFixed(4)} (Total: $${state.totalProfit.toFixed(2)})`);

          await sendTelegramAlert({
            type: 'RAW_MESSAGE',
            data: {
              text: `🔷 V7 FILL #${state.totalFills}\n━━━━━━━━━━━\n${level.side === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${symbol} @ $${level.price}\n→ TP @ ~$${counterPrice.toFixed ? counterPrice : (level.price + (level.side === 'BUY' ? spacing : -spacing)).toFixed(2)}\n💰 +$${gridProfit.toFixed(4)}\n📊 Session: $${state.totalProfit.toFixed(2)} (${state.totalFills} fills)`
            }
          } as any);

          // Record trade in DB
          try {
            const portfolio = await prisma.portfolio.findFirst();
            await prisma.trade.create({
              data: {
                portfolioId: portfolio!.id,
                marketType:  'FUTURES',
                symbol,
                direction:   level.side === 'BUY' ? 'LONG' : 'SHORT',
                entryPrice:  level.price,
                exitPrice:   level.price + (level.side === 'BUY' ? spacing : -spacing),
                quantity:    state.qtyPerGrid,
                leverage:    state.leverage,
                stopLoss:    0,
                takeProfit:  0,
                status:      'CLOSED',
                engineVersion: 'v7',
                pnl:         gridProfit,
                entryAt:     new Date(),
                exitAt:      new Date()
              }
            });
          } catch (e: any) {
            console.warn(`[V7] Failed to record trade: ${e.message}`);
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

    // 4. Re-place EMPTY levels (orders that were never placed or reset after cycle)
    const emptyLevels = state.levels.filter(l => l.status === 'EMPTY');
    for (const level of emptyLevels) {
      // Skip levels that are too far from current price
      const distPct = Math.abs((currentPrice - level.price) / currentPrice) * 100;
      if (distPct > state.gridSpacingPct * (state.gridCount + EXPAND_LEVELS * MAX_EXPAND_COUNT) * 1.5) continue;

      try {
        const order = await placeOrder({
          symbol,
          side: level.side,
          type: 'LIMIT',
          quantity: state.qtyPerGrid,
          price: level.price,
          timeInForce: 'GTC'
        });
        level.status  = 'ORDER_PLACED';
        level.orderId = order.orderId;
        stateChanged  = true;
        await sleep(100);
      } catch (_) {}
    }

    // 5. Soft Expand if price escaped grid range
    const escapePct = ESCAPE_THRESHOLD / 100;
    if (
      currentPrice > state.upperBound * (1 + escapePct) ||
      currentPrice < state.lowerBound * (1 - escapePct)
    ) {
      await softExpandGrid(state, currentPrice);
      stateChanged = true;
    }

    // 6. Save state if anything changed
    if (stateChanged) await saveGridStateV7(state);

  } catch (err: any) {
    console.error(`❌ [V7] Cycle error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// STOP GRID V7 — Manual stop only
// ─────────────────────────────────────────────────────────────

export async function stopGridV7(): Promise<{ totalProfit: number; totalFills: number }> {
  const state = await loadGridStateV7();
  if (!state) return { totalProfit: 0, totalFills: 0 };

  console.log(`🛑 [V7] Stopping grid for ${state.symbol}…`);

  // Cancel all orders
  try { await cancelAllOrders(state.symbol); } catch (_) {}
  await sleep(500);

  // Close any open positions
  const positions = await getPositions();
  const pos = positions.find((p: any) => p.symbol === state.symbol);
  if (pos && pos.positionAmt !== 0) {
    const closeSide = pos.positionAmt > 0 ? 'SELL' : 'BUY';
    try {
      await placeOrder({
        symbol:    state.symbol,
        side:      closeSide,
        type:      'MARKET',
        quantity:  Math.abs(pos.positionAmt),
        reduceOnly: true
      });

      // Record in DB
      try {
        const portfolio = await prisma.portfolio.findFirst();
        await prisma.trade.create({
          data: {
            portfolioId:   portfolio?.id || 1,
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
            engineVersion: 'v7',
            pnl:           pos.unRealizedProfit || 0,
            entryAt:       new Date(state.createdAt),
            exitAt:        new Date()
          }
        });
      } catch (_) {}
    } catch (e: any) {
      console.warn(`[V7] Failed to close position: ${e.message}`);
    }
  }

  state.isActive = false;
  await saveGridStateV7(state);

  const result = { totalProfit: state.totalProfit, totalFills: state.totalFills };

  await sendTelegramAlert({
    type: 'RAW_MESSAGE',
    data: {
      text: `🛑 GRID V7 STOPPED\n━━━━━━━━━━━━━━\n📊 ${state.symbol}\n💰 Total profit: $${state.totalProfit.toFixed(2)}\n📈 Total fills: ${state.totalFills}\n🔁 Expands: ${state.expandCount}×\n⏱️ Runtime: ${getRuntime(state.createdAt)}`
    }
  } as any);

  return result;
}

// ─────────────────────────────────────────────────────────────
// STATUS — For UI
// ─────────────────────────────────────────────────────────────

export async function getGridStatusV7(): Promise<any> {
  const state = await loadGridStateV7();
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
