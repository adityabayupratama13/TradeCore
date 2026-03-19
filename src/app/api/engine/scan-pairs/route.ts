import { NextResponse } from 'next/server';
import { runDynamicHunter } from '../../../../lib/pairSelector';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await runDynamicHunter();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
