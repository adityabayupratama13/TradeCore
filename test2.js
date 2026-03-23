require('dotenv').config({ path: '.env.local' });
const { getBalance } = require('./src/lib/binance');
const { prisma } = require('./src/lib/prisma');

async function test() {
  try {
    console.log('Testing Prisma...');
    const portfolio = await prisma.portfolio.findFirst();
    console.log('Portfolio found:', portfolio !== null);
    
    console.log('Testing Binance API...');
    const balances = await getBalance();
    console.log('Balances:', balances.slice(0, 2));

  } catch (err) {
    console.error('FATAL:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
