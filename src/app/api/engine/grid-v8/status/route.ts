import { NextResponse } from 'next/server';
import { getGridStatusV8 } from '@/lib/gridEngineV8';

export async function GET() {
  try {
    const status = await getGridStatusV8();
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    console.error('[V8 Status] Error:', err);
    return NextResponse.json({ success: false, error: err.message, isActive: false }, { status: 500 });
  }
}
