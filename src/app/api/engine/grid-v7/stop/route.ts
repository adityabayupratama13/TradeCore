import { NextResponse } from 'next/server';
import { stopGridV7 } from '@/lib/gridEngineV7';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const result = await stopGridV7();

    // Clear the V7 active flag
    await prisma.appSettings.upsert({
      where:  { key: 'grid_v7_active' },
      update: { value: 'false' },
      create: { key: 'grid_v7_active', value: 'false' }
    });

    return NextResponse.json({
      success: true,
      message: 'V7 Grid Bot stopped',
      totalProfit: result.totalProfit,
      totalFills:  result.totalFills
    });

  } catch (err: any) {
    console.error('[V7 Stop] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
