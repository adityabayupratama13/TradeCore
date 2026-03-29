// ═══════════════════════════════════════════════════════════════
// V6 SMART GRID BOT ENGINE
// Profits from volatility — no AI, no direction prediction
// Places limit orders at grid levels, collects profit on fills
// ═══════════════════════════════════════════════════════════════

import { prisma } from '../../lib/prisma';
import {
  getMarkPrice, placeOrder, cancelAllOrders, getOpenOrders,
  setLeverage, setMarginType, getSymbolPrecision, roundPrice,
  roundQuantity, getBalance, getPositions
} from './binance';
import { sendTelegramAlert } from './telegram';
import { checkAndEnforceCircuitBreaker } from './circuitBreaker';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface GridLevel {
  index: number;          // Grid level index (0 = lowest)
  price: number;          // Price at this level
  side: 'BUY' | 'SELL';  // What order to place here
  status: 'EMPTY' | 'ORDER_PLACED' | 'FILLED';
  orderId?: number;       // Binance order ID
  counterOrderId?: number; // Counter order ID (take-profit)
  fillPrice?: number;     // Actual fill price
  profit?: number;        // Profit from completed cycle
}

interface GridState {
  symbol: string;
  isActive: boolean;
  leverage: number;
  gridCount: number;       // levels per side
  gridSpacingPct: number;  // spacing between levels (e.g. 0.3)
  basePrice: number;       // center price when grid was created
  upperBound: number;      // highest grid level price
  lowerBound: number;      // lowest grid level price
  qtyPerGrid: number;      // quantity per grid level
  levels: GridLevel[];
  totalProfit: number;
  totalFills: number;
  createdAt: string;
  lastCycleAt: string;
}

interface GridConfig {
  symbol: string;
  leverage: number;
  gridCount: number;       // levels per side (default 8)
  gridSpacingPct: number;  // % between levels (default 0.3)
  capitalPct: number;      // % of balance to use (default 80)
}

const GRID_STATE_KEY = 'grid_v6_state';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// LOAD / SAVE GRID STATE
// ─────────────────────────────────────────────────────────────

async function loadGridState(): Promise<GridState | null> {
  const setting = await prisma.appSettings.findUnique({ where: { key: GRID_STATE_KEY } });
  if (!setting?.value) return null;
  try {
    return JSON.parse(setting.value);
  } catch {
    return null;
  }
}

async function saveGridState(state: GridState): Promise<void> {
  state.lastCycleAt = new Date().toISOString();
  await prisma.appSettings.upsert({
    where: { key: GRID_STATE_KEY },
    update: { value: JSON.stringify(state) },
    create: { key: GRID_STATE_KEY, value: JSON.stringify(state) }
  });
}

// ─────────────────────────────────────────────────────────────
// INITIALIZE GRID
// ─────────────────────────────────────────────────────────────

export async function initializeGrid(config: GridConfig): Promise<GridState> {
  const { symbol, leverage, gridCount, gridSpacingPct, capitalPct } = config;

  console.log(`\n🔲 [GRID V6] Initializing grid for ${symbol}...`);

  // 1. Get current price
  const priceData = await getMarkPrice(symbol);
  const currentPrice = priceData.markPrice;
  console.log(`📊 Current price: $${currentPrice}`);

  // 2. Calculate grid boundaries
  const totalRange = gridCount * gridSpacingPct; // total % range per side
  const upperBound = currentPrice * (1 + totalRange / 100);
  const lowerBound = currentPrice * (1 - totalRange / 100);
  console.log(`📏 Grid range: $${lowerBound.toFixed(2)} — $${upperBound.toFixed(2)} (±${totalRange.toFixed(1)}%)`);

  // 3. Calculate quantity per grid level
  const balances = await getBalance();
  const usdtBalance = balances.find(b => b.asset === 'USDT');
  const availableCapital = (usdtBalance?.availableBalance || 0) * (capitalPct / 100);
  const notionalPerGrid = (availableCapital * leverage) / (gridCount * 2);
  const qtyPerGrid = notionalPerGrid / currentPrice;

  const precision = await getSymbolPrecision(symbol);
  const roundedQty = await roundQuantity(symbol, qtyPerGrid);

  console.log(`💰 Capital: $${availableCapital.toFixed(2)} × ${leverage}x = $${(availableCapital * leverage).toFixed(2)} notional`);
  console.log(`📦 Per grid: ${roundedQty} ${symbol.replace('USDT', '')} (~$${(roundedQty * currentPrice).toFixed(2)})`);

  if (roundedQty < precision.minQty) {
    throw new Error(`Grid quantity ${roundedQty} below minimum ${precision.minQty}. Need more capital or fewer grid levels.`);
  }

  // 4. Set leverage and margin type
  await setMarginType(symbol, 'ISOLATED');
  await setLeverage(symbol, leverage);

  // 5. Build grid levels
  const levels: GridLevel[] = [];
  const spacing = currentPrice * (gridSpacingPct / 100);

  // BUY levels below current price
  for (let i = gridCount; i >= 1; i--) {
    const price = await roundPrice(symbol, currentPrice - (spacing * i));
    levels.push({
      index: gridCount - i,
      price,
      side: 'BUY',
      status: 'EMPTY'
    });
  }

  // SELL levels above current price
  for (let i = 1; i <= gridCount; i++) {
    const price = await roundPrice(symbol, currentPrice + (spacing * i));
    levels.push({
      index: gridCount + i - 1,
      price,
      side: 'SELL',
      status: 'EMPTY'
    });
  }

  const state: GridState = {
    symbol,
    isActive: true,
    leverage,
    gridCount,
    gridSpacingPct,
    basePrice: currentPrice,
    upperBound,
    lowerBound,
    qtyPerGrid: roundedQty,
    levels,
    totalProfit: 0,
    totalFills: 0,
    createdAt: new Date().toISOString(),
    lastCycleAt: new Date().toISOString()
  };

  // 6. Cancel any existing orders on this symbol
  try {
    await cancelAllOrders(symbol);
  } catch (_) {}
  await sleep(500);

  // 7. Place initial grid orders
  await placeGridOrders(state);

  // 8. Save state
  await saveGridState(state);

  console.log(`✅ [GRID V6] Grid initialized: ${levels.length} levels, spacing ${gridSpacingPct}%`);

  await sendTelegramAlert({
    type: 'RAW_MESSAGE',
    data: {
      text: `🔲 GRID V6 STARTED\n━━━━━━━━━━━━━━\n📊 ${symbol} @ $${currentPrice.toFixed(2)}\n📏 Range: $${lowerBound.toFixed(2)} — $${upperBound.toFixed(2)}\n📦 ${levels.length} grid levels (${gridSpacingPct}% spacing)\n⚡ Leverage: ${leverage}x\n💰 Per grid: ~$${(roundedQty * currentPrice).toFixed(2)}\n━━━━━━━━━━━━━━\n🤖 Auto-trading volatility...`
    }
  } as any);

  return state;
}

// ─────────────────────────────────────────────────────────────
// PLACE GRID ORDERS
// ─────────────────────────────────────────────────────────────

async function placeGridOrders(state: GridState): Promise<void> {
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
      await sleep(100); // Avoid rate limits
    } catch (err: any) {
      console.warn(`⚠️ [GRID] Failed to place ${level.side} @ ${level.price}: ${err.message}`);
    }
  }

  console.log(`🔲 [GRID] Placed ${placed} limit orders`);
}

// ─────────────────────────────────────────────────────────────
// MAIN GRID CYCLE — Called every 30 seconds
// ─────────────────────────────────────────────────────────────

export async function runGridCycle(): Promise<void> {
  const state = await loadGridState();
  if (!state || !state.isActive) return;
  state.levels = state.levels || [];

  // 0. Mutual Exclusion Lock for Next.js Hot Reloads
  const nowStr = Date.now().toString();
  const lock = await prisma.appSettings.findUnique({ where: { key: 'grid_cycle_lock' } });
  if (lock && Date.now() - parseInt(lock.value) < 15000) {
    // Another concurrent loop (from hot-reload duplication) is running within the last 15s
    return;
  }
  await prisma.appSettings.upsert({
    where: { key: 'grid_cycle_lock' },
    update: { value: nowStr },
    create: { key: 'grid_cycle_lock', value: nowStr }
  });

  // 1. Check circuit breaker
  const { isLocked } = await checkAndEnforceCircuitBreaker();
  if (isLocked) {
    console.log('🔒 [GRID] Circuit breaker locked. Skipping cycle.');
    return;
  }

  const { symbol } = state;

  try {
    // 2. Get current open orders from Binance
    const openOrders = await getOpenOrders(symbol);
    const openOrderIds = new Set(openOrders.map((o: any) => o.orderId));

    // 3. Get current price
    const priceData = await getMarkPrice(symbol);
    const currentPrice = priceData.markPrice;

    // 4. Check each grid level for fills
    let stateChanged = false;
    const spacing = state.basePrice * (state.gridSpacingPct / 100);

    for (const level of state.levels) {
      if (level.status === 'ORDER_PLACED' && level.orderId) {
        // Check if this order is still open
        if (!openOrderIds.has(level.orderId)) {
          // Order is no longer open → it was FILLED!
          level.status = 'FILLED';
          level.fillPrice = level.price;
          stateChanged = true;

          console.log(`✅ [GRID] ${level.side} FILLED @ $${level.price}`);

          // Place counter-order (take profit)
          const counterSide = level.side === 'BUY' ? 'SELL' : 'BUY';
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
            console.log(`📤 [GRID] Counter ${counterSide} placed @ $${counterPrice}`);
          } catch (err: any) {
            console.warn(`⚠️ [GRID] Counter order failed: ${err.message}`);
            // Still try to close via market if limit fails
            try {
              await placeOrder({
                symbol,
                side: counterSide,
                type: 'MARKET',
                quantity: state.qtyPerGrid,
                reduceOnly: true
              });
            } catch (_) {}
          }

          await sleep(200);
        }
      }

      // Check if counter-order was filled (cycle complete!)
      if (level.status === 'FILLED' && level.counterOrderId) {
        if (!openOrderIds.has(level.counterOrderId)) {
          // Counter order filled — CYCLE COMPLETE
          const gridProfit = state.qtyPerGrid * spacing;
          level.profit = gridProfit;
          state.totalProfit += gridProfit;
          state.totalFills++;
          stateChanged = true;

          console.log(`🎯 [GRID] Cycle complete! Profit: +$${gridProfit.toFixed(4)} (Total: $${state.totalProfit.toFixed(2)}, ${state.totalFills} fills)`);

          // Send telegram notification
          await sendTelegramAlert({
            type: 'RAW_MESSAGE',
            data: {
              text: `🔲 GRID FILL #${state.totalFills}\n━━━━━━━━━━━\n${level.side === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${symbol} @ $${level.price}\n→ Counter filled @ ~$${(level.price + (level.side === 'BUY' ? spacing : -spacing)).toFixed(2)}\n💰 +$${gridProfit.toFixed(4)}\n📊 Session: $${state.totalProfit.toFixed(2)} (${state.totalFills} fills)`
            }
          } as any);

          // Record trade in database
          try {
            const portfolio = await prisma.portfolio.findFirst();
            const markData = await getMarkPrice(symbol);
            await prisma.trade.create({
              data: {
                portfolioId: portfolio!.id,
                marketType: 'FUTURES',
                symbol,
                direction: level.side === 'BUY' ? 'LONG' : 'SHORT',
                entryPrice: level.price,
                exitPrice: level.price + (level.side === 'BUY' ? spacing : -spacing),
                quantity: state.qtyPerGrid,
                leverage: state.leverage,
                stopLoss: 0,
                takeProfit: 0,
                status: 'CLOSED',
                engineVersion: 'v6',
                pnl: gridProfit,
                entryAt: new Date(),
                exitAt: new Date(),
              }
            });
          } catch (e: any) {
            console.warn(`[GRID] Failed to record trade: ${e.message}`);
          }

          // Reset level for next cycle
          level.status = 'EMPTY';
          level.orderId = undefined;
          level.counterOrderId = undefined;
          level.fillPrice = undefined;
          level.profit = undefined;
        }
      }
    }

    // 5. Re-place empty grid levels
    const emptyLevels = state.levels.filter(l => l.status === 'EMPTY');
    if (emptyLevels.length > 0) {
      for (const level of emptyLevels) {
        // Only place if price is reasonable distance from level
        const distPct = Math.abs((currentPrice - level.price) / currentPrice) * 100;
        if (distPct > state.gridSpacingPct * state.gridCount * 1.5) continue; // Too far, skip

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
          stateChanged = true;
          await sleep(100);
        } catch (_) {}
      }
    }

    // 6. Range breaker detection — re-center grid if price escaped
    const escapePct = 2; // if price moves 2% beyond grid edge, re-center
    if (currentPrice > state.upperBound * (1 + escapePct / 100) ||
        currentPrice < state.lowerBound * (1 - escapePct / 100)) {
      console.log(`🔄 [GRID] Price escaped range! Re-centering grid...`);
      await recenterGrid(state, currentPrice);
      stateChanged = true;
    }

    // 7. Save state if changed
    if (stateChanged) {
      await saveGridState(state);
    }

  } catch (err: any) {
    console.error(`❌ [GRID] Cycle error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// RE-CENTER GRID — When price escapes the range
// ─────────────────────────────────────────────────────────────

async function recenterGrid(state: GridState, currentPrice: number): Promise<void> {
  const { symbol, gridCount, gridSpacingPct, qtyPerGrid } = state;

  // Cancel all existing orders
  try {
    await cancelAllOrders(symbol);
  } catch (_) {}
  await sleep(500);

  // Close any open positions (net out)
  const positions = await getPositions();
  const pos = positions.find(p => p.symbol === symbol);
  if (pos && pos.positionAmt !== 0) {
    const closeSide = pos.positionAmt > 0 ? 'SELL' : 'BUY';
    try {
      await placeOrder({
        symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: Math.abs(pos.positionAmt),
        reduceOnly: true
      });
      console.log(`📤 [GRID] Closed position: ${pos.positionAmt} ${symbol}`);

      // Record this emergency close to trigger CircuitBreaker limits!
      try {
        const portfolio = await prisma.portfolio.findFirst();
        await prisma.trade.create({
          data: {
            portfolioId: portfolio!.id,
            marketType: 'FUTURES',
            symbol,
            direction: closeSide === 'BUY' ? 'SHORT' : 'LONG', // Originally short if we buy to close
            entryPrice: pos.entryPrice,
            exitPrice: currentPrice,
            quantity: Math.abs(pos.positionAmt),
            leverage: pos.leverage || state.leverage,
            stopLoss: 0,
            takeProfit: 0,
            status: 'CLOSED',
            engineVersion: 'v6',
            pnl: pos.unRealizedProfit || 0,
            entryAt: new Date(state.createdAt),
            exitAt: new Date(),
          }
        });
        console.log(`📉 [GRID] Recorded Re-center PNL: $${pos.unRealizedProfit}`);
      } catch(e: any) {
        console.warn(`[GRID] DB Trade Record failed: ${e.message}`);
      }
    } catch (e: any) {
      console.warn(`[GRID] Failed to close position: ${e.message}`);
    }
    await sleep(500);
  }

  // Recalculate grid levels
  const spacing = currentPrice * (gridSpacingPct / 100);
  const totalRange = gridCount * gridSpacingPct;
  state.basePrice = currentPrice;
  state.upperBound = currentPrice * (1 + totalRange / 100);
  state.lowerBound = currentPrice * (1 - totalRange / 100);
  state.levels = [];

  for (let i = gridCount; i >= 1; i--) {
    const price = await roundPrice(symbol, currentPrice - (spacing * i));
    state.levels.push({
      index: gridCount - i,
      price,
      side: 'BUY',
      status: 'EMPTY'
    });
  }

  for (let i = 1; i <= gridCount; i++) {
    const price = await roundPrice(symbol, currentPrice + (spacing * i));
    state.levels.push({
      index: gridCount + i - 1,
      price,
      side: 'SELL',
      status: 'EMPTY'
    });
  }

  // Place new orders
  await placeGridOrders(state);

  console.log(`✅ [GRID] Re-centered at $${currentPrice.toFixed(2)}`);
  await sendTelegramAlert({
    type: 'RAW_MESSAGE',
    data: {
      text: `🔄 GRID RE-CENTERED\n━━━━━━━━━━━━━━\n📊 ${symbol} @ $${currentPrice.toFixed(2)}\n📏 New range: $${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}\n📈 Session profit so far: $${state.totalProfit.toFixed(2)} (${state.totalFills} fills)`
    }
  } as any);
}

// ─────────────────────────────────────────────────────────────
// STOP GRID
// ─────────────────────────────────────────────────────────────

export async function stopGrid(): Promise<{ totalProfit: number; totalFills: number }> {
  const state = await loadGridState();
  if (!state) return { totalProfit: 0, totalFills: 0 };

  console.log(`🛑 [GRID] Stopping grid for ${state.symbol}...`);

  // Cancel all orders
  try {
    await cancelAllOrders(state.symbol);
  } catch (_) {}
  await sleep(500);

  // Close any open positions
  const positions = await getPositions();
  const pos = positions.find(p => p.symbol === state.symbol);
  if (pos && pos.positionAmt !== 0) {
    const closeSide = pos.positionAmt > 0 ? 'SELL' : 'BUY';
    try {
      await placeOrder({
        symbol: state.symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: Math.abs(pos.positionAmt),
        reduceOnly: true
      });

      // Record this manual stop to track Session PNL!
      try {
        const portfolio = await prisma.portfolio.findFirst();
        await prisma.trade.create({
          data: {
            portfolioId: portfolio?.id || 1,
            marketType: 'FUTURES',
            symbol: state.symbol,
            direction: closeSide === 'BUY' ? 'SHORT' : 'LONG',
            entryPrice: pos.entryPrice,
            exitPrice: state.basePrice, // Approx current price
            quantity: Math.abs(pos.positionAmt),
            leverage: pos.leverage || state.leverage,
            stopLoss: 0,
            takeProfit: 0,
            status: 'CLOSED',
            engineVersion: 'v6',
            pnl: pos.unRealizedProfit || 0,
            entryAt: new Date(state.createdAt),
            exitAt: new Date(),
          }
        });
      } catch(e) {}
    } catch (_) {}
  }

  state.isActive = false;
  await saveGridState(state);

  const result = { totalProfit: state.totalProfit, totalFills: state.totalFills };

  await sendTelegramAlert({
    type: 'RAW_MESSAGE',
    data: {
      text: `🛑 GRID V6 STOPPED\n━━━━━━━━━━━━━━\n📊 ${state.symbol}\n💰 Total profit: $${state.totalProfit.toFixed(2)}\n📈 Total fills: ${state.totalFills}\n⏱️ Runtime: ${getRuntime(state.createdAt)}`
    }
  } as any);

  return result;
}

// ─────────────────────────────────────────────────────────────
// GET GRID STATUS — For UI and Telegram
// ─────────────────────────────────────────────────────────────

export async function getGridStatus(): Promise<any> {
  const state = await loadGridState();
  if (!state) return { isActive: false };

  const activeLevels = (state.levels || []).filter(l => l.status === 'ORDER_PLACED').length;
  const filledLevels = (state.levels || []).filter(l => l.status === 'FILLED').length;

  return {
    isActive: state.isActive,
    symbol: state.symbol,
    basePrice: state.basePrice,
    upperBound: state.upperBound,
    lowerBound: state.lowerBound,
    leverage: state.leverage,
    gridCount: state.gridCount,
    gridSpacingPct: state.gridSpacingPct,
    activeLevels,
    filledLevels,
    totalLevels: (state.levels || []).length,
    totalProfit: state.totalProfit || 0,
    totalFills: state.totalFills || 0,
    runtime: getRuntime(state.createdAt),
    lastCycleAt: state.lastCycleAt
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getRuntime(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}
