/**
 * 🔄 SYNC PNL WITH BINANCE
 * 
 * Fetch actual trade data dari Binance dan update
 * semua closed trades di database agar PNL, exit price,
 * dan ROI akurat sesuai Binance.
 */

import { PrismaClient } from '@prisma/client';
import CryptoJS from 'crypto-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually (tsx doesn't support -r dotenv/config)
function loadEnvFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

loadEnvFile(path.join(__dirname, '.env.local'));
loadEnvFile(path.join(__dirname, '.env'));

const prisma = new PrismaClient();

function getApiKey() { return process.env.BINANCE_API_KEY || ''; }
function getSecret() { return process.env.BINANCE_SECRET_KEY || ''; }
function getBaseUrl() { return process.env.BINANCE_BASE_URL || ''; }

function sign(queryString: string): string {
  return CryptoJS.HmacSHA256(queryString, getSecret()).toString(CryptoJS.enc.Hex);
}

async function fetchBinance(endpoint: string, params: Record<string, string> = {}) {
  const timestamp = Date.now();
  const qs = new URLSearchParams({ ...params, timestamp: String(timestamp) }).toString();
  const signature = sign(qs);
  const url = `${getBaseUrl()}${endpoint}?${qs}&signature=${signature}`;
  
  const res = await fetch(url, {
    headers: { 'X-MBX-APIKEY': getApiKey() },
    cache: 'no-store'
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Binance API: ${err.msg || res.statusText}`);
  }
  return res.json();
}

async function getUserTrades(symbol: string, startTime?: number) {
  const params: Record<string, string> = { symbol, limit: '100' };
  if (startTime) params.startTime = String(startTime);
  
  const res = await fetchBinance('/fapi/v1/userTrades', params);
  return res.map((t: any) => ({
    symbol: t.symbol,
    id: t.id,
    orderId: t.orderId,
    side: t.side,
    price: parseFloat(t.price),
    qty: parseFloat(t.qty),
    realizedPnl: parseFloat(t.realizedPnl),
    commission: parseFloat(t.commission),
    commissionAsset: t.commissionAsset,
    time: t.time,
    buyer: t.buyer,
    maker: t.maker,
  }));
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  🔄 SYNC PNL WITH BINANCE ACTUAL DATA');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  
  if (!getApiKey() || !getBaseUrl()) {
    console.error('❌ Missing BINANCE_API_KEY or BINANCE_BASE_URL in .env');
    return;
  }

  const closedTrades = await prisma.trade.findMany({
    where: { status: 'CLOSED' },
    orderBy: { entryAt: 'asc' }
  });

  console.log(`  Found ${closedTrades.length} closed trades to sync\n`);

  let updated = 0;
  let failed = 0;

  for (const trade of closedTrades) {
    try {
      const entryTime = trade.entryAt ? new Date(trade.entryAt).getTime() : 0;
      
      // Fetch userTrades from Binance starting from entry time
      const userTrades = await getUserTrades(trade.symbol, entryTime > 0 ? entryTime - 60000 : undefined);
      
      if (userTrades.length === 0) {
        console.log(`  ⏭️ ${trade.symbol} (${trade.entryAt?.toISOString().slice(0,16)}): No Binance trades found`);
        failed++;
        continue;
      }

      // Find the entry trade(s) — same direction as our trade, around entry time
      const isLong = trade.direction === 'LONG' || trade.direction === 'BUY';
      const entrySide = isLong ? 'BUY' : 'SELL';
      const closeSide = isLong ? 'SELL' : 'BUY';
      
      // Find entry fills (within 2 min of our entry time)
      const entryFills = userTrades.filter((t: any) => 
        t.side === entrySide && 
        Math.abs(t.time - entryTime) < 120000 // within 2 minutes
      );
      
      // Find close fills — same symbol, opposite side, after entry
      const closeFills = userTrades.filter((t: any) => 
        t.side === closeSide && 
        t.time > entryTime
      );

      // If there are multiple trades for same symbol on same day, 
      // we need to match by quantity and time more carefully
      // For now, group close fills that match the trade's quantity roughly
      
      if (closeFills.length === 0) {
        console.log(`  ⏭️ ${trade.symbol} (${trade.entryAt?.toISOString().slice(0,16)}): No close fills found`);
        failed++;
        continue;
      }

      // Calculate VWAP entry and exit
      let actualEntryPrice = trade.entryPrice;
      if (entryFills.length > 0) {
        let totalQty = 0, totalVal = 0;
        for (const ef of entryFills) {
          totalQty += ef.qty;
          totalVal += ef.price * ef.qty;
        }
        if (totalQty > 0) actualEntryPrice = totalVal / totalQty;
      }

      // Match close fills by accumulating qty until we reach trade quantity
      let closeQtyAcc = 0;
      let closeTotalVal = 0;
      let totalRealizedPnl = 0;
      let totalCommission = 0;
      const matchedCloseFills: any[] = [];

      for (const cf of closeFills) {
        if (closeQtyAcc >= trade.quantity * 0.95) break; // Got enough fills
        matchedCloseFills.push(cf);
        closeQtyAcc += cf.qty;
        closeTotalVal += cf.price * cf.qty;
        totalRealizedPnl += cf.realizedPnl;
        totalCommission += cf.commission;
      }

      const actualExitPrice = closeQtyAcc > 0 ? closeTotalVal / closeQtyAcc : trade.exitPrice || trade.entryPrice;
      const netPnl = totalRealizedPnl - totalCommission;
      const pnlPct = ((actualExitPrice - actualEntryPrice) / actualEntryPrice) * 100 * (isLong ? 1 : -1) * trade.leverage;

      // Show comparison
      const oldPnl = trade.pnl || 0;
      const oldExit = trade.exitPrice || 0;
      const pnlDiff = netPnl - oldPnl;

      console.log(`  📊 ${trade.symbol} ${trade.direction} ${trade.leverage}x`);
      console.log(`     Entry: ${trade.entryPrice} → ${actualEntryPrice.toFixed(6)} (Binance)`);
      console.log(`     Exit:  ${oldExit} → ${actualExitPrice.toFixed(6)} (Binance)`);
      console.log(`     PNL:   $${oldPnl.toFixed(4)} → $${netPnl.toFixed(4)} (diff: ${pnlDiff > 0 ? '+' : ''}$${pnlDiff.toFixed(4)})`);
      console.log(`     ROI:   ${(trade.pnlPct || 0).toFixed(2)}% → ${pnlPct.toFixed(2)}%`);
      console.log(`     Fee:   $${totalCommission.toFixed(4)}`);
      console.log('');

      // Update DB
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          entryPrice: actualEntryPrice,
          exitPrice: actualExitPrice,
          pnl: netPnl,
          pnlPct: pnlPct,
        }
      });

      updated++;
      
      // Rate limit — don't spam Binance API
      await new Promise(r => setTimeout(r, 300));
      
    } catch (err: any) {
      console.log(`  ❌ ${trade.symbol}: ${err.message}`);
      failed++;
    }
  }

  console.log('═══════════════════════════════════════════════');
  console.log(`  ✅ Updated: ${updated} trades`);
  console.log(`  ⏭️ Skipped: ${failed} trades`);
  console.log('═══════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Fatal:', e);
  prisma.$disconnect();
});
