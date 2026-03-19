import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const setting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
    const activePairs = setting?.value ? JSON.parse(setting.value) : [];
    return NextResponse.json({ success: true, activePairs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
