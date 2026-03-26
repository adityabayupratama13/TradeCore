const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); 
  
  const signals = await p.tradeSignalHistory.findMany({
    where: { 
      createdAt: { gte: cutoff },
      confidence: { gte: 55 }
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log('--- HIGH CONFIDENCE SIGNALS (>= 55) ---');
  signals.forEach(s => {
    console.log(`[${s.createdAt.toISOString()}] ${s.symbol} | ${s.action} | conf: ${s.confidence} | exec: ${s.wasExecuted}`);
  });

  await p.$disconnect();
}
run();
