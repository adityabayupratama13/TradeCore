const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLock() {
  const lock = await prisma.appSettings.findUnique({ where: { key: 'circuit_breaker_lock_until' } });
  console.log('circuit_breaker_lock_until:', lock);
  
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + wibOffset);
  const startOfTodayWIB = new Date(nowWIB);
  startOfTodayWIB.setUTCHours(0, 0, 0, 0); 
  const startOfDay = new Date(startOfTodayWIB.getTime() - wibOffset);
  
  const recentTrades = await prisma.trade.findMany({
    where: { status: 'CLOSED', exitAt: { gte: startOfDay } }
  });
  let todayPnl = 0;
  recentTrades.forEach(t => todayPnl += (t.pnl || 0));
  
  console.log('todayPnl:', todayPnl);

  await prisma.$disconnect();
}
checkLock();
