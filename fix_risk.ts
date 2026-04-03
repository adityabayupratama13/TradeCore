import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.riskRule.findMany();
  console.log("Before:", rules.map(r => r.maxWeeklyLossPct));
  
  const res = await prisma.riskRule.updateMany({
    data: { maxWeeklyLossPct: 50 },
  });
  console.log("Updated rules:", res.count);

  await prisma.appSettings.deleteMany({
    where: { key: 'circuit_breaker_lock_until' }
  });
  console.log("Deleted lock.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
