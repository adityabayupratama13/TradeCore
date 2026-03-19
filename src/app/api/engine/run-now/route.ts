import { NextResponse } from 'next/server';
import { runPriceWatcher } from '../../../../../src/lib/priceWatcher';

export async function POST() {
  try {
    runPriceWatcher().catch(e => console.error(e));
    return NextResponse.json({ success: true, message: 'PriceWatcher Fast Track Loop Fired' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
