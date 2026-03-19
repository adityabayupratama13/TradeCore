import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../../../lib/prisma';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file || !file.name.endsWith('.db')) {
      return NextResponse.json({ error: 'Invalid file format. Must be .db' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dbPath = path.join(process.cwd(), 'prisma', 'tradecore.db');

    // Make an emergency backup of current DB before overriding
    const emergencyDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(emergencyDir)) fs.mkdirSync(emergencyDir, { recursive: true });
    
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(emergencyDir, `tradecore-emergency-pre-restore-${Date.now()}.db`));
    }

    // Force disconnect Prisma
    await prisma.$disconnect();

    // Overwrite database
    fs.writeFileSync(dbPath, buffer);

    // Reconnect Prisma inherently on next query
    return NextResponse.json({ success: true, message: 'Database successfully restored.' });
  } catch (error) {
    console.error('API /backup/restore error:', error);
    return NextResponse.json({ error: 'Restore failed' }, { status: 500 });
  }
}
