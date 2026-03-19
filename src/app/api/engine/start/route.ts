import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { startEngine } from '../../../../../src/lib/engineScheduler';

export async function POST() {
  try {
    await prisma.appSettings.upsert({
      where: { key: 'ENGINE_ENABLED' },
      update: { value: 'true' },
      create: { key: 'ENGINE_ENABLED', value: 'true' }
    });
    await prisma.appSettings.upsert({
      where: { key: 'engine_status' },
      update: { value: 'RUNNING' },
      create: { key: 'engine_status', value: 'RUNNING' }
    });

    startEngine();
    return NextResponse.json({ success: true, message: 'Engine Started' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
