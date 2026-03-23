import * as fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
});
import { analyzeMarket } from './src/lib/aiEngine';
import { prisma } from './lib/prisma';

async function testAI() {
  try {
    console.log('Testing analyzeMarket for BTCUSDT...');
    const result = await analyzeMarket('BTCUSDT', null, 'SAFE');
    console.log('Result:', result);
  } catch (err) {
    console.error('FATAL:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testAI();
