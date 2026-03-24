const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const ver = await p.appSettings.findUnique({ where: { key: 'engine_version' } });
  console.log('DB engine_version:', ver);
  
  const lastTrade = await p.trade.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log('Last trade:', lastTrade?.symbol, 'engineVersion:', lastTrade?.engineVersion, 'at:', lastTrade?.createdAt);
  
  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
