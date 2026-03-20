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

  await prisma.appSettings.upsert({
    where: { key: 'daily_loss_pct' },
    update: { value: '0' },
    create: { key: 'daily_loss_pct', value: '0' }
  });

  console.log('✅ Lock cleared + daily counter reset. Engine ready.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
