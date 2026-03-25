import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

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

async function main() {
  console.log('🔍 Checking for duplicate trades...\n');

  const allTrades = await prisma.trade.findMany({
    orderBy: { entryAt: 'asc' }
  });

  console.log(`Total trades: ${allTrades.length}\n`);

  // Group by symbol + direction + entryPrice + similar entryAt (within 5 minutes)
  const duplicateGroups: Map<string, typeof allTrades> = new Map();
  
  for (const trade of allTrades) {
    const entryTime = trade.entryAt ? new Date(trade.entryAt).getTime() : 0;
    // Create a key based on symbol + direction + entry price (rounded)
    const priceKey = Math.round(trade.entryPrice * 100);
    const timeKey = Math.floor(entryTime / 300000); // 5-minute bucket
    const key = `${trade.symbol}_${trade.direction}_${priceKey}_${timeKey}`;
    
    if (!duplicateGroups.has(key)) {
      duplicateGroups.set(key, []);
    }
    duplicateGroups.get(key)!.push(trade);
  }

  // Find groups with more than 1 trade (duplicates)
  let dupCount = 0;
  const toDelete: string[] = [];

  for (const [key, trades] of duplicateGroups) {
    if (trades.length > 1) {
      dupCount++;
      console.log(`⚠️ DUPLICATE GROUP: ${key}`);
      console.log(`   Count: ${trades.length} trades`);
      
      // Keep the first one (oldest), mark rest for deletion
      const [keep, ...remove] = trades;
      
      console.log(`   ✅ KEEP:   id=${keep.id} entry=${keep.entryPrice} exit=${keep.exitPrice} pnl=$${(keep.pnl||0).toFixed(4)} at ${keep.entryAt?.toISOString()}`);
      for (const r of remove) {
        console.log(`   ❌ DELETE: id=${r.id} entry=${r.entryPrice} exit=${r.exitPrice} pnl=$${(r.pnl||0).toFixed(4)} at ${r.entryAt?.toISOString()}`);
        toDelete.push(r.id);
      }
      console.log('');
    }
  }

  if (toDelete.length === 0) {
    console.log('✅ No duplicates found!');
  } else {
    console.log(`\n🗑️ Deleting ${toDelete.length} duplicate trades...`);
    
    // Delete journals first (foreign key)
    for (const id of toDelete) {
      await prisma.tradeJournal.deleteMany({ where: { tradeId: id } }).catch(() => {});
    }
    
    // Delete the duplicate trades
    await prisma.trade.deleteMany({
      where: { id: { in: toDelete } }
    });
    
    console.log(`✅ Deleted ${toDelete.length} duplicates!`);
    
    const remaining = await prisma.trade.count();
    console.log(`📊 Remaining trades: ${remaining}`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
});
