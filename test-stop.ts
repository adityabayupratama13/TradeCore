import { prisma } from './src/lib/prisma';
import { sendTelegramAlert } from './src/lib/telegram';

async function stop() {
  await prisma.appSettings.upsert({
     where: { key: 'engine_status' },
     update: { value: 'STOPPED' },
     create: { key: 'engine_status', value: 'STOPPED' }
  });
  console.log("DB setting updated to STOPPED.");
  await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "🛑 ENGINE EMERGENCY STOPPED\nWin rate 35.7%, R/R 0.64 — negative EV detected.\nManual review required before restart." } } as any);
  console.log("Telegram alert sent.");
}
stop();
