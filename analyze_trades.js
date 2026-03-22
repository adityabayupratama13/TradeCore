const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyze() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const trades = await prisma.trade.findMany({
    where: {
      exitAt: { gte: today },
      status: 'CLOSED'
    },
    orderBy: { exitAt: 'asc' }
  });

  console.log(`\n=== TODAY'S TRADES (${trades.length}) ===`);
  
  let cumulativePnl = 0;
  let peakPnl = 0;
  let peakTime = null;
  
  const tradesFiltered = trades.map(t => {
    cumulativePnl += (t.pnl || 0);
    if (cumulativePnl > peakPnl) {
      peakPnl = cumulativePnl;
      peakTime = t.exitAt;
    }
    
    return {
      symbol: t.symbol,
      side: t.direction,
      qty: t.quantity,
      entry: t.entryPrice,
      exit: t.exitPrice,
      pnl: (t.pnl || 0).toFixed(2),
      cumulative: cumulativePnl.toFixed(2),
      time: t.exitAt ? t.exitAt.toLocaleTimeString('id-ID') : 'N/A'
    };
  });
  
  const winCount = trades.filter(t => (t.pnl || 0) > 0).length;
  const lossCount = trades.length - winCount;
  
  console.log(`Peak PnL: $${peakPnl.toFixed(2)} at ${peakTime?.toLocaleTimeString('id-ID')}`);
  console.log(`Current PnL: $${cumulativePnl.toFixed(2)}`);
  console.log(`Win Rate: ${((winCount/trades.length)*100).toFixed(1)}% (${winCount}W / ${lossCount}L)`);
  
  console.log("\nLast 15 Trades:");
  console.table(tradesFiltered.slice(-15));
  
  console.log("\nBiggest Losses:");
  const biggestLosses = [...tradesFiltered].sort((a,b) => parseFloat(a.pnl) - parseFloat(b.pnl)).slice(0, 5);
  console.table(biggestLosses);

  console.log("\nBiggest Wins:");
  const biggestWins = [...tradesFiltered].sort((a,b) => parseFloat(b.pnl) - parseFloat(a.pnl)).slice(0, 5);
  console.table(biggestWins);
}

analyze().finally(() => prisma.$disconnect());
