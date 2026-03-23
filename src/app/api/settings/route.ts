import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    const setting = await prisma.appSettings.findUnique({ where: { key } });
    return NextResponse.json({ key, value: setting?.value ?? null });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { key, value } = await req.json();
    if (!key || value === undefined) return NextResponse.json({ error: 'Missing key/value' }, { status: 400 });

    await prisma.appSettings.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) }
    });

    // Saat simulated capital diaktifkan (value > 0), reset risk baseline
    if (key === 'simulated_capital_usd' && parseFloat(String(value)) > 0) {
      const now = new Date().toISOString();
      // Simpan waktu aktivasi — circuit breaker hanya hitung loss setelah ini
      await prisma.appSettings.upsert({
        where: { key: 'simulated_capital_activated_at' },
        update: { value: now },
        create: { key: 'simulated_capital_activated_at', value: now }
      });
      // Clear circuit breaker lock agar trading bisa langsung resume
      await prisma.appSettings.deleteMany({ where: { key: 'circuit_breaker_lock_until' } });
      console.log(`🎭 [Simulated Capital] Activated at ${now} — risk baseline reset, circuit breaker cleared`);
    }

    // Jika simulated capital di-nonaktifkan (value = 0), hapus baseline juga
    if (key === 'simulated_capital_usd' && parseFloat(String(value)) === 0) {
      await prisma.appSettings.deleteMany({ where: { key: 'simulated_capital_activated_at' } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
