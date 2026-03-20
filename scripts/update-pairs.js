const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ACTIVE_PAIRS_OVERRIDE = [
        { symbol: 'BTCUSDT',  biasSide: 'NEUTRAL', score: 100 },
        { symbol: 'ETHUSDT',  biasSide: 'NEUTRAL', score: 90 },
        { symbol: 'SOLUSDT',  biasSide: 'NEUTRAL', score: 80 },
        { symbol: 'DOGEUSDT', biasSide: 'NEUTRAL', score: 70 },
        { symbol: 'HYPEUSDT', biasSide: 'NEUTRAL', score: 60 }
    ];
    
    await prisma.appSettings.upsert({
        where: { key: 'active_trading_pairs' },
        update: { value: JSON.stringify(ACTIVE_PAIRS_OVERRIDE) },
        create: { 
            key: 'active_trading_pairs',
            value: JSON.stringify(ACTIVE_PAIRS_OVERRIDE)
        }
    });
    console.log('✅ Active pairs updated directly:', ACTIVE_PAIRS_OVERRIDE.map(p => p.symbol).join(', '));
}

main().catch(console.error).finally(() => prisma.$disconnect());
