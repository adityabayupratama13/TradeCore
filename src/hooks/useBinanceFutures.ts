import { useState, useEffect, useCallback } from 'react';

export interface FuturesData {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

export interface SentimentData {
  upCount: number;
  downCount: number;
  total: number;
  percentageUp: number;
  status: 'FEAR' | 'NEUTRAL' | 'GREED';
}

export function useBinanceFutures(targetSymbols: string[]) {
  const [futuresData, setFuturesData] = useState<Record<string, FuturesData>>({});
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch funding rates
      const premiumRes = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
      const premiumJson = await premiumRes.json();
      
      const newFuturesData: Record<string, FuturesData> = {};
      const targetUpper = targetSymbols.map(s => s.toUpperCase());
      
      premiumJson.forEach((item: any) => {
        if (targetUpper.includes(item.symbol)) {
          newFuturesData[item.symbol] = {
            symbol: item.symbol,
            markPrice: item.markPrice,
            indexPrice: item.indexPrice,
            lastFundingRate: item.lastFundingRate,
            nextFundingTime: item.nextFundingTime
          };
        }
      });
      setFuturesData(newFuturesData);

      // 2. Fetch 24h ticker for volumes and sentiment
      const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      const tickerJson = await tickerRes.json();

      // Top 20 USDT pairs by quote volume
      const usdtPairs = tickerJson
        .filter((t: any) => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN'))
        .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 20);

      let up = 0;
      let down = 0;
      usdtPairs.forEach((t: any) => {
        if (parseFloat(t.priceChangePercent) >= 0) up++;
        else down++;
      });

      const percentageUp = (up / 20) * 100;
      let status: 'FEAR' | 'NEUTRAL' | 'GREED' = 'NEUTRAL';
      if (percentageUp > 70) status = 'GREED';
      else if (percentageUp < 50) status = 'FEAR';

      setSentiment({
        upCount: up,
        downCount: down,
        total: 20,
        percentageUp,
        status
      });

      // Also grab volumes for our target symbols
      const newVolumes: Record<string, number> = {};
      tickerJson.forEach((t: any) => {
        if (targetUpper.includes(t.symbol)) {
          newVolumes[t.symbol] = parseFloat(t.quoteVolume);
        }
      });
      setVolumes(newVolumes);

    } catch (error) {
      console.error('Error fetching Binance REST API', error);
    } finally {
      setLoading(false);
    }
  }, [targetSymbols]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 30000); // refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  return { futuresData, sentiment, volumes, loading };
}
