const { runDynamicHunter } = require('./src/lib/pairSelector');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.log('Running Hunter in test script...');
  const res = await runDynamicHunter();
  console.log('\nFinal Active Pairs:', res.activePairs.map(p => p.symbol).join(', '));
  await prisma.$disconnect();
}
test().catch(console.error);
