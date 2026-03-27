import { analyzeMarketV5 } from './src/lib/aiEngine';
import { fetchFullMacroContext } from './src/lib/macroContext';

async function main() {
  console.log("=== VERIFYING V5 MACRO ENGINE ===");
  console.log("1. Fetching Macro Context...");
  const macroCtx = await fetchFullMacroContext();
  console.log(JSON.stringify(macroCtx, null, 2));

  console.log("2. Running analyzeMarketV5 on BTCUSDT...");
  const signal = await analyzeMarketV5('BTCUSDT', null, 'DAY_TRADE', macroCtx);
  
  console.log("\n--- V5 RESULT ---");
  console.log(JSON.stringify(signal, null, 2));
}

main().catch(console.error);
