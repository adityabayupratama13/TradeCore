-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "capitalAtEvent" REAL NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RiskRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxDailyLossPct" REAL NOT NULL DEFAULT 3,
    "maxWeeklyLossPct" REAL NOT NULL DEFAULT 7,
    "maxDrawdownPct" REAL NOT NULL DEFAULT 15,
    "maxPositionSizePct" REAL NOT NULL DEFAULT 2,
    "maxRiskPerTradePct" REAL NOT NULL DEFAULT 2,
    "maxLeverage" REAL NOT NULL DEFAULT 3,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RiskRule" ("createdAt", "id", "isActive", "maxDailyLossPct", "maxDrawdownPct", "maxLeverage", "maxPositionSizePct", "maxWeeklyLossPct") SELECT "createdAt", "id", "isActive", "maxDailyLossPct", "maxDrawdownPct", "maxLeverage", "maxPositionSizePct", "maxWeeklyLossPct" FROM "RiskRule";
DROP TABLE "RiskRule";
ALTER TABLE "new_RiskRule" RENAME TO "RiskRule";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
