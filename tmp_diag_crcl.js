const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function run() {
  const s = await p.tradeSignalHistory.findMany({ where: { symbol: 'CRCLUSDT' }, orderBy: { createdAt: 'desc' }, take: 1 });
  console.log('Last CRCLUSDT Signal:', s);
  
  const l = await p.engineLog.findMany({ where: { symbol: 'CRCLUSDT' }, orderBy: { createdAt: 'desc' }, take: 2 });
  console.log('Last Engine Log CRCLUSDT:', l);
  await p.$disconnect();
}
run();
