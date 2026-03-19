import { prisma } from '../../lib/prisma';
import { getPositions, closePosition } from './binance';
import { startEngine, stopEngine, getEngineStatus } from './engineScheduler';

interface TelegramMessage {
  type: 'LOCK' | 'WARNING' | 'TRADE_OPEN' | 'TRADE_CLOSE' | 'DAILY_SUMMARY' | 'TEST' | 'DRAWDOWN_WARNING' | 'TRIGGER_FIRED' | 'AI_SIGNAL' | 'AI_SKIP' | 'BREAKEVEN_MOVE' | 'PARTIAL_TP' | 'SESSION_CLOSE' | 'RAW_MESSAGE';
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

    // Check if this type of notification is enabled
    if (message.type === 'LOCK' && !config.circuitBreaker) return false;
    if (message.type === 'WARNING' && !config.riskWarning) return false;
    if (message.type === 'TRADE_OPEN' && !config.tradeOpen) return false;
    if (message.type === 'TRADE_CLOSE' && !config.tradeClose) return false;
    if (message.type === 'DAILY_SUMMARY' && !config.dailySummary) return false;
    if (message.type === 'DRAWDOWN_WARNING' && !config.drawdownWarning) return false;

    let text = '';
    const d = message.data;

    switch (message.type) {
      case 'TEST':
        text = '✅ TradeCore connected. Risk alerts active.';
        break;
      case 'LOCK':
        text = `🔒 TRADECORE — TRADING LOCKED\nCapital: IDR ${d.capital}\nReason: Daily loss limit ${d.limit}% reached\nCurrent loss: -${d.lossPct}%\nUnlocks: ${d.unlockTime} WIB\n→ Review your journal now.`;
        break;
      case 'WARNING':
        text = `⚠️ TRADECORE — RISK WARNING\n${d.warningType} at ${d.currentPct}% of ${d.limitPct}% limit\nRemaining: IDR ${d.remaining}\nBe careful with next trades.`;
        break;
      case 'TRIGGER_FIRED':
        text = `⚡ TRIGGER DETECTED\n${d.symbol} — ${d.triggerType}\nStrength: ${'⭐'.repeat(d.strength)}/3\n🤖 AI analyzing now...`;
        break;
      case 'AI_SIGNAL':
        text = `🤖 AI SIGNAL — ${d.confidence}% confidence\n${d.action} ${d.symbol}\nEntry: ${d.entryPrice}\nSL: ${d.stopLoss} | TP: ${d.takeProfit}\nR/R: 1:${d.riskReward} | ${d.leverage}x lev\n⏱ Est. duration: ${d.estimated_duration || 'N/A'}\n⚙️ Executing order...`;
        break;
      case 'AI_SKIP':
        text = `🔍 AI ANALYZED — SKIP\n${d.symbol} — ${d.confidence}% confidence\nReason: ${d.reasoning}`;
        break;
      case 'BREAKEVEN_MOVE':
        text = `🛡️ BREAKEVEN SECURED\n${d.symbol} ${d.direction}\nSL moved to entry price\nDownside: ZERO | TP still: ${d.takeProfit}\nCurrent profit: +${d.currentPnl}%`;
        break;
      case 'PARTIAL_TP':
        text = `💰 PARTIAL PROFIT LOCKED\n${d.symbol} — 50% position closed\nProfit taken: +${d.partialPnl} IDR (+${d.partialPct}%)\nRemaining 50% → running to TP: ${d.takeProfit}`;
        break;
      case 'SESSION_CLOSE':
        text = `⏰ SESSION CLOSE — SECURED\n${d.symbol} ${d.direction} closed\nReason: ${d.reason}\nP&L: ${d.pnl >= 0 ? '+' : ''}${d.pnl} IDR (${d.pnlPct}%)\nDuration: ${d.holdDuration}`;
        break;
      case 'TRADE_OPEN':
        text = `📈 TRADE OPENED\n${d.direction} ${d.symbol} @ ${d.entryPrice || d.price}\nSize: ${d.size} | Lev: ${d.leverage}x\nSL: ${d.sl || d.stopLoss} | TP: ${d.tp || d.takeProfit}\nR/R: 1:${d.rr || d.riskReward}\nEst. profit if TP: +${d.estProfit} IDR\nEst. loss if SL: -${d.estLoss} IDR`;
        break;
      case 'TRADE_CLOSE':
        text = `${d.pnl >= 0 ? '✅' : '❌'} TRADE CLOSED\n${d.direction} ${d.symbol}\nEntry: ${d.entry || d.entryPrice} → Exit: ${d.exit || d.exitPrice}\nP&L: ${d.pnl >= 0 ? '+' : ''}${d.pnl} IDR (${d.pnlPct}%)\nDuration: ${d.holdDuration}\nReason: ${d.closeReason || d.reason}`;
        break;
      case 'DAILY_SUMMARY':
        text = `📊 DAILY SUMMARY — ${d.dateWIB || d.date}\n━━━━━━━━━━━━━━\nTrades: ${d.totalTrades || d.total} (${d.wins}W / ${d.losses}L)\nWin Rate: ${d.winRate}%\nNet P&L: ${d.netPnl >= 0 ? '+' : ''}${d.netPnl} IDR (${d.netPct || d.pnlPct}%)\nBest: +${d.bestTrade} IDR | Worst: ${d.worstTrade} IDR\nDrawdown: ${d.drawdown}%\n━━━━━━━━━━━━━━\nStatus: ${d.statusEmoji} ${d.status}\nCapital: Rp ${d.totalCapital || d.capital}`;
        break;
      case 'RAW_MESSAGE':
        text = d.text;
        break;
    }

    if (!text) return false;

    // Send to Telegram API
    const url = `https://api.telegram.org/bot${botToken.value}/sendMessage`;
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

let lastUpdateId = 0;
let telegramListenerTimer: NodeJS.Timeout | null = null;

export async function startTelegramListener() {
   if (telegramListenerTimer) return;
   
   const run = async () => {
      try {
         const botToken = await prisma.appSettings.findUnique({ where: { key: 'telegram_bot_token' } });
         const chatId = await prisma.appSettings.findUnique({ where: { key: 'telegram_chat_id' } });
         if (!botToken?.value || !chatId?.value) return;

         const url = `https://api.telegram.org/bot${botToken.value}/getUpdates?offset=${lastUpdateId}&timeout=0`;
         const res = await fetch(url);
         const json = await res.json();
         if (json.ok && json.result.length > 0) {
            for (const update of json.result) {
               lastUpdateId = update.update_id + 1;
               const msg = update.message;
               if (msg && msg.text && msg.chat.id.toString() === chatId.value) {
                  const cmd = msg.text.trim();
                  if (cmd === '/stop') {
                     stopEngine();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "🛑 Engine stopped by user command" } } as any);
                  } else if (cmd === '/start') {
                     startEngine();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "✅ Engine started by user command" } } as any);
                  } else if (cmd === '/status') {
                     const st = getEngineStatus();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `Engine IsRunning: ${st.isRunning}` } } as any);
                  } else if (cmd === '/positions') {
                     const pos = await getPositions();
                     if (pos.length === 0) {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "No open positions." } } as any);
                     } else {
                        const txt = pos.map((p:any) => `${p.symbol}: ${p.positionAmt > 0 ? 'LONG' : 'SHORT'} | PnL: ${p.unrealizedProfit}`).join('\n');
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "Open Positions:\n" + txt } } as any);
                     }
                  } else if (cmd === '/close_all') {
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: "⚠️ Closing all positions..." } } as any);
                     const pos = await prisma.trade.findMany({ where: { status: 'OPEN' } });
                     for (const p of pos) {
                        await closePosition(p.symbol, p.quantity);
                        await prisma.trade.update({ where: { id: p.id }, data: { status: 'CLOSED' } });
                     }
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `✅ All ${pos.length} positions closed via API.` } } as any);
                  } else if (cmd === '/pause_2h') {
                     stopEngine();
                     const resumeTime = new Date(Date.now() + 2 * 3600000);
                     const timeStr = resumeTime.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: `⏸️ Engine paused until ${timeStr} WIB` } } as any);
                     setTimeout(() => { startEngine(); }, 2 * 3600000);
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
