import { getGridStatus } from '../src/lib/gridEngine';
import { prisma } from '../src/lib/prisma';

async function main() {
  console.log("=== Checking V6 Grid Status ===");
  try {
    const status = await getGridStatus();
    console.log(JSON.stringify(status, null, 2));

    console.log("\n=== Recent Grid Logs ===");
    const logs = await prisma.engineLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      where: {
        message: {
          contains: 'GRID'
        }
      }
    });

    logs.forEach(l => {
      console.log(`[${l.createdAt.toISOString()}] ${l.action}: ${l.message}`);
    });
  } catch (e: any) {
    console.error("Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
