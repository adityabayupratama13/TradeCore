const fs = require('fs');
const path = require('path');

const targets = [
  'src/app/api/performance/summary/route.ts',
  'src/app/api/performance/statistics/route.ts',
  'src/app/api/risk/check/route.ts',
  'src/app/api/engine/status/route.ts'
];

targets.forEach(t => {
  const p = path.join(__dirname, '..', t);
  if (!fs.existsSync(p)) return;
  let code = fs.readFileSync(p, 'utf8');

  // Add import if needed
  if (!code.includes('getTotalCapitalUSD')) {
    const importStats = "import { getTotalCapitalUSD } from '../../../../../lib/binance';\n";
    const importOther = "import { getTotalCapitalUSD } from '../../../../lib/binance';\n";
    if (t.includes('performance/summary') || t.includes('performance/statistics')) {
      code = importStats + code;
    } else {
      code = importOther + code;
    }
  }

  code = code.replace(/portfolio\.totalCapital/g, '(await getTotalCapitalUSD())');
  code = code.replace(/portfolio\?\.totalCapital/g, '(await getTotalCapitalUSD())');
  
  fs.writeFileSync(p, code);
  console.log('Fixed', t);
});
