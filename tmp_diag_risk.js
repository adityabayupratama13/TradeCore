const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function run() {
  const risk = await p.riskRule.findFirst();
  if (risk) {
     await p.riskRule.update({
       where: { id: risk.id },
       data: { minConfidence: 55 }
     });
     console.log('Updated RiskRule minConfidence to 55 in DB!');
  }
  p.$disconnect();
}
run();
