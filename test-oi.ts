const BASE_URL = process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';

async function testUrl(url: string) {
    try {
        const res = await fetch(url);
        console.log(`[${res.status}] ${url}`);
        const text = await res.text();
        console.log('Response (first 200 chars):', text.substring(0, 200));
    } catch(e: any) {
        console.error('Error fetching', url, e.message);
    }
}

async function test() {
   await testUrl(`${BASE_URL}/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=25`);
   await testUrl(`${BASE_URL}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=2`);
}

test();
