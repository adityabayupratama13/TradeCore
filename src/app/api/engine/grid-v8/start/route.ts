import { NextRequest, NextResponse } from 'next/server';
import { initializeGridV8, getGridStatusV8 } from '@/lib/gridEngineV8';
import { prisma } from '@/lib/prisma';
import { startGridV8Loop } from '@/lib/engineScheduler';

export async function POST(req: NextRequest) {
  try {
    // Check V6 / V7 / V8 conflict — only one grid bot per symbol
    const [v6State, v7State, v8State] = await Promise.all([
      prisma.appSettings.findUnique({ where: { key: 'grid_v6_state' } }),
      prisma.appSettings.findUnique({ where: { key: 'grid_v7_state' } }),
      prisma.appSettings.findUnique({ where: { key: 'grid_v8_active' } })
    ]);

    if (v6State?.value) {
      const v6 = JSON.parse(v6State.value);
      if (v6.isActive) return NextResponse.json({ success: false, error: 'V6 Grid Bot is running. Stop it first.' }, { status: 409 });
    }
    if (v7State?.value) {
      const v7 = JSON.parse(v7State.value);
      if (v7.isActive) return NextResponse.json({ success: false, error: 'V7 Grid Bot is running. Stop it first.' }, { status: 409 });
    }
    if (v8State?.value === 'true') {
      const current = await getGridStatusV8();
      if (current.isActive) return NextResponse.json({ success: false, error: 'V8 Grid Bot is already running.' }, { status: 409 });
    }

    let config = {};
    try {
      const body = await req.json();
      config = {
        symbol:         body.symbol        || undefined,
        leverage:       body.leverage      ? parseInt(body.leverage)        : undefined,
        gridCount:      body.gridCount     ? parseInt(body.gridCount)       : undefined,
        gridSpacingPct: body.gridSpacingPct ? parseFloat(body.gridSpacingPct) : undefined,
        capitalPct:     body.capitalPct    ? parseFloat(body.capitalPct)    : undefined,
      };
    } catch (_) {}

    const state = await initializeGridV8(config);

    await prisma.appSettings.upsert({
      where:  { key: 'grid_v8_active' },
      update: { value: 'true' },
      create: { key: 'grid_v8_active', value: 'true' }
    });

    // Start the V8 scheduler loop
    startGridV8Loop();

    return NextResponse.json({
      success: true,
      message: `V8 Grid Bot started on ${state.symbol}`,
      config: {
        symbol:    state.symbol,
        leverage:  state.leverage,
        gridCount: state.gridCount,
        spacing:   `${state.gridSpacingPct}%`,
        range:     `$${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}`
      }
    });

  } catch (err: any) {
    console.error('[V8 Start] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
