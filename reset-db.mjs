import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetForRealAccount() {
  console.log('═══════════════════════════════════════════════');
  console.log('  🔄 RESET DATABASE FOR REAL ACCOUNT');
  console.log('═══════════════════════════════════════════════');

  // Count before
  const trades = await prisma.trade.count();
  const signals = await prisma.tradeSignalHistory.count();
  const logs = await prisma.engineLog.count();
  const events = await prisma.riskEvent.count();

  console.log(`  Trades: ${trades} | Signals: ${signals} | Logs: ${logs} | Events: ${events}`);
  console.log('');

  // 1. Delete all trades
  await prisma.trade.deleteMany({});
  console.log('  ✅ Trades cleared');

  // 2. Delete signal history
  await prisma.tradeSignalHistory.deleteMany({});
  console.log('  ✅ Signal history cleared');

  // 3. Delete engine logs
  await prisma.engineLog.deleteMany({});
  console.log('  ✅ Engine logs cleared');

  // 4. Delete risk events
  await prisma.riskEvent.deleteMany({});
  console.log('  ✅ Risk events cleared');

  // 5. Delete stale settings
  const keysToDelete = [
    'circuit_breaker_lock_until',
    'pending_signals',
    'engine_pause_until',
    'test_trade_fired',
    'last_trade_executed_at',
    'simulated_capital_usd',
    'simulated_capital_activated_at',
  ];
  for (const key of keysToDelete) {
    await prisma.appSettings.deleteMany({ where: { key } });
  }
  console.log('  ✅ Circuit breaker locks cleared');

  // 6. Delete milestone/exec lock/blacklist data
  await prisma.$executeRawUnsafe("DELETE FROM AppSettings WHERE key LIKE 'milestone_%'");
  await prisma.$executeRawUnsafe("DELETE FROM AppSettings WHERE key LIKE 'exec_lock_%'");
  await prisma.$executeRawUnsafe("DELETE FROM AppSettings WHERE key LIKE 'blacklist_%'");
  await prisma.$executeRawUnsafe("DELETE FROM AppSettings WHERE key LIKE 'tp_levels_%'");
  console.log('  ✅ Milestones, exec locks, blacklists cleared');

  // 7. Set engine to stopped
  await prisma.appSettings.upsert({
    where: { key: 'engine_status' },
    update: { value: 'STOPPED' },
    create: { key: 'engine_status', value: 'STOPPED' }
  });
  console.log('  ✅ Engine status → STOPPED');

  // Verify
  const tradesAfter = await prisma.trade.count();
  const portfolio = await prisma.portfolio.findFirst();
  const riskRule = await prisma.riskRule.findFirst({ where: { isActive: true } });

  console.log('');
  console.log('  ═══════════════════════════════════════════');
  console.log('  ✅ RESET COMPLETE!');
  console.log('  ═══════════════════════════════════════════');
  console.log(`  Trades: ${tradesAfter}`);
  if (portfolio) console.log(`  Portfolio: $${portfolio.totalCapital}`);
  if (riskRule) console.log(`  Mode: ${riskRule.activeMode} | Daily: ${riskRule.maxDailyLossPct}% | Weekly: ${riskRule.maxWeeklyLossPct}%`);
  console.log('');
  console.log('  ⚠️  NEXT STEPS:');
  console.log('  1. Restart app: npm run dev');
  console.log('  2. Cek Risk Manager — weekly loss harusnya 0%');
  console.log('  3. Portfolio auto-update dari balance real ($58)');
  console.log('  4. Baru enable engine setelah verifikasi OK');

  await prisma.$disconnect();
}

resetForRealAccount().catch(e => {
  console.error('❌ Error:', e.message);
  prisma.$disconnect();
});
