export interface CoinCategory {
  name: string
  symbols: string[]
  leverage: number
  maxLeverage: number
  riskPct: number
  marginType: 'ISOLATED'
}

export const COIN_CATEGORIES: CoinCategory[] = [
  {
    name: 'LARGE_CAP',
    symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
    leverage: 50,
    maxLeverage: 70,
    riskPct: 5,
    marginType: 'ISOLATED'
  },
  {
    name: 'MID_CAP',
    symbols: [
      'SOLUSDT','XRPUSDT','ADAUSDT','AVAXUSDT',
      'DOTUSDT','LINKUSDT','LTCUSDT','UNIUSDT',
      'ATOMUSDT','NEARUSDT','APTUSDT','INJUSDT',
      'ARBUSDT','OPUSDT','SUIUSDT','HYPEUSDT'
    ],
    leverage: 20,
    maxLeverage: 30,
    riskPct: 7,
    marginType: 'ISOLATED'
  },
  {
    name: 'LOW_CAP',
    symbols: [
      'WIFUSDT','PEPEUSDT','FLOKIUSDT','BONKUSDT',
      'FETUSDT','RENDERUSDT','WLDUSDT','JUPUSDT',
      'ENAUSDT','NEIROUSDT','KAIAUSDT','TAOUSDT',
      'MOVEUSDT','MEUSDT','PNUTUSDT','TURBOUSDT',
      'SEIUSDT','TIAUSDT','EIGENUSDT','STRKUSDT',
      'MATICUSDT','DOGEUSDT'
    ],
    leverage: 20,
    maxLeverage: 30,
    riskPct: 10,
    marginType: 'ISOLATED'
  }
]

export function getCoinCategory(symbol: string): CoinCategory {
  for (const cat of COIN_CATEGORIES) {
    if (cat.symbols.includes(symbol)) return cat
  }
  return COIN_CATEGORIES[1] // default MID_CAP
}
