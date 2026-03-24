import { prisma } from '../../lib/prisma';
import { getPositions, closePosition } from './binance';
import { startEngine, stopEngine, getEngineStatus } from './engineScheduler';

interface TelegramMessage {
  type: 'LOCK' | 'TARGET_REACHED' | 'WARNING' | 'TRADE_OPEN' | 'TRADE_CLOSE' | 'DAILY_SUMMARY' | 'TEST' | 'DRAWDOWN_WARNING' | 'TRIGGER_FIRED' | 'AI_SIGNAL' | 'AI_SKIP' | 'BREAKEVEN_MOVE' | 'PARTIAL_TP' | 'SESSION_CLOSE' | 'RAW_MESSAGE' | 'PAIRS_UPDATED' | 'MODE_CHANGED' | 'MILESTONE_HIT' | 'FAST_SL_BLACKLIST';
  data: Record<string, any>;
}

export async function sendTelegramAlert(message: TelegramMessage): Promise<boolean> {
  try {
    const configRaw = await prisma.appSettings.findUnique({ where: { key: 'telegram_notifications_config' } });
    if (!configRaw?.value) return false;

    const botToken = await prisma.appSettings.findUnique({ where: { key: 'telegram_bot_token' } });
    const chatId = await prisma.appSettings.findUnique({ where: { key: 'telegram_chat_id' } });

    if (!botToken?.value || !chatId?.value) return false;

    const config = JSON.parse(configRaw.value);

    if (message.type === 'LOCK' && !config.circuitBreaker) return false;
    if (message.type === 'WARNING' && !config.riskWarning) return false;
    if (message.type === 'TRADE_OPEN' && !config.tradeOpen) return false;
    if (message.type === 'TRADE_CLOSE' && !config.tradeClose) return false;
    if (message.type === 'DAILY_SUMMARY' && !config.dailySummary) return false;
    if (message.type === 'DRAWDOWN_WARNING' && !config.drawdownWarning) return false;

    let text = '';
    const d = message.data;

    const dirEmoji = (dir: string) => dir === 'LONG' ? '🟢 LONG' : '🔴 SHORT';

    switch (message.type) {
      case 'TEST':
        text = '✅ TradeCore connected. Risk alerts active.';
        break;

      case 'LOCK':
        text = '🔒 TRADING LOCKED\n'
          + '━━━━━━━━━━━━━━\n'
          + '💰 Capital: $' + d.capital + '\n'
          + '📉 Loss: -' + d.lossPct + '% (limit ' + d.limit + '%)\n'
          + '⏰ Unlocks: ' + d.unlockTime + ' WIB\n'
          + '📋 Review journal sebelum restart.';
        break;

      case 'TARGET_REACHED':
        text = '🎯 DAILY TARGET REACHED!\n'
          + '━━━━━━━━━━━━━━\n'
          + '💰 Capital: $' + d.capital + '\n'
          + '💵 Profit: +$' + d.profitAmt + '\n'
          + '⏰ Unlocks: ' + d.unlockTime + ' WIB\n'
          + '🏖️ Enjoy your day!';
        break;

      case 'WARNING':
        text = '⚠️ RISK WARNING\n'
          + '━━━━━━━━━━━━━━\n'
          + '📊 ' + d.warningType + '\n'
          + '📉 ' + d.currentPct + '% dari limit ' + d.limitPct + '%\n'
          + '💵 Remaining: $' + d.remaining + '\n'
          + '🛑 Hati-hati dengan trade berikutnya.';
        break;

      case 'DRAWDOWN_WARNING':
        text = '🚨 DRAWDOWN WARNING\n'
          + '━━━━━━━━━━━━━━\n'
          + '📉 Drawdown: ' + d.drawdownPct + '%\n'
          + '💰 Capital: $' + d.capital + '\n'
          + '⚠️ Pertimbangkan reduce position size.';
        break;

      case 'MILESTONE_HIT':
        text = '🎯 MILESTONE ' + d.milestone + ' HIT!\n'
          + '━━━━━━━━━━━━━━\n'
          + dirEmoji(d.direction) + ' ' + d.symbol + '\n'
          + '📈 Profit: +' + d.profitPct + '%\n'
          + '⚡ Action: ' + d.action + '\n'
          + '📊 Sisa posisi: ' + (d.milestone === 1 ? '70%' : '40%') + '\n'
          + '🛡️ SL: ' + (d.milestone === 1 ? 'Moved to BEP ✅' : 'At BEP ✅');
        break;

      case 'FAST_SL_BLACKLIST':
        text = '⚡ FAST SL — BLACKLISTED\n'
          + '━━━━━━━━━━━━━━\n'
          + '💀 ' + d.symbol + ' hit SL dalam ' + d.holdMinutes + ' menit!\n'
          + '💸 Loss: -$' + d.loss + '\n'
          + '🚫 ' + d.symbol + ' banned hari ini\n'
          + '🔓 Resumes: ' + d.blacklistedUntil;
        break;

      case 'TRIGGER_FIRED':
        text = '⚡ TRIGGER DETECTED\n'
          + '━━━━━━━━━━━━━━\n'
          + '📊 ' + d.symbol + ' — ' + d.triggerType + '\n'
          + '💪 Strength: ' + d.strength + '/3\n'
          + '🤖 AI analyzing now...';
        break;

      case 'AI_SIGNAL': {
        const side = d.action === 'LONG' ? '🟢' : '🔴';
        text = '🤖 AI SIGNAL — ' + d.confidence + '% confidence\n'
          + '━━━━━━━━━━━━━━\n'
          + side + ' ' + d.action + ' ' + d.symbol + '\n'
          + '💵 Entry: ' + d.entryPrice + '\n'
          + '🛑 SL: ' + d.stopLoss + ' | 🎯 TP: ' + d.takeProfit + '\n'
          + '⚖️ R/R: 1:' + d.riskReward + ' | ' + d.leverage + 'x lev\n'
          + '⏳ Duration: ' + (d.estimated_duration || 'N/A') + '\n'
          + '✅ Executing order...';
        break;
      }

      case 'AI_SKIP':
        text = '🔍 AI ANALYZED — SKIP\n'
          + '━━━━━━━━━━━━━━\n'
          + '📊 ' + d.symbol + ' — ' + d.confidence + '% confidence\n'
          + '❌ Reason: ' + d.reasoning;
        break;

      case 'BREAKEVEN_MOVE':
        text = '🛡️ BREAKEVEN SECURED!\n'
          + '━━━━━━━━━━━━━━\n'
          + dirEmoji(d.direction) + ' ' + d.symbol + '\n'
          + '✅ SL moved to entry (BEP)\n'
          + '📉 Downside: ZERO\n'
          + '🎯 TP masih: ' + d.takeProfit + '\n'
          + '📈 Current profit: +' + d.currentPnl + '%';
        break;

      case 'PARTIAL_TP':
        text = '💰 PARTIAL PROFIT LOCKED!\n'
          + '━━━━━━━━━━━━━━\n'
          + dirEmoji(d.direction) + ' ' + d.symbol + '\n'
          + '📈 ROE partial: +' + d.partialPct + '%\n'
          + '💵 Profit: +$' + d.partialPnl + ' USD terkunci\n'
          + '🛡️ SL dipindah ke BEP ✅\n'
          + '🎯 Remaining -> TP: ' + d.takeProfit;
        break;

      case 'SESSION_CLOSE': {
        const pnlSign = parseFloat(d.pnlPct) >= 0 ? '+' : '';
        text = '⏰ SESSION CLOSE\n'
          + '━━━━━━━━━━━━━━\n'
          + dirEmoji(d.direction) + ' ' + d.symbol + '\n'
          + '📋 Reason: ' + d.reason + '\n'
          + '💵 P&L: ' + pnlSign + d.pnl + ' USD (' + pnlSign + d.pnlPct + '%)\n'
          + '⏱️ Duration: ' + d.holdDuration;
        break;
      }

      case 'TRADE_OPEN': {
        const side = (d.direction || '').includes('LONG') ? '🟢' : '🔴';
        text = side + ' TRADE OPENED\n'
          + '━━━━━━━━━━━━━━\n'
          + dirEmoji(d.direction) + ' ' + d.symbol + ' @ ' + (d.entryPrice || d.price) + '\n'
          + '📦 Size: ' + d.size + ' | ⚡ Lev: ' + d.leverage + 'x\n'
          + '🛑 SL: ' + (d.sl || d.stopLoss) + ' | 🎯 TP: ' + (d.tp || d.takeProfit) + '\n'
          + '⚖️ R/R: 1:' + (d.rr || d.riskReward) + '\n'
          + '💵 Est profit: +$' + d.estProfit + ' | Est loss: -$' + d.estLoss;
        break;
      }

      case 'TRADE_CLOSE': {
        const win = parseFloat(d.pnl) >= 0;
        text = (win ? '✅ TRADE WIN' : '❌ TRADE LOSS') + '\n'
          + '━━━━━━━━━━━━━━\n'
          + dirEmoji(d.direction) + ' ' + d.symbol + '\n'
          + '📊 Entry: ' + (d.entry || d.entryPrice) + ' → Exit: ' + (d.exit || d.exitPrice) + '\n'
          + '💵 P&L: ' + (win ? '+' : '') + d.pnl + ' USD (' + d.pnlPct + '%)\n'
          + '⏱️ Duration: ' + d.holdDuration + '\n'
          + '📋 Reason: ' + (d.closeReason || d.reason);
        break;
      }

      case 'DAILY_SUMMARY': {
        const netWin = parseFloat(d.netPnl) >= 0;
        text = '📊 DAILY SUMMARY — ' + (d.dateWIB || d.date) + '\n'
          + '━━━━━━━━━━━━━━\n'
          + '📈 Trades: ' + (d.totalTrades || d.total) + ' (' + d.wins + 'W / ' + d.losses + 'L)\n'
          + '🎯 Win Rate: ' + d.winRate + '%\n'
          + '💵 Net P&L: ' + (netWin ? '+' : '') + d.netPnl + ' USD (' + (d.netPct || d.pnlPct) + '%)\n'
          + '⬆️ Best: +$' + d.bestTrade + ' | ⬇️ Worst: $' + d.worstTrade + '\n'
          + '📉 Drawdown: ' + d.drawdown + '%\n'
          + '━━━━━━━━━━━━━━\n'
          + '💰 Capital: $' + (d.totalCapital || d.capital);
        break;
      }

      case 'PAIRS_UPDATED': {
        const pairLines = (d.activePairs || []).map((p: any, i: number) => {
          const bias = p.biasSide === 'SHORT' ? '🔴 SHORT' : '🟢 LONG';
          const sm = p.oiData?.topTraderLsRatio > 1.2 ? '🟢 Long' : p.oiData?.topTraderLsRatio < 0.8 ? '🔴 Short' : '⚪ Neutral';
          return (i + 1) + '. ' + p.symbol + ' — ' + bias + '\n'
            + '   💸 Funding: ' + (p.fundingRate * 100).toFixed(4) + '% ' + p.fundingCategory + '\n'
            + '   📊 OI: ' + p.oiValue + ' (' + p.oiChange1h + ' 1h)\n'
            + '   📡 Signal: ' + (p.oiSignal?.type || 'UNKNOWN') + '\n'
            + '   🐋 Smart $: ' + sm;
        }).join('\n');
        text = '🦅 DYNAMIC HUNTER — UPDATE\n'
          + '━━━━━━━━━━━━━━━━━━━\n'
          + pairLines + '\n'
          + '━━━━━━━━━━━━━━━━━━━\n'
          + '🟢 = Long bias | 🔴 = Short bias';
        break;
      }

      case 'MODE_CHANGED':
        text = '🔄 TRADING MODE CHANGED\n'
          + '━━━━━━━━━━━━━━\n'
          + (d.badge || '') + '\n'
          + '📋 ' + d.description + '\n'
          + '━━━━━━━━━━━━━━\n'
          + '⚖️ Risk/trade: ' + d.settings?.riskPctLargeCap + '% (BTC)\n'
          + '⚡ Leverage: ' + d.settings?.leverageLargeCap + 'x (BTC)\n'
          + '📦 Max positions: ' + d.settings?.maxOpenPositions + '\n'
          + '🎯 Min confidence: ' + d.settings?.minConfidence + '%\n'
          + '━━━━━━━━━━━━━━\n'
          + '✅ Engine adapts immediately.';
        break;

      case 'RAW_MESSAGE':
        text = d.text;
        break;
    }

    if (!text) return false;

    const url = 'https://api.telegram.org/bot' + botToken.value + '/sendMessage';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId.value, text })
    });

    return res.ok;
  } catch (error) {
    console.error('Telegram send alert failed:', error);
    return false;
  }
}

var telegramListenerTimer: NodeJS.Timeout | null = null;

export async function startTelegramListener() {
   if (telegramListenerTimer) return;

   const run = async () => {
      try {
         const botToken = await prisma.appSettings.findUnique({ where: { key: 'telegram_bot_token' } });
         const chatId = await prisma.appSettings.findUnique({ where: { key: 'telegram_chat_id' } });
         if (!botToken?.value || !chatId?.value) return;

         // FIX: Persist lastUpdateId to DB to survive hot-reload & prevent duplicate message processing
         const updateIdSetting = await prisma.appSettings.findUnique({ where: { key: 'tg_last_update_id' } });
         const lastUpdateId = parseInt(updateIdSetting?.value || '0');

         const url = 'https://api.telegram.org/bot' + botToken.value + '/getUpdates?offset=' + lastUpdateId + '&timeout=0';
         const res = await fetch(url);
         const json = await res.json();
         if (json.ok && json.result.length > 0) {
            for (const update of json.result) {
               const newUpdateId = update.update_id + 1;
               // Save to DB immediately so even if crash during processing, won't re-process
               await prisma.appSettings.upsert({
                 where: { key: 'tg_last_update_id' },
                 update: { value: newUpdateId.toString() },
                 create: { key: 'tg_last_update_id', value: newUpdateId.toString() }
               });
               const msg = update.message;
               if (msg && msg.text && msg.chat.id.toString() === chatId.value) {
                  const cmd = msg.text.trim();
                  if (cmd === '/stop') {
                     stopEngine();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '🛑 Engine stopped by user command' } } as any);
                  } else if (cmd === '/start') {
                     startEngine();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '✅ Engine started by user command' } } as any);
                  } else if (cmd.startsWith('/set_target ')) {
                     const val = parseFloat(cmd.replace('/set_target ', '').trim());
                     if (!isNaN(val) && val > 0) {
                        await prisma.appSettings.upsert({ where: { key: 'daily_profit_target_usd' }, update: { value: String(val) }, create: { key: 'daily_profit_target_usd', value: String(val) }});
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '🎯 Daily profit target set to $' + val.toFixed(2) } } as any);
                     } else {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '❌ Invalid amount' } } as any);
                     }
                  } else if (cmd === '/status') {
                     const st = getEngineStatus();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: (st.isRunning ? '✅' : '🛑') + ' Engine: ' + (st.isRunning ? 'RUNNING' : 'STOPPED') } } as any);
                  } else if (cmd === '/positions') {
                     const pos = await getPositions();
                     if (pos.length === 0) {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '📭 No open positions.' } } as any);
                     } else {
                        const txt = pos.map((p: any) => (p.positionAmt > 0 ? '🟢' : '🔴') + ' ' + p.symbol + ' | PnL: ' + parseFloat(p.unrealizedProfit).toFixed(2) + ' USD').join('\n');
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '📊 Open Positions:\n━━━━━━━━━━━━\n' + txt } } as any);
                     }
                  } else if (cmd === '/close_all') {
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '⚠️ Closing all positions...' } } as any);
                     const pos = await prisma.trade.findMany({ where: { status: 'OPEN' } });
                     for (const p of pos) {
                        await closePosition(p.symbol, p.quantity);
                        await prisma.trade.update({ where: { id: p.id }, data: { status: 'CLOSED' } });
                     }
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '✅ All ' + pos.length + ' positions closed.' } } as any);
                  } else if (cmd === '/pause_2h') {
                     stopEngine();
                     const resumeTime = new Date(Date.now() + 2 * 3600000);
                     const timeStr = resumeTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '⏸️ Engine paused until ' + timeStr + ' WIB' } } as any);
                     setTimeout(() => { startEngine(); }, 2 * 3600000);
                  } else if (cmd.startsWith('/set_hold ')) {
                     const hrs = parseInt(cmd.replace('/set_hold ', '').trim());
                     if (!isNaN(hrs) && hrs >= 1 && hrs <= 72) {
                        await prisma.appSettings.upsert({ where: { key: 'max_hold_hours' }, update: { value: String(hrs) }, create: { key: 'max_hold_hours', value: String(hrs) }});
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '⏱️ Max hold set to ' + hrs + ' hours' } } as any);
                     } else {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '❌ Invalid. Use 1-72.\nExample: /set_hold 16' } } as any);
                     }
                  } else if (cmd === '/daily') {
                     // Today P&L summary (WIB timezone)
                     const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                     const startWIB = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
                     startWIB.setHours(startWIB.getHours() - 7);
                     const todayTrades = await prisma.trade.findMany({
                       where: { entryAt: { gte: startWIB }, status: { not: 'CANCELLED' } }
                     });
                     const closed = todayTrades.filter((t: any) => t.status === 'CLOSED');
                     const open = todayTrades.filter((t: any) => t.status === 'OPEN');
                     const wins = closed.filter((t: any) => (t.pnl || 0) > 0).length;
                     const losses = closed.filter((t: any) => (t.pnl || 0) <= 0).length;
                     const totalPnl = closed.reduce((s: number, t: any) => s + (t.pnl || 0), 0);
                     const partialLogs = await prisma.engineLog.findMany({
                       where: { action: 'PARTIAL_CLOSE', createdAt: { gte: startWIB } }
                     });
                     const partialPnl = partialLogs.reduce((s: number, l: any) => {
                       const m = (l.reason || '').match(/Realized PnL: \+?\$?([\d.]+)/);
                       return s + (m ? parseFloat(m[1]) : 0);
                     }, 0);
                     const totalRealized = totalPnl + partialPnl;
                     const winRate = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(0) : '0';
                     const lines = [
                       '📊 TODAY\'S P&L — ' + nowWIB.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
                       '━━━━━━━━━━━━━━',
                       '📈 Total Trades: ' + todayTrades.length + ' (' + closed.length + ' closed, ' + open.length + ' open)',
                       '✅ Win: ' + wins + ' | ❌ Loss: ' + losses + ' | 🎯 Win Rate: ' + winRate + '%',
                       '💵 Closed P&L: ' + (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2) + ' USD',
                       '💰 Partial Locked: +' + partialPnl.toFixed(2) + ' USD',
                       '━━━━━━━━━━━━━━',
                       '🏆 Total Realized: ' + (totalRealized >= 0 ? '+' : '') + totalRealized.toFixed(2) + ' USD'
                     ];
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);

                  } else if (cmd === '/capital') {
                     const portfolio = await prisma.portfolio.findFirst();
                     const riskRule = await prisma.riskRule.findFirst({ where: { isActive: true } });
                     const cbLock = await prisma.appSettings.findUnique({ where: { key: 'circuit_breaker_lock_until' } });
                     const locked = cbLock?.value && new Date(cbLock.value) > new Date();
                     const lines = [
                       '💰 CAPITAL OVERVIEW',
                       '━━━━━━━━━━━━━━',
                       '💵 Total Capital: $' + (portfolio?.totalCapital || 0).toFixed(2),
                       '🎮 Mode: ' + (riskRule?.activeMode || 'SAFE'),
                       '📉 Max Drawdown: ' + (riskRule?.maxDrawdownPct || 0) + '%',
                       '🔒 Circuit Breaker: ' + (locked ? 'LOCKED until ' + new Date(cbLock!.value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '✅ OPEN'),
                       '📦 Max Positions: ' + (riskRule?.maxOpenPositions || 5),
                       '🎯 Min Confidence: ' + (riskRule?.minConfidence || 65) + '%'
                     ];
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);

                  } else if (cmd === '/target') {
                     const targetSetting = await prisma.appSettings.findUnique({ where: { key: 'daily_profit_target_usd' } });
                     const target = parseFloat(targetSetting?.value || '350');
                     const nowWIB2 = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                     const startWIB2 = new Date(nowWIB2.getFullYear(), nowWIB2.getMonth(), nowWIB2.getDate());
                     startWIB2.setHours(startWIB2.getHours() - 7);
                     const closedToday = await prisma.trade.findMany({ where: { exitAt: { gte: startWIB2 }, status: 'CLOSED' } });
                     const pnlClosed = closedToday.reduce((s: number, t: any) => s + (t.pnl || 0), 0);
                     const partialLogs2 = await prisma.engineLog.findMany({ where: { action: 'PARTIAL_CLOSE', createdAt: { gte: startWIB2 } } });
                     const pnlPartial = partialLogs2.reduce((s: number, l: any) => {
                       const m = (l.reason || '').match(/Realized PnL: \+?\$?([\d.]+)/);
                       return s + (m ? parseFloat(m[1]) : 0);
                     }, 0);
                     const realized = pnlClosed + pnlPartial;
                     const pct = Math.min(Math.round((realized / target) * 100), 100);
                     const filled = Math.round(pct / 10);
                     const bar = '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '] ' + pct + '%';
                     const lines = [
                       '🎯 DAILY TARGET PROGRESS',
                       '━━━━━━━━━━━━━━',
                       '📊 ' + bar,
                       '💵 Realized: $' + realized.toFixed(2) + ' / $' + target.toFixed(2),
                       '📉 Remaining: $' + Math.max(target - realized, 0).toFixed(2),
                       realized >= target ? '🏆 TARGET REACHED! Engine locked.' : '⚡ Keep going!'
                     ];
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);

                  } else if (cmd === '/mode') {
                     const riskRule2 = await prisma.riskRule.findFirst({ where: { isActive: true } });
                     const verSetting = await prisma.appSettings.findUnique({ where: { key: 'engine_version' } });
                     const holdSetting = await prisma.appSettings.findUnique({ where: { key: 'max_hold_hours' } });
                     const lines = [
                       '🎮 ACTIVE MODE: ' + (riskRule2?.activeMode || 'SAFE'),
                       '━━━━━━━━━━━━━━',
                       '🤖 AI Engine: ' + ((verSetting?.value || 'v1').toUpperCase()),
                       '⏱️ Max Hold Profit: ' + (holdSetting?.value || '16') + ' jam',
                       '📦 Max Positions: ' + (riskRule2?.maxOpenPositions || 5),
                       '🎯 Min Confidence: ' + (riskRule2?.minConfidence || 65) + '%',
                       '━━━━━━━━━━━━━━',
                       '📊 Risk Per Trade:',
                       '  🔵 Large Cap (BTC/ETH): ' + (riskRule2?.riskPctLargeCap || 3) + '%',
                       '  🟣 Mid Cap: ' + (riskRule2?.riskPctMidCap || 3) + '%',
                       '  🟠 Low Cap: ' + (riskRule2?.riskPctLowCap || 3) + '%',
                       '⚡ Leverage:',
                       '  🔵 Large Cap: ' + (riskRule2?.leverageLargeCap || 5) + 'x',
                       '  🟣 Mid Cap: ' + (riskRule2?.leverageMidCap || 8) + 'x',
                       '  🟠 Low Cap: ' + (riskRule2?.leverageLowCap || 10) + 'x',
                       '━━━━━━━━━━━━━━',
                       '🛑 Daily Loss Limit: ' + (riskRule2?.maxDailyLossPct || 10) + '%',
                       '🎯 Min TP Target: ' + (riskRule2?.minProfitTargetPct || 6) + '% capital'
                     ];
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);

                  } else if (cmd === '/hunter') {
                     const hunterSetting = await prisma.appSettings.findUnique({ where: { key: 'active_trading_pairs' } });
                     if (!hunterSetting?.value) {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '🦅 Hunter belum scan. Engine perlu running.' } } as any);
                     } else {
                        const pairs = JSON.parse(hunterSetting.value);
                        const pairLines = pairs.slice(0, 15).map((p: any, i: number) => {
                          const bias = p.biasSide === 'SHORT' ? '🔴' : '🟢';
                          return (i + 1) + '. ' + bias + ' ' + p.symbol + ' — Funding: ' + ((p.fundingRate || 0) * 100).toFixed(3) + '%';
                        }).join('\n');
                        const lines = [
                          '🦅 DYNAMIC HUNTER — Active Pairs',
                          '━━━━━━━━━━━━━━',
                          pairLines,
                          '━━━━━━━━━━━━━━',
                          '🟢 = Long bias | 🔴 = Short bias',
                          '📊 Total: ' + pairs.length + ' pairs aktif'
                        ];
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);
                     }

                  } else if (cmd.startsWith('/signals') || cmd === '/signals') {
                     const n = parseInt((cmd.split(' ')[1] || '5').trim()) || 5;
                     const signals = await prisma.tradeSignalHistory.findMany({
                       orderBy: { createdAt: 'desc' },
                       take: Math.min(n, 10)
                     });
                     if (signals.length === 0) {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '📭 Belum ada sinyal AI.' } } as any);
                     } else {
                        const sigLines = signals.map((s: any, i: number) => {
                          const side = s.action === 'LONG' ? '🟢' : s.action === 'SHORT' ? '🔴' : '⚪';
                          const ex = s.wasExecuted ? '✅' : '⏭️';
                          return (i + 1) + '. ' + side + ' ' + s.symbol + ' (' + s.confidence + '%) ' + ex;
                        }).join('\n');
                        const lines = [
                          '🤖 LAST ' + signals.length + ' AI SIGNALS',
                          '━━━━━━━━━━━━━━',
                          sigLines,
                          '━━━━━━━━━━━━━━',
                          '✅ = Executed | ⏭️ = Skipped'
                        ];
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);
                     }

                  } else if (cmd.startsWith('/logs') || cmd === '/logs') {
                     const n2 = parseInt((cmd.split(' ')[1] || '5').trim()) || 5;
                     const logs = await prisma.engineLog.findMany({
                       orderBy: { createdAt: 'desc' },
                       take: Math.min(n2, 10)
                     });
                     if (logs.length === 0) {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '📭 Belum ada engine logs.' } } as any);
                     } else {
                        const logLines = logs.map((l: any) => {
                          const icon = l.result === 'EXECUTED' ? '✅' : l.result === 'IGNORED' ? '⏭️' : l.result === 'BLOCKED' ? '🚫' : '📋';
                          const time = new Date(l.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
                          return icon + ' [' + time + '] ' + (l.symbol ? l.symbol + ' — ' : '') + l.action + ': ' + (l.reason || l.result || '');
                        }).join('\n');
                        const lines = [
                          '📋 SYSTEM LOGS (last ' + logs.length + ')',
                          '━━━━━━━━━━━━━━',
                          logLines
                        ];
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);
                     }

                  } else if (cmd === '/block') {
                     const nowWIB3 = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                     const startWIB3 = new Date(nowWIB3.getFullYear(), nowWIB3.getMonth(), nowWIB3.getDate());
                     startWIB3.setHours(startWIB3.getHours() - 7);
                     const blockedLogs = await prisma.engineLog.findMany({
                       where: { action: 'BLOCKED', createdAt: { gte: startWIB3 } },
                       orderBy: { createdAt: 'desc' }
                     });
                     const fastSLLogs = await prisma.engineLog.findMany({
                       where: { action: 'FAST_SL_BLACKLIST', createdAt: { gte: startWIB3 } }
                     });
                     const blockedSymbols = [...new Set([
                       ...blockedLogs.map((l: any) => l.symbol).filter(Boolean),
                       ...fastSLLogs.map((l: any) => l.symbol).filter(Boolean)
                     ])];
                     if (blockedSymbols.length === 0) {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: '✅ Tidak ada coin yang diblacklist hari ini.' } } as any);
                     } else {
                        const lines = [
                          '🚫 BLACKLISTED COINS HARI INI',
                          '━━━━━━━━━━━━━━',
                          blockedSymbols.map((s: string) => '• ' + s).join('\n'),
                          '━━━━━━━━━━━━━━',
                          'Total: ' + blockedSymbols.length + ' coin | Reset: 00:00 WIB'
                        ];
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);
                     }

                  } else if (cmd === '/risk') {
                     const riskRule3 = await prisma.riskRule.findFirst({ where: { isActive: true } });
                     const cbLock2 = await prisma.appSettings.findUnique({ where: { key: 'circuit_breaker_lock_until' } });
                     const isLocked = cbLock2?.value && new Date(cbLock2.value) > new Date();
                     const nowWIB4 = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                     const startWIB4 = new Date(nowWIB4.getFullYear(), nowWIB4.getMonth(), nowWIB4.getDate());
                     startWIB4.setHours(startWIB4.getHours() - 7);
                     const portfolio2 = await prisma.portfolio.findFirst();
                     const capital = portfolio2?.totalCapital || 0;
                     const closedToday2 = await prisma.trade.findMany({ where: { exitAt: { gte: startWIB4 }, status: 'CLOSED' } });
                     const todayLoss = closedToday2.filter((t: any) => (t.pnl || 0) < 0).reduce((s: number, t: any) => s + (t.pnl || 0), 0);
                     const lossPct = capital > 0 ? Math.abs(todayLoss / capital * 100).toFixed(1) : '0';
                     const maxLoss = riskRule3?.maxDailyLossPct || 10;
                     const lines = [
                       '🛡️ RISK STATUS',
                       '━━━━━━━━━━━━━━',
                       '🔒 Circuit Breaker: ' + (isLocked ? 'LOCKED' : '✅ OPEN'),
                       isLocked ? '⏰ Unlock: ' + new Date(cbLock2!.value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '',
                       '━━━━━━━━━━━━━━',
                       '📉 Today Loss: -$' + Math.abs(todayLoss).toFixed(2) + ' (-' + lossPct + '%)',
                       '⚠️ Daily Limit: ' + maxLoss + '% ($' + (capital * maxLoss / 100).toFixed(2) + ')',
                       '📊 Weekly Limit: ' + (riskRule3?.maxWeeklyLossPct || 25) + '%',
                       '💀 Max Drawdown: ' + (riskRule3?.maxDrawdownPct || 40) + '%',
                       '━━━━━━━━━━━━━━',
                       todayLoss < 0 ? '⚠️ Gunakan /close_all jika perlu emergency exit!' : '✅ Risk dalam batas normal'
                     ].filter(Boolean);
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: lines.join('\n') } } as any);

                  } else if (cmd === '/help') {
                     const helpText = [
                       '🤖 TradeCore Bot — Commands',
                       '━━━━━━━━━━━━━━',
                       '📊 INFO & MONITORING',
                       '/daily — P&L hari ini (trades & profit)',
                       '/capital — Modal, mode, circuit breaker',
                       '/target — Progress profit target',
                       '/mode — Setting mode aktif',
                       '/risk — Status risk & circuit breaker',
                       '/positions — Posisi terbuka saat ini',
                       '/status — Engine running/stopped',
                       '',
                       '🦅 HUNTER & AI',
                       '/hunter — Pair aktif dari Dynamic Hunter',
                       '/signals [N] — N sinyal AI terbaru (default 5)',
                       '/logs [N] — N engine logs terbaru (default 5)',
                       '/block — Coin yang diblacklist hari ini',
                       '',
                       '⚙️ ENGINE CONTROL',
                       '/start — Nyalakan engine',
                       '/stop — Matikan engine (emergency)',
                       '/pause_2h — Pause 2 jam, auto-restart',
                       '',
                       '💰 SETTINGS',
                       '/set_target [USD] — Daily profit target',
                       '   Contoh: /set_target 50',
                       '/set_hold [jam] — Max hold profitable (1-72h)',
                       '   Contoh: /set_hold 16',
                       '',
                       '🚨 EMERGENCY',
                       '/close_all — Close SEMUA posisi'
                     ].join('\n');
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: helpText } } as any);
                  }

               }
            }
         }
      } catch (err) {
         console.error('Telegram listener error', err);
      } finally {
         telegramListenerTimer = setTimeout(run, 60_000);
      }
   };
   run();
}
