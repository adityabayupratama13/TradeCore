const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function run() {
  const l = await p.engineLog.findMany({ where: { result: 'ERROR' }, orderBy: { createdAt: 'desc' }, take: 5 });
  console.log('Recent Error Logs:', l.map(x => ({symbol: x.symbol, reason: x.reason, time: x.createdAt})));
  await p.$disconnect();
}
run();
