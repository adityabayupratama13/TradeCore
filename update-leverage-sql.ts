import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe('UPDATE RiskRule SET leverageLowCap = 20, maxLeverageLow = 25, leverageMidCap = 15, maxLeverageMid = 20;');
  console.log('Updated Leverage Low/Mid Caps via raw SQL');
}
main().then(() => prisma.$disconnect());
