import { fetchFullMacroContext } from './src/lib/macroContext';

async function main() {
  console.log("=== V5 MACRO CONTEXT TEST ===");
  const ctx = await fetchFullMacroContext();
  console.log(JSON.stringify(ctx, null, 2));
}

main().catch(console.error);
