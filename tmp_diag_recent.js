const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000); // last 3 hours
  
  const signals = await p.tradeSignalHistory.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  console.log('--- RECENT SIGNALS ---');
  signals.forEach(s => {
    console.log(`[${s.createdAt.toISOString()}] ${s.symbol} | ${s.action} | conf: ${s.confidence} | exec: ${s.wasExecuted}`);
  });

  const logs = await p.engineLog.findMany({
    where: { createdAt: { gte: cutoff }, result: { in: ['ERROR', 'BLOCKED', 'SKIPPED'] } },
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  console.log('\n--- RECENT BLOCKS/ERRORS ---');
  logs.forEach(l => {
    console.log(`[${l.createdAt.toISOString()}] ${l.symbol} | ${l.result} | ${l.reason}`);
  });

  const allLogs = await p.engineLog.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  console.log('\n--- LATEST ENGINE LOGS ---');
  allLogs.forEach(l => {
    console.log(`[${l.createdAt.toISOString()}] ${l.symbol} | ${l.action} -> ${l.result} | ${l.reason}`);
  });

  await p.$disconnect();
}
run();
