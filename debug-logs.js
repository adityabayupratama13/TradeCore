const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLogs() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const logs = await prisma.engineLog.findMany({
    where: { createdAt: { gte: startOfDay } },
    orderBy: { createdAt: 'desc' },
    take: 30
  });

  console.log('--- RECENT ENGINE LOGS TODAY ---');
  logs.forEach(l => {
    console.log(`[${l.createdAt.toISOString()}] ${l.symbol || 'SYS'} | ${l.action} | ${l.details}`);
  });

  const cbSetting = await prisma.appSettings.findUnique({ where: { key: 'circuit_breaker_active' } });
  console.log('\n--- CIRCUIT BREAKER STATUS ---');
  console.log(cbSetting);

  const engineStatus = await prisma.appSettings.findUnique({ where: { key: 'engine_status' } });
  console.log('\n--- ENGINE SETTING ---');
  console.log(engineStatus);

  await prisma.$disconnect();
}

checkLogs();
