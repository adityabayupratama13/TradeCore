import { NextResponse } from 'next/server';
import { executeAIAndTrade } from '../../../../lib/tradingEngine';

export async function POST() {
  try {
    if (process.env.ENGINE_TEST_MODE !== 'true') {
        return NextResponse.json({ success: false, error: 'ENGINE_TEST_MODE is not true in .env.local' }, { status: 400 });
    }
    
    // Fire test trade on BTCUSDT bypassing everything else
    executeAIAndTrade('BTCUSDT', { triggerType: 'TEST_TRADE', strength: 3 }).catch(e => console.error(e));
    
    return NextResponse.json({ success: true, message: 'Test trade dispatched to engine.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
