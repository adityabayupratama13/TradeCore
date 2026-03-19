-- CreateTable
CREATE TABLE "EngineLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleNumber" INTEGER NOT NULL,
    "symbol" TEXT,
    "action" TEXT NOT NULL,
    "signal" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradeSignalHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "entryPrice" REAL,
    "stopLoss" REAL,
    "takeProfit" REAL,
    "leverage" INTEGER NOT NULL,
    "riskReward" REAL,
    "keySignal" TEXT NOT NULL,
    "wasExecuted" BOOLEAN NOT NULL DEFAULT false,
    "tradeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
