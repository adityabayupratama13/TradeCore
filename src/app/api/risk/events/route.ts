import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const type = searchParams.get('type') || 'ALL';
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause = type !== 'ALL' ? { eventType: type } : {};

    const [events, total] = await Promise.all([
      prisma.riskEvent.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      }),
      prisma.riskEvent.count({ where: whereClause })
    ]);

    return NextResponse.json({ events, total, pages: Math.ceil(total / limit), currentPage: page });
  } catch (error) {
    console.error('API /risk/events error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
