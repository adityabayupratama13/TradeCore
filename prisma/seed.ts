import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1 default Portfolio
  let portfolio = await prisma.portfolio.findFirst()
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: {
        name: 'Family Capital',
        totalCapital: 10000000,
        currency: 'IDR',
      },
    })
  }

  // 1 default RiskRule
  let riskRule = await prisma.riskRule.findFirst()
  if (!riskRule) {
    riskRule = await prisma.riskRule.create({
      data: {
        maxDailyLossPct: 3,
        maxWeeklyLossPct: 7,
        maxDrawdownPct: 15,
        maxPositionSizePct: 2,
        maxLeverage: 3,
        isActive: true,
      },
    })
  }

  // 1 AppSettings
  const appSetting = await prisma.appSettings.upsert({
    where: { key: 'circuit_breaker_lock_until' },
    update: {},
    create: {
      key: 'circuit_breaker_lock_until',
      value: '',
    },
  })

  console.log('Seeding completed:', { portfolio, riskRule, appSetting })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
