import { NextResponse } from 'next/server';
import { checkAndEnforceCircuitBreaker } from '../../../../lib/circuitBreaker';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await checkAndEnforceCircuitBreaker();
    return NextResponse.json(status);
  } catch (error) {
    console.error('API /risk/status error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
