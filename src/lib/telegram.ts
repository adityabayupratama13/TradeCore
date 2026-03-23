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
                  } else if (cmd === '/help') {
                     const helpText = [
                       '🤖 TradeCore Bot — Commands',
                       '━━━━━━━━━━━━━━',
                       '📊 INFO',
                       '/status — Engine status',
                       '/positions — Open positions',
                       '',
                       '⚙️ ENGINE',
                       '/start — Start engine',
                       '/stop — Emergency stop',
                       '/pause_2h — Pause 2 jam, auto-restart',
                       '',
                       '💰 SETTINGS',
                       '/set_target [USD] — Daily profit target',
                       '   Contoh: /set_target 50',
                       '/set_hold [jam] — Max hold profitable (1-72h)',
                       '   Contoh: /set_hold 16',
                       '',
                       '🚨 EMERGENCY',
                       '/close_all — Close ALL positions',
                       '',
                       '🖥️ Dashboard: lihat Risk Manager web'
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
