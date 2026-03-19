import { NextResponse } from 'next/server';
import { executeAIAndTrade } from '../../../../lib/tradingEngine';

export async function POST() {
  try {
    if (process.env.ENGINE_TEST_MODE !== 'true') {
        return NextResponse.json({ success: false, error: 'ENGINE_TEST_MODE is not true in .env.local' }, { status: 400 });
    }
    
    const result = await executeAIAndTrade('BTCUSDT', { triggerType: 'TEST_TRADE', strength: 3 });
    
    if (result?.success) {
      return NextResponse.json({ 
        success: true, 
        orderId: result.order?.orderId || 'MOCKED_ID',
        symbol: 'BTCUSDT',
        side: result.signal.action === 'LONG' ? 'BUY' : 'SELL',
        price: result.signal.entryPrice,
        message: `Order ${result.order?.orderId || 'MOCKED'} placed successfully`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result?.reason || 'Unknown error inside execution block'
      }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
