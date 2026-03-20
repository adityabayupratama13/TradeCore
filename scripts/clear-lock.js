const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { key: 'circuit_breaker_lock_until' },
    update: { value: '' },
    create: { key: 'circuit_breaker_lock_until', value: '' }
  });

  const todayWIB = new Date();
  await prisma.dailyPerformance.updateMany({
    where: {
      date: {
        gte: new Date(todayWIB.setHours(0,0,0,0))
      }
    },
    data: {
      dailyPnl: 0,
      dailyPnlPct: 0
    }
  });

  console.log('✅ Lock cleared + daily counter reset');
}

main().catch(console.error).finally(() => prisma.$disconnect());
