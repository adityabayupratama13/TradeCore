import { NextResponse } from 'next/server';
import { stopGridV8 } from '@/lib/gridEngineV8';
import { stopGridV8Loop } from '@/lib/engineScheduler';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    stopGridV8Loop();
    const result = await stopGridV8();

    await prisma.appSettings.upsert({
      where:  { key: 'grid_v8_active' },
      update: { value: 'false' },
      create: { key: 'grid_v8_active', value: 'false' }
    });

    return NextResponse.json({
      success: true,
      message: 'V8 Grid Bot stopped',
      totalProfit: result.totalProfit,
      totalFills:  result.totalFills
    });

  } catch (err: any) {
    console.error('[V8 Stop] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
