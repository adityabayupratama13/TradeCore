import CryptoJS from 'crypto-js';

const API_KEY = process.env.BINANCE_API_KEY || '';
const SECRET = process.env.BINANCE_SECRET_KEY || '';
const BASE_URL = process.env.BINANCE_BASE_URL as string;

function sign(queryString: string): string {
  return CryptoJS.HmacSHA256(queryString, SECRET).toString(CryptoJS.enc.Hex);
}

async function fetchBinance(endpoint: string, method: string = 'GET', data: any = {}) {
  const timestamp = Date.now();
  const params = new URLSearchParams({ ...data, timestamp: String(timestamp) }).toString();
  const signature = sign(params);
  
  const url = method === 'GET' ? `${BASE_URL}${endpoint}?${params}&signature=${signature}` : `${BASE_URL}${endpoint}`;
  
  const headers: any = {
    'X-MBX-APIKEY': API_KEY,
  };

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' ? `${params}&signature=${signature}` : undefined
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Binance API Error: ${json.msg || response.statusText}`);
  }
  return json;
}

export interface BinancePosition {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  liquidationPrice: number;
  leverage: number;
  marginType: string;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface Ticker24hr {
  priceChangePercent: string;
  quoteVolume: string;
}

export interface OrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
  quantity?: number;
  price?: number;
  stopPrice?: number | string;
  closePosition?: boolean | string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTE_GTC';
  workingType?: 'CONTRACT_PRICE' | 'MARK_PRICE';
  priceProtect?: boolean | string;
  reduceOnly?: boolean | string;
}

export async function getAccountInfo() {
  return fetchBinance('/fapi/v2/account');
}

export async function getBalance(): Promise<{ asset: string, balance: number, availableBalance: number }[]> {
  const res = await fetchBinance('/fapi/v2/balance');
  return res.map((b: any) => ({
    asset: b.asset,
    balance: parseFloat(b.balance),
    availableBalance: parseFloat(b.availableBalance)
  }));
}

export async function getPositions(): Promise<BinancePosition[]> {
  const res = await fetchBinance('/fapi/v2/positionRisk');
  return res
    .filter((p: any) => parseFloat(p.positionAmt) !== 0)
    .map((p: any) => ({
      symbol: p.symbol,
      positionAmt: parseFloat(p.positionAmt),
      entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice),
      unrealizedProfit: parseFloat(p.unRealizedProfit),
      liquidationPrice: parseFloat(p.liquidationPrice),
      leverage: parseInt(p.leverage),
      marginType: p.marginType
    }));
}

export async function getKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  const params = new URLSearchParams({ symbol, interval, limit: String(limit) }).toString();
  const url = `${BASE_URL}/fapi/v1/klines?${params}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (!response.ok) throw new Error('Binance public klines error');

  return data.map((d: any) => ({
    openTime: d[0],
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
    closeTime: d[6]
  }));
}

export async function getMarkPrice(symbol: string) {
  const res = await fetch(`${BASE_URL}/fapi/v1/premiumIndex?symbol=${symbol}`).then(r => r.json());
  return {
    markPrice: parseFloat(res.markPrice),
    indexPrice: parseFloat(res.indexPrice),
    fundingRate: parseFloat(res.lastFundingRate) * 100 // return as percentage
  };
}

export async function get24hrTicker(symbol: string): Promise<Ticker24hr> {
  const res = await fetch(`${BASE_URL}/fapi/v1/ticker/24hr?symbol=${symbol}`).then(r => r.json());
  return {
    priceChangePercent: res.priceChangePercent,
    quoteVolume: res.quoteVolume
  };
}

export async function getOrderBook(symbol: string, limit: number = 20) {
  const res = await fetch(`${BASE_URL}/fapi/v1/depth?symbol=${symbol}&limit=${limit}`).then(r => r.json());
  return {
    bids: res.bids.map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: res.asks.map((a: any) => [parseFloat(a[0]), parseFloat(a[1])])
  };
}

export async function placeOrder(params: OrderParams) {
  return fetchBinance('/fapi/v1/order', 'POST', params);
}

export async function placeBatchOrders(orders: OrderParams[]) {
  return fetchBinance('/fapi/v1/batchOrders', 'POST', { batchOrders: JSON.stringify(orders) });
}

export async function cancelOrder(symbol: string, orderId: number) {
  return fetchBinance('/fapi/v1/order', 'DELETE', { symbol, orderId });
}

export async function cancelAllOrders(symbol: string) {
  return fetchBinance('/fapi/v1/allOpenOrders', 'DELETE', { symbol });
}

export async function setLeverage(symbol: string, leverage: number) {
  return fetchBinance('/fapi/v1/leverage', 'POST', { symbol, leverage });
}

export async function setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED') {
  try {
    await fetchBinance('/fapi/v1/marginType', 'POST', { symbol, marginType });
  } catch (err: any) {
    if (err.message && err.message.includes('No need to change margin type')) {
      return; // Ignore if already set
    }
    throw err;
  }
}

export async function getOpenOrders(symbol?: string) {
  return fetchBinance('/fapi/v1/openOrders', 'GET', symbol ? { symbol } : {});
}

export async function closePosition(symbol: string, quantity: number) {
  // Determine direction to close
  const qtyNum = parseFloat(String(quantity));
  if (qtyNum === 0) return null;
  const side = qtyNum > 0 ? 'SELL' : 'BUY';
  const absQty = Math.abs(qtyNum);
  
  return placeOrder({
    symbol,
    side,
    type: 'MARKET',
    quantity: absQty,
    reduceOnly: true
  });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function getOppositeSide(side: 'BUY' | 'SELL'): 'BUY' | 'SELL' {
  return side === 'BUY' ? 'SELL' : 'BUY';
}

export async function placeProtectOrder(params: any) {
  const { symbol, side, quantity, stopPrice, isStopLoss } = params;
  
  // Method 1: reduceOnly (Best for demo)
  try {
    const res = await placeOrder({
      symbol,
      side,
      type: isStopLoss ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET',
      quantity,
      stopPrice: stopPrice.toString(),
      reduceOnly: "true",
      workingType: "MARK_PRICE",
      timeInForce: "GTC"
    } as any);
    console.log(`✅ ${isStopLoss ? 'SL' : 'TP'} Method 1 (reduceOnly) placed:`, res.orderId);
    return res;
  } catch (err: any) {
    console.error(`❌ ${isStopLoss ? 'SL' : 'TP'} Method 1 failed:`, err.message || err);
  }

  // Method 2: closePosition (Legacy/Standard)
  try {
    const res = await placeOrder({
      symbol,
      side,
      type: isStopLoss ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET',
      stopPrice: stopPrice.toString(),
      closePosition: "true",
      workingType: "MARK_PRICE"
    } as any);
    console.log(`✅ ${isStopLoss ? 'SL' : 'TP'} Method 2 (closePosition) placed:`, res.orderId);
    return res;
  } catch (err: any) {
    console.error(`❌ ${isStopLoss ? 'SL' : 'TP'} Method 2 failed:`, err.message || err);
    throw new Error(`All ${isStopLoss ? 'SL' : 'TP'} placement methods failed.`);
  }
}

export async function enterTrade(params: {
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  leverage: number,
  stopLoss: number,
  takeProfit: number
}) {
  await setMarginType(params.symbol, 'ISOLATED');
  await setLeverage(params.symbol, params.leverage);

  // MARKET ENTRY
  const entryOrder = await placeOrder({
    symbol: params.symbol,
    side: params.side,
    type: 'MARKET',
    quantity: params.quantity
  });

  const oppositeSide = getOppositeSide(params.side);

  await sleep(500);

  // STOP LOSS
  const slOrder = await placeProtectOrder({
    symbol: params.symbol,
    side: oppositeSide,
    quantity: params.quantity,
    stopPrice: params.stopLoss,
    isStopLoss: true
  });

  await sleep(500);

  // TAKE PROFIT
  const tpOrder = await placeProtectOrder({
    symbol: params.symbol,
    side: oppositeSide,
    quantity: params.quantity,
    stopPrice: params.takeProfit,
    isStopLoss: false
  });

  return { entryOrder, slOrder, tpOrder };
}

export async function fetchOIDataRaw(symbol: string) {
  const safeFetch = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Binance OI] Warning: ${url} returned ${res.status}`);
        return null;
      }
      return res.json();
    } catch (err: any) {
      console.error(`[Binance OI] Fetch failed for ${url}:`, err.message);
      return null;
    }
  };

  const [currentOI, oiHist, lsRatioAcc, topTraderPos, takerVol] = await Promise.all([
    safeFetch(`${BASE_URL}/fapi/v1/openInterest?symbol=${symbol}`),
    safeFetch(`${BASE_URL}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`),
    safeFetch(`${BASE_URL}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=2`),
    safeFetch(`${BASE_URL}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=1h&limit=2`),
    safeFetch(`${BASE_URL}/futures/data/takervolumelongshort?symbol=${symbol}&period=15m&limit=2`)
  ]);
  
  return { currentOI, oiHist, lsRatioAcc, topTraderPos, takerVol };
}
