import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET() {
  try {
    const setting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
    return NextResponse.json({ success: true, version: setting?.value || 'v1' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { version } = await req.json();
    
    if (version !== 'v1' && version !== 'v2' && version !== 'v3') {
      return NextResponse.json({ success: false, error: 'Invalid version' }, { status: 400 });
    }

    await prisma.appSettings.upsert({
      where: { key: 'engine_version' },
      update: { value: version },
      create: { key: 'engine_version', value: version }
    });
    
    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
