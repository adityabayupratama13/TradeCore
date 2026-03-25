/**
 * 🔄 RESET DATABASE FOR REAL ACCOUNT
 * 
 * Script ini membersihkan data demo trade dari database
 * agar circuit breaker dan risk manager mulai fresh
 * untuk akun real.
 * 
 * Yang DIHAPUS:
 * - Semua trade history (demo trades)
 * - Semua trade signal history
 * - Semua engine logs
 * - Semua risk events
 * - Circuit breaker locks
 * - Pending signals
 * - Milestone data
 * - Execution locks
 * 
 * Yang TETAP:
 * - Portfolio config (akan di-update dengan balance real)
 * - Risk rules / trading mode
 * - Notification settings
 * - Engine version setting
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'prisma', 'dev.db');

console.log('═══════════════════════════════════════════════');
console.log('  🔄 RESET DATABASE FOR REAL ACCOUNT');
console.log('═══════════════════════════════════════════════');
console.log(`  Database: ${DB_PATH}`);
console.log('');

try {
  const db = new Database(DB_PATH);
  
  // Count existing data before reset
  const tradeCount = db.prepare('SELECT COUNT(*) as c FROM Trade').get();
  const signalCount = db.prepare('SELECT COUNT(*) as c FROM TradeSignalHistory').get();
  const logCount = db.prepare('SELECT COUNT(*) as c FROM EngineLog').get();
  const riskEventCount = db.prepare('SELECT COUNT(*) as c FROM RiskEvent').get();
  
  console.log('  📊 Data sebelum reset:');
  console.log(`     Trades:         ${tradeCount.c}`);
  console.log(`     Signal History: ${signalCount.c}`);
  console.log(`     Engine Logs:    ${logCount.c}`);
  console.log(`     Risk Events:    ${riskEventCount.c}`);
  console.log('');

  // Start transaction for atomic reset
  const resetTransaction = db.transaction(() => {
    // 1. Delete all trades (demo data)
    db.prepare('DELETE FROM Trade').run();
    console.log('  ✅ Trades cleared');

    // 2. Delete all signal history
    db.prepare('DELETE FROM TradeSignalHistory').run();
    console.log('  ✅ Signal history cleared');

    // 3. Delete all engine logs
    db.prepare('DELETE FROM EngineLog').run();
    console.log('  ✅ Engine logs cleared');

    // 4. Delete all risk events
    db.prepare('DELETE FROM RiskEvent').run();
    console.log('  ✅ Risk events cleared');

    // 5. Delete circuit breaker locks and stale settings
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
      db.prepare('DELETE FROM AppSettings WHERE key = ?').run(key);
    }
    console.log('  ✅ Circuit breaker locks & stale settings cleared');

    // 6. Delete all milestone and execution lock data
    db.prepare("DELETE FROM AppSettings WHERE key LIKE 'milestone_%'").run();
    db.prepare("DELETE FROM AppSettings WHERE key LIKE 'exec_lock_%'").run();
    db.prepare("DELETE FROM AppSettings WHERE key LIKE 'blacklist_%'").run();
    db.prepare("DELETE FROM AppSettings WHERE key LIKE 'tp_levels_%'").run();
    console.log('  ✅ Milestones, exec locks, blacklists cleared');

    // 7. Reset engine status
    db.prepare("UPDATE AppSettings SET value = 'STOPPED' WHERE key = 'engine_status'").run();
    console.log('  ✅ Engine status set to STOPPED');
  });

  resetTransaction();

  // Verify after reset
  const tradeAfter = db.prepare('SELECT COUNT(*) as c FROM Trade').get();
  const portfolio = db.prepare('SELECT * FROM Portfolio LIMIT 1').get();
  const riskRule = db.prepare('SELECT activeMode, maxDailyLossPct, maxWeeklyLossPct FROM RiskRule WHERE isActive = 1 LIMIT 1').get();

  console.log('');
  console.log('  ═══════════════════════════════════════════');
  console.log('  ✅ RESET COMPLETE!');
  console.log('  ═══════════════════════════════════════════');
  console.log(`  Trades remaining: ${tradeAfter.c}`);
  if (portfolio) {
    console.log(`  Portfolio capital: $${portfolio.totalCapital}`);
  }
  if (riskRule) {
    console.log(`  Trading mode: ${riskRule.activeMode}`);
    console.log(`  Daily loss limit: ${riskRule.maxDailyLossPct}%`);
    console.log(`  Weekly loss limit: ${riskRule.maxWeeklyLossPct}%`);
  }
  console.log('');
  console.log('  ⚠️  NEXT STEPS:');
  console.log('  1. Pastikan .env sudah mengarah ke Binance REAL API');
  console.log('  2. Restart app: npm run dev');
  console.log('  3. Cek Risk Manager — weekly loss harusnya 0%');
  console.log('  4. Portfolio capital akan auto-update dari balance real');
  console.log('  5. Baru enable engine setelah verifikasi semua OK');
  console.log('');

  db.close();
} catch (err) {
  console.error('❌ Error:', err.message);
  
  // Fallback: try with sqlite3 command
  console.log('');
  console.log('Jika error, coba jalankan manual di terminal:');
  console.log('');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM Trade;"');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM TradeSignalHistory;"');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM EngineLog;"');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM RiskEvent;"');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM AppSettings WHERE key=\'circuit_breaker_lock_until\';"');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM AppSettings WHERE key LIKE \'milestone_%\';"');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM AppSettings WHERE key LIKE \'exec_lock_%\';"');
  console.log('  sqlite3 prisma/dev.db "DELETE FROM AppSettings WHERE key LIKE \'blacklist_%\';"');
}
