const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const settings = await p.appSettings.findMany({
    where: {
      key: { in: ['engine_version', 'ENGINE_ENABLED', 'ENGINE_TEST_MODE', 'active_trading_pairs'] }
    }
  });
  
  const map = {};
  settings.forEach(s => map[s.key] = s.value);
  console.log('=== ENGINE SETTINGS ===');
  console.log('Version:', map['engine_version']);
  console.log('Enabled:', map['ENGINE_ENABLED']);
  console.log('TestMode:', map['ENGINE_TEST_MODE']);
  
  let pairs = [];
  try { pairs = JSON.parse(map['active_trading_pairs'] || '[]'); } catch(e){}
  console.log('Active Pairs:', pairs.map(p => p.symbol).join(', '));

  console.log('\n=== RECENT ENGINE LOGS (Last 15) ===');
  const logs = await p.engineLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  logs.forEach(l => {
    const t = new Date(l.createdAt).toLocaleTimeString('id-ID');
    console.log(`[${t}] ${l.symbol} | ${l.action} | ${l.result} | ${l.reason}`);
  });

  console.log('\n=== RECENT TRADE SIGNALS (Last 10) ===');
  const signals = await p.tradeSignalHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  signals.forEach(s => {
    const t = new Date(s.createdAt).toLocaleTimeString('id-ID');
    console.log(`[${t}] ${s.symbol} ${s.action} (conf: ${s.confidence}) | ${s.reasoning?.substring(0, 100)}`);
  });

  await p.$disconnect();
}

main().catch(console.error);
