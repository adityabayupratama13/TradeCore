const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.riskRule.updateMany({
    data: { maxOpenPositions: 5 }
  });
  console.log('✅ Updated maxOpenPositions to 5 across all risk rules.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
