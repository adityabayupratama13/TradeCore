const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAI() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const signals = await prisma.tradeSignalHistory.findMany({
    where: { createdAt: { gte: startOfDay } },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.log('--- RECENT AI SIGNALS TODAY ---');
  signals.forEach(s => {
    console.log(`[${s.createdAt.toISOString()}] ${s.symbol} | ${s.decision} | Score: ${s.aiScore}`);
    console.log(`Reasoning: ${s.aiReasoning}`);
    console.log('---');
  });

  await prisma.$disconnect();
}

checkAI();
