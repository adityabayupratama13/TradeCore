import CryptoJS from 'crypto-js';

const API_KEY = process.env.BINANCE_API_KEY || '';
const SECRET = process.env.BINANCE_SECRET_KEY || '';
const BASE_URL = process.env.BINANCE_BASE_URL as string;

function sign(queryString: string): string {
  return CryptoJS.HmacSHA256(queryString, SECRET).toString(CryptoJS.enc.Hex);
}

export interface SymbolPrecision {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  minQty: number;
  maxQty: number;
  minNotional: number;
  tickSize: number;
  stepSize: number;
}

const symbolPrecisionCache = new Map<string, SymbolPrecision>();
let lastExchangeInfoFetch = 0;

export async function getSymbolPrecision(symbol: string): Promise<SymbolPrecision> {
  const now = Date.now();
  if (!symbolPrecisionCache.has(symbol) || now - lastExchangeInfoFetch > 24 * 60 * 60 * 1000) {
    try {
      const res = await fetch(`${BASE_URL}/fapi/v1/exchangeInfo`).then(r => r.json());
      for (const s of res.symbols) {
        const priceFilter = s.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
        const lotSize = s.filters.find((f: any) => f.filterType === 'LOT_SIZE');
        const marketLotSize = s.filters.find((f: any) => f.filterType === 'MARKET_LOT_SIZE');
        const minNotional = s.filters.find((f: any) => f.filterType === 'MIN_NOTIONAL');

        const calculatedMaxQty = marketLotSize ? parseFloat(marketLotSize.maxQty) : (lotSize ? parseFloat(lotSize.maxQty) : 0);

        symbolPrecisionCache.set(s.symbol, {
          symbol: s.symbol,
          pricePrecision: s.pricePrecision,
          quantityPrecision: s.quantityPrecision,
          minQty: lotSize ? parseFloat(lotSize.minQty) : 0,
          maxQty: calculatedMaxQty,
          minNotional: minNotional ? parseFloat(minNotional.notional) : 0,
          tickSize: priceFilter ? parseFloat(priceFilter.tickSize) : 0,
          stepSize: lotSize ? parseFloat(lotSize.stepSize) : 0
        });
      }
      lastExchangeInfoFetch = now;
    } catch (err) {
      console.error('Failed to fetch exchangeInfo', err);
    }
  }
  
  return symbolPrecisionCache.get(symbol) || {
    symbol, pricePrecision: 4, quantityPrecision: 3, minQty: 0, maxQty: 0, minNotional: 0, tickSize: 0.0001, stepSize: 0.001
  };
}

export async function roundPrice(symbol: string, price: number): Promise<number> {
  const precision = await getSymbolPrecision(symbol);
  const tickSize = precision.tickSize;
  if (!tickSize) return parseFloat(price.toFixed(precision.pricePrecision));
  
  const rounded = Math.round(price / tickSize) * tickSize;
  return parseFloat(rounded.toFixed(precision.pricePrecision));
}

export async function roundQuantity(symbol: string, qty: number): Promise<number> {
  const precision = await getSymbolPrecision(symbol);
  
  if (precision && qty > precision.maxQty && precision.maxQty > 0) {
    console.log(`⚠️ Qty ${qty} exceeds maxQty ${precision.maxQty}. Capping.`);
    qty = precision.maxQty;
  }
  
  if (precision && qty < precision.minQty) {
    throw new Error(`Qty ${qty} below minQty ${precision.minQty}`);
  }

  const stepSize = precision.stepSize;
  if (!stepSize) return parseFloat(qty.toFixed(precision.quantityPrecision));

  const rounded = Math.floor(qty / stepSize) * stepSize;
  return parseFloat(rounded.toFixed(precision.quantityPrecision));
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

export interface AlgoOrderParams {
  algoType: 'CONDITIONAL';
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET' | 'STOP' | 'TAKE_PROFIT' | 'TRAILING_STOP_MARKET';
  triggerPrice: string;
  quantity?: string;
  closePosition?: string;
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
  reduceOnly?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  priceProtect?: string;
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

export async function placeAlgoOrder(params: AlgoOrderParams) {
  return fetchBinance('/fapi/v1/algoOrder', 'POST', params);
}

export async function cancelAlgoOrder(symbol: string, algoId: string | number) {
  return fetchBinance('/fapi/v1/algoOrder', 'DELETE', { symbol, algoId });
}

export async function getAlgoOrder(symbol: string, algoId: string | number) {
  return fetchBinance('/fapi/v1/algoOrder', 'GET', { symbol, algoId });
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

export async function getOpenAlgoOrders(symbol?: string) {
  return fetchBinance('/fapi/v1/openAlgoOrders', 'GET', symbol ? { symbol } : {});
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

export async function enterTrade(params: {
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  leverage: number,
  stopLoss: number,
  takeProfit: number
}) {
  const roundedQty = await roundQuantity(params.symbol, params.quantity);
  const roundedSL = await roundPrice(params.symbol, params.stopLoss);
  const roundedTP = await roundPrice(params.symbol, params.takeProfit);
  
  const precision = await getSymbolPrecision(params.symbol);
  if (roundedQty < precision.minQty) {
    throw new Error(`Quantity ${roundedQty} below minimum ${precision.minQty}`);
  }

  await setMarginType(params.symbol, 'ISOLATED');
  await setLeverage(params.symbol, params.leverage);

  // MARKET ENTRY
  const entryOrder = await placeOrder({
    symbol: params.symbol,
    side: params.side,
    type: 'MARKET',
    quantity: roundedQty
  });
  console.log(`✅ Entry order placed: ${entryOrder.orderId}`);

  const oppositeSide = getOppositeSide(params.side);

  await sleep(500);

  // STOP LOSS ALGO
  let slAlgoId = null;
  try {
    const slOrder = await placeAlgoOrder({
      algoType: 'CONDITIONAL',
      symbol: params.symbol,
      side: oppositeSide,
      type: 'STOP_MARKET',
      triggerPrice: roundedSL.toString(),
      closePosition: 'true',
      workingType: 'MARK_PRICE',
      priceProtect: 'FALSE',
      timeInForce: 'GTC'
    });
    slAlgoId = slOrder.algoId;
    console.log(`✅ SL Algo order placed: ${slAlgoId} trigger: ${roundedSL}`);
  } catch (err: any) {
    console.error(`❌ SL Algo order failed:`, err.message);
  }

  await sleep(500);

  // TAKE PROFIT ALGO
  let tpAlgoId = null;
  try {
    const tpOrder = await placeAlgoOrder({
      algoType: 'CONDITIONAL',
      symbol: params.symbol,
      side: oppositeSide,
      type: 'TAKE_PROFIT_MARKET',
      triggerPrice: roundedTP.toString(),
      closePosition: 'true',
      workingType: 'MARK_PRICE',
      priceProtect: 'FALSE',
      timeInForce: 'GTC'
    });
    tpAlgoId = tpOrder.algoId;
    console.log(`✅ TP Algo order placed: ${tpAlgoId} trigger: ${roundedTP}`);
  } catch (err: any) {
    console.error(`❌ TP Algo order failed:`, err.message);
  }

  return { entryOrder, slAlgoId, tpAlgoId };
}

export async function fetchOIDataRaw(symbol: string) {
  const safeFetch = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Binance OI] Warning: ${url} returned ${res.status}`);
        return null;
      }
      const text = await res.text();
      if (text.trim() === 'ok') {
        return null;
      }
      return JSON.parse(text);
    } catch (err: any) {
      console.error(`[Binance OI] Fetch failed for ${url}:`, err.message);
      return null;
    }
  };

  const MAIN_URL = 'https://fapi.binance.com';

  const [currentOI, oiHist, lsRatioAcc, topTraderPos, takerVol] = await Promise.all([
    safeFetch(`${MAIN_URL}/fapi/v1/openInterest?symbol=${symbol}`),
    safeFetch(`${MAIN_URL}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`),
    safeFetch(`${MAIN_URL}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=2`),
    safeFetch(`${MAIN_URL}/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=1h&limit=2`),
    safeFetch(`${MAIN_URL}/futures/data/takervolumelongshort?symbol=${symbol}&period=15m&limit=2`)
  ]);
  
  return { currentOI, oiHist, lsRatioAcc, topTraderPos, takerVol };
}

export async function getTotalCapitalUSD(): Promise<number> {
  try {
    const balance = await getBalance();
    const usdt = balance.find((b: any) => b.asset === 'USDT');
    return usdt?.balance ?? 0;
  } catch {
    const { prisma } = require('../../lib/prisma');
    const portfolio = await prisma.portfolio.findFirst();
    if (!portfolio) return 0;
    
    if (portfolio.totalCapital > 1000) {
      return portfolio.totalCapital / 16500;
    }
    return portfolio.totalCapital;
  }
}
