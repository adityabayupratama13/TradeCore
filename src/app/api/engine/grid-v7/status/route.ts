import { NextResponse } from 'next/server';
import { getGridStatusV7 } from '@/lib/gridEngineV7';

export async function GET() {
  try {
    const status = await getGridStatusV7();
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    console.error('[V7 Status] Error:', err);
    return NextResponse.json({ success: false, error: err.message, isActive: false }, { status: 500 });
  }
}
