import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function PATCH(req: Request) {
  try {
    const { enabled, frequency, time, maxBackups } = await req.json();

    const config = {
      enabled: !!enabled,
      frequency: frequency || 'Daily',
      time: time || '23:00',
      maxBackups: maxBackups || 30
    };

    await prisma.appSettings.upsert({
      where: { key: 'auto_backup_config' },
      update: { value: JSON.stringify(config) },
      create: { key: 'auto_backup_config', value: JSON.stringify(config) }
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('API /settings/backup-config error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const raw = await prisma.appSettings.findUnique({ where: { key: 'auto_backup_config' } });
    if (!raw) {
      return NextResponse.json({
        enabled: false, frequency: 'Daily', time: '23:00', maxBackups: 30
      });
    }
    return NextResponse.json(JSON.parse(raw.value));
  } catch(err) {
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
