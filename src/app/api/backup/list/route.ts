import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    
    if (!fs.existsSync(backupDir)) {
      return NextResponse.json([]);
    }

    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('tradecore-backup-') && f.endsWith('.db'))
      .map(filename => {
        const fullPath = path.join(backupDir, filename);
        const stat = fs.statSync(fullPath);
        return {
          filename,
          sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
          createdAt: stat.birthtime.toISOString()
        };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename)); // newest first

    return NextResponse.json(files);
  } catch (error) {
    console.error('API /backup/list error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
