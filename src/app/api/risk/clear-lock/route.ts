import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function POST() {
  try {
    await prisma.appSettings.upsert({
      where: { key: 'circuit_breaker_lock_until' },
      update: { value: '' },
      create: { key: 'circuit_breaker_lock_until', value: '' }
    });
    return NextResponse.json({ success: true, message: 'Lock cleared' });
  } catch (error) {
    console.error('Clear lock error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
