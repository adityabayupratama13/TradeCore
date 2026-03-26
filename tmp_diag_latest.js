const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); 
  
  const signals = await p.tradeSignalHistory.findMany({
    where: { 
      createdAt: { gte: cutoff }
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log('--- SIGNALS LAST 30 MINS ---');
  signals.forEach(s => {
    console.log(`[${s.createdAt.toISOString()}] ${s.symbol} | ${s.action} | conf: ${s.confidence} | exec: ${s.wasExecuted} | reason: ${s.reasoning}`);
  });

  const logs = await p.engineLog.findMany({
    where: { 
        createdAt: { gte: cutoff },
        result: { in: ['ERROR', 'BLOCKED', 'SKIPPED', 'EXECUTED'] }
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log('\n--- ENGINE LOGS LAST 30 MINS (ERRORS/SKIPPED/EXECUTED) ---');
  logs.forEach(l => {
    console.log(`[${l.createdAt.toISOString()}] ${l.symbol} | ${l.result} | ${l.reason}`);
  });

  await p.$disconnect();
}
run();
