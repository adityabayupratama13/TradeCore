const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../prisma/tradecore.db');
const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 30;

function getTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

// Create backup dir if not exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Copy database
const backupName = `tradecore-backup-${getTimestamp()}.db`;
const backupPath = path.join(BACKUP_DIR, backupName);
if (fs.existsSync(DB_PATH)) {
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ Backup created: ${backupName}`);
  console.log(`   Location: ${backupPath}`);
  console.log(`   Size: ${(fs.statSync(backupPath).size / 1024).toFixed(1)} KB`);
}

// Auto-delete old backups (keep last MAX_BACKUPS)
const backups = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith('tradecore-backup-') && f.endsWith('.db'))
  .sort();

if (backups.length > MAX_BACKUPS) {
  const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
  toDelete.forEach(f => {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log(`🗑️  Deleted old backup: ${f}`);
  });
}

console.log(`📦 Total backups: ${Math.min(backups.length, MAX_BACKUPS)}/${MAX_BACKUPS}`);
