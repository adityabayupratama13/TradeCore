import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { stopEngine } from '../../../../../src/lib/engineScheduler';

export async function POST() {
  try {
    await prisma.appSettings.upsert({
      where: { key: 'ENGINE_ENABLED' },
      update: { value: 'false' },
      create: { key: 'ENGINE_ENABLED', value: 'false' }
    });
    await prisma.appSettings.upsert({
      where: { key: 'engine_status' },
      update: { value: 'STOPPED' },
      create: { key: 'engine_status', value: 'STOPPED' }
    });

    stopEngine();
    return NextResponse.json({ success: true, message: 'Engine Stopped' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
