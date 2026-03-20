const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
   const portfolio = await prisma.portfolio.findFirst();
   if (portfolio && portfolio.currency === 'IDR') {
       console.log('Converting IDR portfolio to USD...');
       const newCapital = portfolio.totalCapital / 16000;
       await prisma.portfolio.update({
           where: { id: portfolio.id },
           data: {
              currency: 'USD',
              totalCapital: newCapital
           }
       });
       console.log(`Successfully converted ${portfolio.totalCapital} IDR to ${newCapital} USD`);
   } else if (portfolio) {
       console.log('Portfolio is already in USD or no IDR currency set:', portfolio.currency);
   } else {
       console.log('No portfolio found.');
   }
   
   // Also check appSettings for any stored IDR goals? There aren't any, but let's check.
}

main().catch(console.error).finally(() => prisma.$disconnect());
