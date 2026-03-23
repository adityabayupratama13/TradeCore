require('dotenv').config({ path: '.env.local' });
const { analyzeMarket } = require('./src/lib/tradingEngine');
const { prisma } = require('./src/lib/prisma');

async function testAI() {
  try {
    console.log('Testing analyzeMarket for BTCUSDT...');
    // We need to bypass the database check inside analyzeMarket, but analyzeMarket fetches from DB too.
    const result = await analyzeMarket('BTCUSDT', null, 'SAFE');
    console.log('Result:', result);
  } catch (err) {
    console.error('FATAL:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testAI();
