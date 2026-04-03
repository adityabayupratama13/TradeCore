import { NextRequest, NextResponse } from 'next/server';
import { initializeGridV7, getGridStatusV7 } from '@/lib/gridEngineV7';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    // Check if V6 is currently running — cannot run both simultaneously
    const v6State = await prisma.appSettings.findUnique({ where: { key: 'grid_v6_state' } });
    if (v6State?.value) {
      const v6 = JSON.parse(v6State.value);
      if (v6.isActive) {
        return NextResponse.json({
          success: false,
          error: 'V6 Grid Bot is currently running. Stop V6 first before starting V7.'
        }, { status: 409 });
      }
    }

    // Check if V7 is already running
    const currentStatus = await getGridStatusV7();
    if (currentStatus.isActive) {
      return NextResponse.json({
        success: false,
        error: 'V7 Grid Bot is already running. Stop it first before re-initializing.'
      }, { status: 409 });
    }

    // Parse optional config from body
    let config = {};
    try {
      const body = await req.json();
      config = {
        symbol:         body.symbol        || undefined,
        leverage:       body.leverage      ? parseInt(body.leverage)       : undefined,
        gridCount:      body.gridCount     ? parseInt(body.gridCount)      : undefined,
        gridSpacingPct: body.gridSpacingPct ? parseFloat(body.gridSpacingPct) : undefined,
        capitalPct:     body.capitalPct    ? parseFloat(body.capitalPct)   : undefined,
      };
    } catch (_) {
      // No body — use all defaults
    }

    const state = await initializeGridV7(config);

    // Signal the scheduler that V7 should be running
    await prisma.appSettings.upsert({
      where:  { key: 'grid_v7_active' },
      update: { value: 'true' },
      create: { key: 'grid_v7_active', value: 'true' }
    });

    return NextResponse.json({
      success: true,
      message: `V7 Grid Bot started on ${state.symbol}`,
      config: {
        symbol:    state.symbol,
        leverage:  state.leverage,
        gridCount: state.gridCount,
        spacing:   `${state.gridSpacingPct}%`,
        range:     `$${state.lowerBound.toFixed(2)} — $${state.upperBound.toFixed(2)}`
      }
    });

  } catch (err: any) {
    console.error('[V7 Start] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
