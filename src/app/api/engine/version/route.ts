import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

// ==========================================
// ENGINE VERSION PRESETS
// Automatically applied when user switches engine version.
// User can still override manually via Custom Override.
// ==========================================

const ENGINE_PRESETS: Record<string, {
  // Risk %
  riskPctLargeCap: number;
  riskPctMidCap: number;
  riskPctLowCap: number;
  // Leverage
  leverageLargeCap: number;
  leverageMidCap: number;
  leverageLowCap: number;
  maxLeverageLarge: number;
  maxLeverageMid: number;
  maxLeverageLow: number;
  // Other settings
  minConfidence: number;
  minProfitTargetPct: number;
  maxOpenPositions: number;
  maxDailyLossPct: number;
  maxWeeklyLossPct?: number;
}> = {

  // ─────────────────────────────────────────
  // V1: RSI Momentum — Conservative, Classic
  // Small SL, moderate leverage, high confidence filter
  // ─────────────────────────────────────────
  v1: {
    riskPctLargeCap: 1.0,
    riskPctMidCap: 1.5,
    riskPctLowCap: 2.0,
    leverageLargeCap: 5,
    leverageMidCap: 8,
    leverageLowCap: 10,
    maxLeverageLarge: 5,
    maxLeverageMid: 8,
    maxLeverageLow: 10,
    minConfidence: 70,
    minProfitTargetPct: 15,
    maxOpenPositions: 5,
    maxDailyLossPct: 10,
  },

  // ─────────────────────────────────────────
  // V2: Smart Money Concepts — Moderate
  // Slightly higher leverage, SMC-based entries
  // ─────────────────────────────────────────
  v2: {
    riskPctLargeCap: 1.5,
    riskPctMidCap: 2.0,
    riskPctLowCap: 2.5,
    leverageLargeCap: 8,
    leverageMidCap: 12,
    leverageLowCap: 15,
    maxLeverageLarge: 8,
    maxLeverageMid: 12,
    maxLeverageLow: 15,
    minConfidence: 65,
    minProfitTargetPct: 10,
    maxOpenPositions: 5,
    maxDailyLossPct: 10,
  },

  // ─────────────────────────────────────────
  // V3: Sniper Mode — Optimized for $100 capital
  // High leverage (15-25x), algo-filtered high-quality entries
  // Low min confidence (algo filter handles quality, not AI confidence score)
  // minProfitTargetPct = 0 → V3 manages TP via partial TP manager (don't override)
  // Max open positions = 3 → quality over quantity
  // ─────────────────────────────────────────
  v3: {
    riskPctLargeCap: 1.5,
    riskPctMidCap: 2.0,
    riskPctLowCap: 2.0,
    leverageLargeCap: 15,
    leverageMidCap: 20,
    leverageLowCap: 25,
    maxLeverageLarge: 15,
    maxLeverageMid: 20,
    maxLeverageLow: 25,
    minConfidence: 55,
    minProfitTargetPct: 0,  // V3 handles TP via partialTPManager
    maxOpenPositions: 3,
    maxDailyLossPct: 10,
  },

  // ─────────────────────────────────────────
  // V4: Smart Aggressive — Balance-aware leverage
  // Leverage is actually overridden at runtime by getV4Leverage() in btcRegime.ts
  // These preset values serve as UI display fallback only
  // ─────────────────────────────────────────
  v4: {
    riskPctLargeCap: 2.0,
    riskPctMidCap: 2.5,
    riskPctLowCap: 2.5,
    leverageLargeCap: 6,    // display only — runtime uses getV4Leverage()
    leverageMidCap: 8,      // display only
    leverageLowCap: 8,      // display only
    maxLeverageLarge: 6,
    maxLeverageMid: 8,
    maxLeverageLow: 8,
    minConfidence: 65,      // higher quality gate than V3 (55)
    minProfitTargetPct: 5,  // realistic TP target (was 15% in V3)
    maxOpenPositions: 3,
    maxDailyLossPct: 10,
  },

  // ─────────────────────────────────────────
  // V5: Macro Day-Trader — Strictly gated low frequency
  // ─────────────────────────────────────────
  v5: {
    riskPctLargeCap: 2.0,
    riskPctMidCap: 2.5,
    riskPctLowCap: 2.5,
    leverageLargeCap: 10,
    leverageMidCap: 10,
    leverageLowCap: 10,
    maxLeverageLarge: 15,
    maxLeverageMid: 15,
    maxLeverageLow: 15,
    minConfidence: 50,      // relaxed confidence, but macro gated
    minProfitTargetPct: 0,
    maxOpenPositions: 3,
    maxDailyLossPct: 10,
    maxWeeklyLossPct: 50,
  },
};

export async function GET() {
  try {
    const setting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
    return NextResponse.json({ success: true, version: setting?.value || 'v1' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { version, applyPreset = true } = await req.json();
    
    if (!['v1', 'v2', 'v3', 'v4', 'v5'].includes(version)) {
      return NextResponse.json({ success: false, error: 'Invalid version. Must be v1-v5' }, { status: 400 });
    }

    // Save engine version
    await prisma.appSettings.upsert({
      where: { key: 'engine_version' },
      update: { value: version },
      create: { key: 'engine_version', value: version }
    });

    // Auto-apply preset unless user explicitly skips (applyPreset: false = manual override)
    let presetApplied = false;
    if (applyPreset && ENGINE_PRESETS[version]) {
      const preset = ENGINE_PRESETS[version];
      const activeRule = await prisma.riskRule.findFirst({ where: { isActive: true } });

      if (activeRule) {
        await prisma.riskRule.update({
          where: { id: activeRule.id },
          data: {
            riskPctLargeCap: preset.riskPctLargeCap,
            riskPctMidCap: preset.riskPctMidCap,
            riskPctLowCap: preset.riskPctLowCap,
            leverageLargeCap: preset.leverageLargeCap,
            leverageMidCap: preset.leverageMidCap,
            leverageLowCap: preset.leverageLowCap,
            maxLeverageLarge: preset.maxLeverageLarge,
            maxLeverageMid: preset.maxLeverageMid,
            maxLeverageLow: preset.maxLeverageLow,
            minConfidence: preset.minConfidence,
            minProfitTargetPct: preset.minProfitTargetPct,
            maxOpenPositions: preset.maxOpenPositions,
            maxDailyLossPct: preset.maxDailyLossPct,
            maxWeeklyLossPct: preset.maxWeeklyLossPct,
          }
        });
        presetApplied = true;
        console.log(`[Engine] Switched to ${version.toUpperCase()} — preset applied:`, preset);
      }
    }
    
    return NextResponse.json({ success: true, version, presetApplied });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
