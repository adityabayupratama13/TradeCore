import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const [tradesCount, journalCount] = await Promise.all([
      prisma.trade.count(),
      prisma.tradeJournal.count()
    ]);

    let sizeBytes = 0;
    const dbPath = path.join(process.cwd(), 'prisma', 'tradecore.db');
    if (fs.existsSync(dbPath)) {
      sizeBytes = fs.statSync(dbPath).size;
    }

    // Try to get the latest migration from _prisma_migrations locally using raw query
    let lastMigration = 'Unknown';
    try {
      const migs = await prisma.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`;
      if (Array.isArray(migs) && migs.length > 0) {
        lastMigration = (migs[0] as any).migration_name;
      }
    } catch(e) { /* ignore if raw query fails */ }

    return NextResponse.json({
      tradesCount,
      journalCount,
      sizeMb: (sizeBytes / (1024 * 1024)).toFixed(2),
      dbPath: './prisma/tradecore.db',
      lastMigration
    });

  } catch (error) {
    console.error('API /settings/db-stats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
