import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { botToken, chatId, config, summaryTime } = body;

    if (botToken !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: 'telegram_bot_token' },
        update: { value: botToken },
        create: { key: 'telegram_bot_token', value: botToken }
      });
    }

    if (chatId !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: 'telegram_chat_id' },
        update: { value: chatId },
        create: { key: 'telegram_chat_id', value: chatId }
      });
    }

    if (config !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: 'telegram_notifications_config' },
        update: { value: JSON.stringify(config) },
        create: { key: 'telegram_notifications_config', value: JSON.stringify(config) }
      });
    }

    if (summaryTime !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: 'telegram_summary_time' },
        update: { value: summaryTime },
        create: { key: 'telegram_summary_time', value: summaryTime }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API /settings/notifications error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const [token, chat, configRaw, time] = await Promise.all([
      prisma.appSettings.findUnique({ where: { key: 'telegram_bot_token' } }),
      prisma.appSettings.findUnique({ where: { key: 'telegram_chat_id' } }),
      prisma.appSettings.findUnique({ where: { key: 'telegram_notifications_config' } }),
      prisma.appSettings.findUnique({ where: { key: 'telegram_summary_time' } })
    ]);

    return NextResponse.json({
      botToken: token?.value || '',
      chatId: chat?.value || '',
      config: configRaw ? JSON.parse(configRaw.value) : {
        circuitBreaker: true,
        riskWarning: true,
        tradeOpen: true,
        tradeClose: true,
        dailySummary: true,
        drawdownWarning: true
      },
      summaryTime: time?.value || '17:00'
    });
  } catch(error) {
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
