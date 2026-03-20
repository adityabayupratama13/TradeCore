import { getOpenOrders, getOpenAlgoOrders } from './src/lib/binance';

async function test() {
   const basicOpen = await getOpenOrders('ATOMUSDT');
   console.log('--- BASIC OPEN ORDERS ---');
   console.log(JSON.stringify(basicOpen, null, 2));
   
   const algoOpen = await getOpenAlgoOrders('ATOMUSDT').catch(e => e.message);
   console.log('--- ALGO OPEN ORDERS ---');
   console.log(algoOpen);
}

test();
