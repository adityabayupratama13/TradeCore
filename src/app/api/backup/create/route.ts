import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const dbPath = path.join(process.cwd(), 'prisma', 'tradecore.db');
    const backupDir = path.join(process.cwd(), 'backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${yyyy}-${mm}-${dd}_${hh}-${min}`;
    
    const backupName = `tradecore-backup-${timestamp}.db`;
    const backupPath = path.join(backupDir, backupName);

    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
    } else {
      return NextResponse.json({ error: 'Database file not found' }, { status: 404 });
    }

    // Read the file and return as download
    const fileBuffer = fs.readFileSync(backupPath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${backupName}"`,
      },
    });

  } catch (error) {
    console.error('API /backup/create error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
