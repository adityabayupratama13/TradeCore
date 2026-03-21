import { NextResponse } from 'next/server';
import { checkAndEnforceCircuitBreaker } from '../../../../lib/circuitBreaker';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cb = await checkAndEnforceCircuitBreaker();
    
    // Fire sync in background so page refresh instantly catches orphaned positions!
    import('../../../../lib/positionSync').then(m => {
       m.syncPositions().catch(e => console.error("Background sync failed", e));
    });

    let uiStatus = 'SAFE';
    if (cb.isLocked || cb.drawdownPct >= (cb.rules?.maxDrawdownPct || 15)) {
      uiStatus = 'DANGER';
    } else if (cb.warnings && cb.warnings.length > 0) {
      uiStatus = 'WARNING';
    }

    return NextResponse.json({
      status: uiStatus,
      dailyLossPct: cb.dailyLossPct,
      maxDailyLossPct: cb.rules?.maxDailyLossPct || 3,
      weeklyLossPct: cb.weeklyLossPct,
      maxWeeklyLossPct: cb.rules?.maxWeeklyLossPct || 7,
      drawdownPct: cb.drawdownPct,
      maxDrawdownPct: cb.rules?.maxDrawdownPct || 15,
      canTrade: cb.canTrade,
      warnings: cb.warnings
    });
  } catch (error) {
    console.error('API /risk/status error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
