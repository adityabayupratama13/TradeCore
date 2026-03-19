import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function POST(req: Request) {
  try {
    const { symbol, price } = await req.json();

    if (!symbol || price === undefined) {
      return NextResponse.json({ error: 'Missing symbol or price' }, { status: 400 });
    }

    const priceKey = `watchlist_${symbol}_price`;
    const prevPriceKey = `watchlist_${symbol}_prev_price`;
    const updatedKey = `watchlist_${symbol}_updated_at`;

    // Get current price to save as prev price
    const currentPriceSetting = await prisma.appSettings.findUnique({
      where: { key: priceKey }
    });

    const prevPrice = currentPriceSetting ? currentPriceSetting.value : price.toString();

    // Upsert all three keys
    await prisma.$transaction([
      prisma.appSettings.upsert({
        where: { key: prevPriceKey },
        update: { value: prevPrice },
        create: { key: prevPriceKey, value: prevPrice }
      }),
      prisma.appSettings.upsert({
        where: { key: priceKey },
        update: { value: price.toString() },
        create: { key: priceKey, value: price.toString() }
      }),
      prisma.appSettings.upsert({
        where: { key: updatedKey },
        update: { value: new Date().toISOString() },
        create: { key: updatedKey, value: new Date().toISOString() }
      })
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
