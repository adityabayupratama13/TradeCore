import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getModeConfig, TRADING_MODES } from '../../../../lib/tradingModes';
import { sendTelegramAlert } from '../../../../lib/telegram';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, confirmed } = body;

    if (!mode || !TRADING_MODES[mode]) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const config = getModeConfig(mode);

    if (mode === 'DEGEN' && !confirmed) {
      return NextResponse.json({
        requiresConfirmation: true,
        message: 'DEGEN mode requires explicit confirmation'
      });
    }

    // Attempt to update env file automatically as per rules for SAFE mode
    if (mode === 'SAFE') {
      try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          envContent = envContent.replace(/ENGINE_TEST_MODE=.*/g, 'ENGINE_TEST_MODE=false');
          envContent = envContent.replace(/MAX_CONCURRENT_POSITIONS=.*/g, 'MAX_CONCURRENT_POSITIONS=3');
          fs.writeFileSync(envPath, envContent);
        }
      } catch (err) {
        console.error("Failed to update env automatically:", err);
      }
    }

    await prisma.riskRule.updateMany({
      where: { isActive: true },
      data: {
        activeMode: mode,
        ...config.settings
      }
    });

    try {
      await sendTelegramAlert({
        type: 'MODE_CHANGED',
        data: { newMode: mode, badge: config.badge, description: config.description, settings: config.settings }
      });
    } catch(err) {
      console.error("Skipped TG notification");
    }

    return NextResponse.json({ success: true, mode, settings: config.settings });
  } catch (error) {
    console.error('API /risk/mode error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
