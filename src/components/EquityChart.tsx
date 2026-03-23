"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi, AreaSeries } from "lightweight-charts";
import { formatUSD } from "@/lib/formatters";

export function EquityChartComponent({ data }: { data: { time: string, value: number }[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState<'1W' | '1M' | '3M' | 'ALL'>('ALL');
  const safeData = Array.isArray(data) ? data : [];
  const [chartData, setChartData] = useState(safeData);

  useEffect(() => {
    // Initial fetch for actual range filter happens from API if we want, OR we just filter the passed data.
    const filterData = () => {
      if (range === 'ALL' || safeData.length === 0) return safeData;
      const lastDateStr = safeData[safeData.length - 1].time;
      const d = new Date(lastDateStr);
      
      if (range === '1W') d.setDate(d.getDate() - 7);
      else if (range === '1M') d.setMonth(d.getMonth() - 1);
      else if (range === '3M') d.setMonth(d.getMonth() - 3);

      const cutoff = d.toISOString().split('T')[0];
      return safeData.filter(pt => pt.time >= cutoff);
    };
    
    setChartData(filterData());
  }, [range, data]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0A0E1A" },
        textColor: "#6B7280", // text-gray-400
      },
      grid: {
        vertLines: { color: "#1a2540" },
        horzLines: { color: "#1a2540" },
      },
      crosshair: {
        vertLine: { width: 1, color: "#3d7fff", style: 3 },
        horzLine: { width: 1, color: "#3d7fff", style: 3 },
      },
      timeScale: {
        borderColor: "#1a2540",
      },
      rightPriceScale: {
        borderColor: "#1a2540",
      },
    });

    // @ts-ignore
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#00D4AA",
      topColor: "rgba(0, 212, 170, 0.4)",
      bottomColor: "rgba(0, 212, 170, 0.0)",
      lineWidth: 2,
    });

    if (chartData.length === 1) {
       // Lightweight charts requires 2 points to draw a visual area context
       // Synthesize a duplicate point 1 day ahead so it visualizes properly without crashing
       const d = new Date(chartData[0].time);
       d.setDate(d.getDate() + 1);
       const syntheticTime = d.toISOString().split('T')[0];

       const synthesized = [
          chartData[0],
          { time: syntheticTime as any, value: chartData[0].value }
       ];
       areaSeries.setData(synthesized as any);
    } else {
       areaSeries.setData(chartData);
    }

    chart.timeScale().fitContent();

    chartInstanceRef.current = chart;
    seriesRef.current = areaSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [chartData]);

  // Derived calculations for under-chart stats natively via active filtered data
  let peak = 0;
  let peakDate = '';
  let currentVal = 0;
  if(chartData.length > 0) {
    currentVal = chartData[chartData.length - 1].value;
    for(const pt of chartData) {
      if(pt.value > peak) {
        peak = pt.value;
        peakDate = pt.time;
      }
    }
  }

  const drawdownPct = peak > 0 ? ((peak - currentVal) / peak) * 100 : 0;



  return (
    <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-5 flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Equity Curve</h3>
        <div className="flex bg-[#0A0E1A] border border-[#1a2540] rounded overflow-hidden">
          {['1W', '1M', '3M', 'ALL'].map(r => (
            <button 
              key={r} onClick={() => setRange(r as any)}
              className={`px-3 py-1.5 text-xs font-bold transition-colors ${range === r ? 'bg-[#1a2540] text-white' : 'text-gray-500 hover:bg-[#1a2540]/50'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full h-[320px]" />

      <div className="w-full flex gap-4 mt-6 pt-4 border-t border-[#1a2540]">
        <div className="bg-[#0A0E1A] border border-[#1a2540] px-4 py-2 rounded flex-1">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider block">Peak Capital</span>
          <span className="text-lg font-mono font-bold text-white">{formatUSD(peak)}</span>
          <span className="text-xs text-gray-400 ml-2">({peakDate})</span>
        </div>
        <div className="bg-[#0A0E1A] border border-[#1a2540] px-4 py-2 rounded flex-1">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider block">Current Drawdown from Peak</span>
          <span className={`text-lg font-mono font-bold ${drawdownPct > 0 ? 'text-[#FF4757]' : 'text-[#00D4AA]'}`}>
            -{drawdownPct.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default EquityChartComponent;
