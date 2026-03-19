import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET() {
  try {
    const settings = await prisma.appSettings.findMany({
      where: { key: { startsWith: 'watchlist_' } }
    });

    const watchlist: Record<string, any> = {};
    settings.forEach((setting: any) => {
      const parts = setting.key.split('_');
      if (parts.length >= 3) {
        const symbol = parts[1];
        const field = parts.slice(2).join('_');
        
        if (!watchlist[symbol]) watchlist[symbol] = { symbol };
        watchlist[symbol][field] = setting.value;
      }
    });

    return NextResponse.json(Object.values(watchlist));
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
