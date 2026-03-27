import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const trades = await prisma.trade.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15
  });

  console.log("=== RECENT TRADES ===");
  for (const t of trades) {
    console.log(`${t.createdAt.toISOString()} | ${t.symbol.padEnd(10)} | ${t.direction.padEnd(5)} | PNL: $${(t.pnl || 0).toFixed(2).padStart(8)} | PNL%: ${(t.pnlPct || 0).toFixed(2).padStart(6)}% | Engine: ${t.engineVersion} | Conf: ${t.confidence} | Entry: ${t.entryPrice} | Exit: ${t.exitPrice || 'N/A'}`);
  }

  const logs = await prisma.engineLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  console.log("\n=== RECENT LOGS ===");
  for (const l of logs) {
    if (l.result === 'EXECUTED' || l.action.includes('CLOSE') || l.action === 'PARTIAL_CLOSE' || l.result === 'ERROR' || l.action === 'CIRCUIT_BREAKER') {
      console.log(`${l.createdAt.toISOString()} | ${l.symbol} | ${l.action} | ${l.result} | ${l.reason}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
