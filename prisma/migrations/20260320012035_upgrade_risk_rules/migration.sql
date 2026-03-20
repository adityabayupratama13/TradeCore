-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RiskRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxDailyLossPct" REAL NOT NULL DEFAULT 30,
    "maxWeeklyLossPct" REAL NOT NULL DEFAULT 50,
    "maxDrawdownPct" REAL NOT NULL DEFAULT 70,
    "maxPositionSizePct" REAL NOT NULL DEFAULT 10,
    "maxRiskPerTradePct" REAL NOT NULL DEFAULT 2,
    "maxLeverage" REAL NOT NULL DEFAULT 70,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riskPctLargeCap" REAL NOT NULL DEFAULT 5,
    "riskPctMidCap" REAL NOT NULL DEFAULT 7,
    "riskPctLowCap" REAL NOT NULL DEFAULT 10,
    "minProfitTargetPct" REAL NOT NULL DEFAULT 15,
    "leverageLargeCap" INTEGER NOT NULL DEFAULT 50,
    "leverageMidCap" INTEGER NOT NULL DEFAULT 20,
    "leverageLowCap" INTEGER NOT NULL DEFAULT 20,
    "maxLeverageLarge" INTEGER NOT NULL DEFAULT 70,
    "maxLeverageMid" INTEGER NOT NULL DEFAULT 30,
    "maxLeverageLow" INTEGER NOT NULL DEFAULT 30
);
INSERT INTO "new_RiskRule" ("createdAt", "id", "isActive", "maxDailyLossPct", "maxDrawdownPct", "maxLeverage", "maxOpenPositions", "maxPositionSizePct", "maxRiskPerTradePct", "maxWeeklyLossPct") SELECT "createdAt", "id", "isActive", "maxDailyLossPct", "maxDrawdownPct", "maxLeverage", "maxOpenPositions", "maxPositionSizePct", "maxRiskPerTradePct", "maxWeeklyLossPct" FROM "RiskRule";
DROP TABLE "RiskRule";
ALTER TABLE "new_RiskRule" RENAME TO "RiskRule";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
