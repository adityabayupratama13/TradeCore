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

    switch (message.type) {
      case 'TEST':
        text = 'TradeCore connected. Risk alerts active.';
        break;
      case 'LOCK':
        text = 'TRADECORE TRADING LOCKED\nCapital: USD ' + d.capital + '\nReason: Daily loss limit ' + d.limit + '% reached\nCurrent loss: -' + d.lossPct + '%\nUnlocks: ' + d.unlockTime + ' WIB';
        break;
      case 'TARGET_REACHED':
        text = 'TRADECORE DAILY TARGET REACHED\nCapital: USD ' + d.capital + '\nToday Profit: +$' + d.profitAmt + '\nUnlocks: ' + d.unlockTime + ' WIB';
        break;
      case 'WARNING':
        text = 'TRADECORE RISK WARNING\n' + d.warningType + ' at ' + d.currentPct + '% of ' + d.limitPct + '% limit\nRemaining: USD ' + d.remaining;
        break;
      case 'MILESTONE_HIT':
        text = 'MILESTONE ' + d.milestone + ' HIT\n' + d.symbol + ' ' + d.direction + '\nProfit: +' + d.profitPct + '%\nAction: ' + d.action + '\nRemaining: ' + (d.milestone === 1 ? '70%' : '40%') + '\nSL: ' + (d.milestone === 1 ? 'Moved to BEP' : 'At BEP');
        break;
      case 'FAST_SL_BLACKLIST':
        text = 'FAST SL BLACKLISTED\n' + d.symbol + ' hit SL in ' + d.holdMinutes + ' minutes\nLoss: USD ' + d.loss + '\n' + d.symbol + ' banned for rest of today\nResumes: ' + d.blacklistedUntil;
        break;
      case 'TRIGGER_FIRED':
        text = 'TRIGGER DETECTED\n' + d.symbol + ' - ' + d.triggerType + '\nAI analyzing now...';
        break;
      case 'AI_SIGNAL':
        text = 'AI SIGNAL - ' + d.confidence + '% confidence\n' + d.action + ' ' + d.symbol + '\nEntry: ' + d.entryPrice + '\nSL: ' + d.stopLoss + ' | TP: ' + d.takeProfit + '\nR/R: 1:' + d.riskReward + ' | ' + d.leverage + 'x lev\nExecuting order...';
        break;
      case 'AI_SKIP':
        text = 'AI ANALYZED SKIP\n' + d.symbol + ' - ' + d.confidence + '% confidence\nReason: ' + d.reasoning;
        break;
      case 'BREAKEVEN_MOVE':
        text = 'BREAKEVEN SECURED\n' + d.symbol + ' ' + d.direction + '\nSL moved to entry price\nDownside: ZERO | TP still: ' + d.takeProfit + '\nCurrent profit: +' + d.currentPnl + '%';
        break;
      case 'PARTIAL_TP':
        text = 'PARTIAL PROFIT LOCKED\n' + d.symbol + ' ' + d.direction + '\nROE partial: +' + d.partialPct + '%\nProfit: +$' + d.partialPnl + ' USD\nSL dipindah ke BEP\nRemaining -> TP: ' + d.takeProfit;
        break;
      case 'SESSION_CLOSE':
        text = 'SESSION CLOSE SECURED\n' + d.symbol + ' ' + d.direction + ' closed\nReason: ' + d.reason + '\nP&L: ' + (d.pnl >= 0 ? '+' : '') + d.pnl + ' USD (' + d.pnlPct + '%)\nDuration: ' + d.holdDuration;
        break;
      case 'TRADE_OPEN':
        text = 'TRADE OPENED\n' + d.direction + ' ' + d.symbol + ' @ ' + (d.entryPrice || d.price) + '\nSize: ' + d.size + ' | Lev: ' + d.leverage + 'x\nSL: ' + (d.sl || d.stopLoss) + ' | TP: ' + (d.tp || d.takeProfit) + '\nR/R: 1:' + (d.rr || d.riskReward) + '\nEst profit if TP: +' + d.estProfit + ' USD';
        break;
      case 'TRADE_CLOSE':
        text = (d.pnl >= 0 ? 'TRADE CLOSED WIN' : 'TRADE CLOSED LOSS') + '\n' + d.direction + ' ' + d.symbol + '\nEntry: ' + (d.entry || d.entryPrice) + ' - Exit: ' + (d.exit || d.exitPrice) + '\nP&L: ' + (d.pnl >= 0 ? '+' : '') + d.pnl + ' USD (' + d.pnlPct + '%)\nDuration: ' + d.holdDuration;
        break;
      case 'DAILY_SUMMARY':
        text = 'DAILY SUMMARY - ' + (d.dateWIB || d.date) + '\nTrades: ' + (d.totalTrades || d.total) + ' (' + d.wins + 'W / ' + d.losses + 'L)\nWin Rate: ' + d.winRate + '%\nNet P&L: ' + (d.netPnl >= 0 ? '+' : '') + d.netPnl + ' USD (' + (d.netPct || d.pnlPct) + '%)\nCapital: $' + (d.totalCapital || d.capital);
        break;
      case 'PAIRS_UPDATED': {
        const pairLines = (d.activePairs || []).map((p: any, i: number) => {
          const sm = p.oiData?.topTraderLsRatio > 1.2 ? 'Long' : p.oiData?.topTraderLsRatio < 0.8 ? 'Short' : 'Neutral';
          return (i+1) + '. ' + p.symbol + '\n' +
            '   Funding: ' + (p.fundingRate*100).toFixed(4) + '% ' + p.fundingCategory + '\n' +
            '   OI: ' + p.oiValue + ' (' + p.oiChange1h + ' 1h)\n' +
            '   Signal: ' + (p.oiSignal?.type || 'UNKNOWN') + '\n' +
            '   Smart Money: ' + sm + '\n' +
            '   Bias: ' + p.biasSide;
        }).join('\n');
        text = 'DYNAMIC HUNTER UPDATE\n' +
          '-------------------\n' +
          'ACTIVE PAIRS:\n' + pairLines + '\n' +
          '-------------------';
        break;
      }
      case 'MODE_CHANGED':
        text = 'TRADING MODE CHANGED\n' + d.badge + '\n' + d.description + '\nRisk/trade: ' + (d.settings?.riskPctLargeCap) + '% (BTC)\nLeverage: ' + (d.settings?.leverageLargeCap) + 'x (BTC)\nMax positions: ' + (d.settings?.maxOpenPositions) + '\nMin confidence: ' + (d.settings?.minConfidence) + '%';
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

var lastUpdateId = 0;
var telegramListenerTimer: NodeJS.Timeout | null = null;

export async function startTelegramListener() {
   if (telegramListenerTimer) return;
   
   const run = async () => {
      try {
         const botToken = await prisma.appSettings.findUnique({ where: { key: 'telegram_bot_token' } });
         const chatId = await prisma.appSettings.findUnique({ where: { key: 'telegram_chat_id' } });
         if (!botToken?.value || !chatId?.value) return;

         const url = 'https://api.telegram.org/bot' + botToken.value + '/getUpdates?offset=' + lastUpdateId + '&timeout=0';
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
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Engine stopped by user command' } } as any);
                  } else if (cmd === '/start') {
                     startEngine();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Engine started by user command' } } as any);
                  } else if (cmd.startsWith('/set_target ')) {
                     const val = parseFloat(cmd.replace('/set_target ', '').trim());
                     if (!isNaN(val) && val > 0) {
                        await prisma.appSettings.upsert({ where: { key: 'daily_profit_target_usd' }, update: { value: String(val) }, create: { key: 'daily_profit_target_usd', value: String(val) }});
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Daily profit target set to $' + val.toFixed(2) } } as any);
                     } else {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Invalid target amount' } } as any);
                     }
                  } else if (cmd === '/status') {
                     const st = getEngineStatus();
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Engine IsRunning: ' + st.isRunning } } as any);
                  } else if (cmd === '/positions') {
                     const pos = await getPositions();
                     if (pos.length === 0) {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'No open positions.' } } as any);
                     } else {
                        const txt = pos.map((p: any) => p.symbol + ': ' + (p.positionAmt > 0 ? 'LONG' : 'SHORT') + ' | PnL: ' + p.unrealizedProfit).join('\n');
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Open Positions:\n' + txt } } as any);
                     }
                  } else if (cmd === '/close_all') {
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Closing all positions...' } } as any);
                     const pos = await prisma.trade.findMany({ where: { status: 'OPEN' } });
                     for (const p of pos) {
                        await closePosition(p.symbol, p.quantity);
                        await prisma.trade.update({ where: { id: p.id }, data: { status: 'CLOSED' } });
                     }
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'All ' + pos.length + ' positions closed.' } } as any);
                  } else if (cmd === '/pause_2h') {
                     stopEngine();
                     const resumeTime = new Date(Date.now() + 2 * 3600000);
                     const timeStr = resumeTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                     await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Engine paused until ' + timeStr + ' WIB' } } as any);
                     setTimeout(() => { startEngine(); }, 2 * 3600000);
                  } else if (cmd.startsWith('/set_hold ')) {
                     const hrs = parseInt(cmd.replace('/set_hold ', '').trim());
                     if (!isNaN(hrs) && hrs >= 1 && hrs <= 72) {
                        await prisma.appSettings.upsert({ where: { key: 'max_hold_hours' }, update: { value: String(hrs) }, create: { key: 'max_hold_hours', value: String(hrs) }});
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Max hold (profit trades) set to ' + hrs + ' hours' } } as any);
                     } else {
                        await sendTelegramAlert({ type: 'RAW_MESSAGE', data: { text: 'Invalid value. Use 1-72.\nExample: /set_hold 16' } } as any);
                     }
                  } else if (cmd === '/help') {
                     const helpText = [
                       'TradeCore Bot - Command List',
                       '',
                       'INFO:',
                       '/status - Check engine status',
                       '/positions - View open positions',
                       '',
                       'ENGINE CONTROL:',
                       '/start - Start engine',
                       '/stop - Stop engine (emergency)',
                       '/pause_2h - Pause engine 2 hours then auto-restart',
                       '',
                       'TRADING SETTINGS:',
                       '/set_target [USD] - Set daily profit target',
                       '   Example: /set_target 50',
                       '/set_hold [hours] - Set max hold for profitable trade (1-72h)',
                       '   Example: /set_hold 16',
                       '',
                       'EMERGENCY:',
                       '/close_all - Close ALL open positions',
                       '',
                       'All settings can also be changed in Risk Manager on the web dashboard.'
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
