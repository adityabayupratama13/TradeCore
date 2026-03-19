import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import fs from 'fs';
import path from 'path';

export async function POST() {
   try {
      const results: Record<string, boolean> = {
         binance: false, 
         openrouter: false, 
         telegram: false, 
         sqlite: false,
         riskRules: false, 
         portfolio: false, 
         circuitBreaker: true,
         demoTrades: false, 
         backup: false
      };

      try {
         const res = await fetch(`${process.env.BINANCE_BASE_URL}/fapi/v1/ping`);
         results.binance = res.ok;
      } catch(e) {}

      try {
         const res = await fetch(`${process.env.OPENROUTER_BASE_URL}/models`);
         results.openrouter = res.ok;
      } catch(e) {}

      try {
         const token = await prisma.appSettings.findUnique({ where: { key: 'telegram_bot_token' } });
         if (token?.value) {
            const res = await fetch(`https://api.telegram.org/bot${token.value}/getMe`);
            results.telegram = res.ok;
         }
      } catch(e) {}

      try {
         await prisma.appSettings.upsert({ where: { key: 'sys_check' }, update: { value: 'ok' }, create: { key: 'sys_check', value: 'ok' } });
         results.sqlite = true;
      } catch(e) {}

      const rulesCount = await prisma.riskRule.count();
      results.riskRules = rulesCount > 0;

      const port = await prisma.portfolio.findFirst();
      if (port && port.totalCapital > 0) results.portfolio = true;

      const tradesCount = await prisma.trade.count();
      results.demoTrades = tradesCount > 0;

      try {
         const backupsDir = path.join(process.cwd(), 'backups');
         if (fs.existsSync(backupsDir)) {
             results.backup = true;
         } else {
             const setting = await prisma.appSettings.findUnique({ where: { key: 'backup_enabled' } });
             results.backup = setting?.value === 'true';
         }
      } catch(e) {}

      return NextResponse.json(results);
   } catch(e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
   }
}
