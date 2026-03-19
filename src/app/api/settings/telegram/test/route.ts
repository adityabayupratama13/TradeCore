import { NextResponse } from 'next/server';
import { sendTelegramAlert } from '../../../../../lib/telegram';

export async function POST() {
  try {
    const success = await sendTelegramAlert({
      type: 'TEST',
      data: {}
    });
    
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Failed to send. Check token and chat ID.' }, { status: 400 });
    }
  } catch (error) {
    console.error('API /settings/telegram/test error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
