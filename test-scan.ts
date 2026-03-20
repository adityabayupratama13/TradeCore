import { runDynamicHunter } from './src/lib/pairSelector';

async function test() {
  console.log('Forcing Dynamic Hunter Scan...');
  await runDynamicHunter();
}

test();
