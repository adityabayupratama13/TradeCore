"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useRiskStatus } from "@/hooks/useRiskStatus";

export function PositionExposureTable() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { status } = useRiskStatus();
  
  useEffect(() => {
    fetch('/api/risk/exposure')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('en-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val).replace('IDR', 'Rp');
  };

  if (loading) return <div className="h-96 animate-pulse bg-[#0E1628] rounded-xl" />;

  const { positions, totalExposureIDR, totalExposurePct, openCount } = data;

  const maxPosRule = status?.rules?.maxOpenPositions || 5;
  const isOverLeveraged = totalExposurePct > 80;

  return (
    <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-[#1a2540] flex justify-between items-center bg-[#0A0E1A]/50">
        <h2 className="text-lg font-bold text-white uppercase tracking-widest shrink-0">Open Positions Exposure</h2>
        <div className="text-sm font-bold text-gray-500 bg-[#1a2540] px-3 py-1 rounded">
          {openCount} / {maxPosRule} Positions
        </div>
      </div>

      <div className="flex-1 overflow-x-auto hide-scrollbar">
        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-20">
             <div className="font-bold tracking-widest mb-2">NO OPEN POSITIONS</div>
             <div className="text-sm">Capital fully available.</div>
          </div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#1a2540] text-gray-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Symbol</th>
                <th className="p-4 text-center">Direction</th>
                <th className="p-4 text-right">Entry Price</th>
                <th className="p-4 text-right">Size (IDR)</th>
                <th className="p-4 text-right">Size % Cap</th>
                <th className="p-4 text-center">Lev</th>
                <th className="p-4 text-right">Risk (IDR)</th>
                <th className="p-4 text-right">Risk % Cap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2540]">
              {positions.map((p: any) => {
                const isPosLarge = p.positionSizePct > 20;
                const isRiskLarge = p.riskPct > 2;
                
                return (
                  <tr key={p.id} className="hover:bg-[#1a2540]/30 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-white">{p.symbol}</div>
                      <div className="text-[10px] text-gray-500">{p.marketType === 'CRYPTO_FUTURES' ? 'CRYPTO' : 'SAHAM IDX'}</div>
                    </td>
                    <td className="p-4 text-center">
                       <span className={`px-2 py-1 rounded text-xs font-bold ${
                        (p.direction === 'LONG' || p.direction === 'BUY') ? 'bg-[#00D4AA]/20 text-[#00D4AA]' : 'bg-[#FF4757]/20 text-[#FF4757]'
                      }`}>
                        {p.direction}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono text-gray-300">{p.entryPrice.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono text-white">
                      {formatIDR((p.entryPrice * p.quantity) / (p.leverage || 1))}
                    </td>
                    <td className="p-4 text-right font-mono font-bold">
                       <span className={`${
                         p.positionSizePct < 10 ? 'text-[#00D4AA]' : p.positionSizePct <= 20 ? 'text-[#FFA502]' : 'text-[#FF4757]'
                       }`}>
                         {p.positionSizePct.toFixed(1)}%
                       </span>
                    </td>
                    <td className="p-4 text-center font-mono text-gray-400">
                      {p.marketType === 'CRYPTO_FUTURES' ? `${p.leverage}×` : '—'}
                    </td>
                    <td className="p-4 text-right font-mono text-gray-300">
                      {p.riskAmount > 0 ? formatIDR(p.riskAmount) : '—'}
                    </td>
                    <td className="p-4 text-right font-mono font-bold">
                      <span className={`${
                        p.riskPct === 0 ? 'text-gray-500' : p.riskPct < 1 ? 'text-[#00D4AA]' : p.riskPct <= 2 ? 'text-[#FFA502]' : 'text-[#FF4757]'
                      }`}>
                        {p.riskPct > 0 ? `${p.riskPct.toFixed(2)}%` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-[#0A0E1A]/80 border-t-2 border-[#1a2540]">
              <tr>
                <td colSpan={3} className="p-4 font-bold text-gray-400 uppercase tracking-widest text-xs">Total Open Exposure</td>
                <td className="p-4 text-right font-mono font-bold text-white text-lg">{formatIDR(totalExposureIDR)}</td>
                <td className="p-4 text-right font-mono font-bold text-lg text-[#3d7fff]">{totalExposurePct.toFixed(1)}%</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {positions.some((p:any) => p.positionSizePct > 20) && (
        <div className="p-4 border-t border-[#1a2540] bg-[#FFA502]/10 text-[#FFA502] flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-bold tracking-wide">⚠️ Position exceeds 20% of capital. Consider reducing size.</span>
        </div>
      )}

      {isOverLeveraged && (
        <div className="p-4 border-t border-[#1a2540] bg-[#FF4757]/10 text-[#FF4757] flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-bold tracking-wide">🚨 Portfolio over-leveraged. Total exposure is {totalExposurePct.toFixed(1)}% of capital. High vulnerability to adverse moves.</span>
        </div>
      )}

    </div>
  );
}
