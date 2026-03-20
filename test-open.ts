import { getPositions, getOpenOrders } from './src/lib/binance';

async function test() {
   const positions = await getPositions();
   console.log('--- ACTIVE POSITIONS ---');
   console.log(JSON.stringify(positions.map(p => p.symbol), null, 2));

   if (positions.length > 0) {
      const basicOpen = await getOpenOrders(positions[0].symbol);
      console.log(`--- BASIC OPEN ORDERS FOR ${positions[0].symbol} ---`);
      console.log(JSON.stringify(basicOpen, null, 2));
   }
}

test();
