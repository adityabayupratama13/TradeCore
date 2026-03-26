const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.tradeSignalHistory.findMany({ 
  where: { symbol: 'RIVERUSDT', confidence: { gte: 85 } }, 
  orderBy: { createdAt: 'desc' }, 
  take: 1 
}).then(r => { 
  console.log(r[0]); 
  p.$disconnect(); 
});
