import { useEffect, useRef, useState, useCallback } from 'react';

export interface BinanceTickerData {
  symbol: string;
  price: string;
  prevPrice: string;
  high: string;
  low: string;
  open: string;
  changePct: number;
  direction: 'up' | 'down' | null;
  lastUpdated: number;
}

export function useBinanceWebSocket(symbols: string[]) {
  const [data, setData] = useState<Record<string, BinanceTickerData>>({});
  const [status, setStatus] = useState<'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('CONNECTING');
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (ws.current) {
      ws.current.close();
    }

    setStatus(ws.current ? 'RECONNECTING' : 'CONNECTING');

    const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      setStatus('CONNECTED');
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.data && payload.data.e === '24hrMiniTicker') {
          const t = payload.data;
          const symbolStr: string = t.s;
          const currentPrice = parseFloat(t.c);
          const openPrice = parseFloat(t.o);
          const changePct = ((currentPrice - openPrice) / openPrice) * 100;
          
          setData(prev => {
            const prevData = prev[symbolStr];
            const prevPriceVal = prevData ? parseFloat(prevData.price) : currentPrice;
            
            let direction: 'up' | 'down' | null = null;
            if (currentPrice > prevPriceVal) direction = 'up';
            else if (currentPrice < prevPriceVal) direction = 'down';
            else direction = prevData?.direction || null;

            return {
              ...prev,
              [symbolStr]: {
                symbol: symbolStr,
                price: t.c,
                prevPrice: prevData?.price || t.c,
                high: t.h,
                low: t.l,
                open: t.o,
                changePct,
                direction,
                lastUpdated: Date.now()
              }
            };
          });
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    socket.onclose = () => {
      setStatus('DISCONNECTED');
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    socket.onerror = () => {
      socket.close(); // Handled by onclose
    };
  }, [symbols]);

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  return { data, status };
}
