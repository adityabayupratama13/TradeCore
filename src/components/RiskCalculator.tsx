import { 
  calculateLiquidationPrice, 
  calculateRiskAmount, 
  calculateRRRatio, 
  calculatePositionSize, 
  calculateMarginRequired 
} from "@/lib/calculations";
import { CheckCircle2, XCircle } from "lucide-react";

interface RiskCalculatorProps {
  marketType: 'CRYPTO_FUTURES' | 'SAHAM_IDX';
  direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
  entryPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  totalCapital: number;
  maxLeverage: number;
}

export function RiskCalculator(props: RiskCalculatorProps) {
  const { 
    marketType, direction, entryPrice, quantity, 
    leverage, stopLoss, takeProfit, totalCapital, maxLeverage 
  } = props;

  const isCrypto = marketType === 'CRYPTO_FUTURES';
  
  // Safe parsing for calculations
  const safeEntry = entryPrice || 0;
  const safeQty = quantity || 0;
  const safeSL = stopLoss || 0;
  const safeTP = takeProfit || 0;

  // Overview calculations
  const positionSize = calculatePositionSize(safeEntry, safeQty);
  const positionPct = totalCapital > 0 ? (positionSize / totalCapital) * 100 : 0;
  const marginRequired = isCrypto ? calculateMarginRequired(positionSize, leverage) : positionSize;

  // Risk & Reward calculations
  const riskAmount = safeSL > 0 ? calculateRiskAmount(safeEntry, safeSL, safeQty) : 0;
  const riskPct = totalCapital > 0 ? (riskAmount / totalCapital) * 100 : 0;
  const profitAmount = safeTP > 0 ? Math.abs(safeTP - safeEntry) * safeQty : 0;
  const rrRatio = safeTP > 0 && safeSL > 0 ? calculateRRRatio(safeEntry, safeSL, safeTP) : 0;

  // Crypto Specific
  const liquidationPrice = isCrypto && safeEntry > 0 ? calculateLiquidationPrice(safeEntry, leverage, direction as any) : 0;
  const liqDistancePct = safeEntry > 0 ? (Math.abs(safeEntry - liquidationPrice) / safeEntry) * 100 : 0;
  const estFees = isCrypto ? positionSize * 0.0004 : 0;

  // Guard Checks
  const riskCheckPass = riskPct <= 2;
  const posCheckPass = positionPct <= 20;
  const levCheckPass = !isCrypto || leverage <= maxLeverage;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: isCrypto ? 'USD' : 'IDR',
      minimumFractionDigits: isCrypto ? 2 : 0,
      maximumFractionDigits: isCrypto ? 2 : 0
    }).format(val).replace('IDR', 'Rp').replace('USD', '$');
  };

  return (
    <div className="space-y-4">
      
      {/* CARD 1: OVERVIEW */}
      <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Position Overview</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Position Size</span>
            <span className="font-mono text-white">{formatCurrency(positionSize)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Size % of Capital</span>
            <span className={`font-mono font-bold ${positionPct > 20 ? 'text-[#FF4757]' : positionPct > 10 ? 'text-[#FFA502]' : 'text-[#00D4AA]'}`}>
              {positionPct.toFixed(2)}%
            </span>
          </div>
          {isCrypto && (
            <div className="flex justify-between">
              <span className="text-gray-400">Margin Required</span>
              <span className="font-mono text-white">{formatCurrency(marginRequired)}</span>
            </div>
          )}
        </div>
      </div>

      {/* CARD 2: RISK & REWARD */}
      <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Risk & Reward</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Risk Amount</span>
            <span className="font-mono text-[#FF4757]">{formatCurrency(riskAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Risk % (Capital)</span>
            <span className={`font-mono font-bold ${riskPct > 2 ? 'text-[#FF4757] animate-pulse' : riskPct > 1 ? 'text-[#FFA502]' : 'text-[#00D4AA]'}`}>
              {riskPct.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-[#1a2540]">
            <span className="text-gray-400">Potential Profit</span>
            <span className="font-mono text-[#00D4AA]">{formatCurrency(profitAmount)}</span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-gray-400">R/R Ratio</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${rrRatio >= 2 ? 'bg-[#00D4AA]/10 text-[#00D4AA]' : rrRatio >= 1.5 ? 'bg-[#FFA502]/10 text-[#FFA502]' : 'bg-[#FF4757]/10 text-[#FF4757]'}`}>
              1 : {rrRatio.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* CARD 3: CRYPTO ONLY */}
      {isCrypto && (
        <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Futures Metrics</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Liquidation Price</span>
              <span className={`font-mono ${liqDistancePct < 10 ? 'text-[#FF4757] font-bold' : 'text-gray-300'}`}>
                {liquidationPrice > 0 ? liquidationPrice.toFixed(4) : '--'} 
                {liqDistancePct > 0 && ` (${liqDistancePct.toFixed(1)}%)`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Est. Taker Fee</span>
              <span className="font-mono text-gray-300">{formatCurrency(estFees)}</span>
            </div>
          </div>
        </div>
      )}

      {/* CARD 4: RISK GUARD */}
      <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Risk Guard</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            {riskCheckPass ? <CheckCircle2 className="w-4 h-4 text-[#00D4AA]" /> : <XCircle className="w-4 h-4 text-[#FF4757]" />}
            <span className={riskCheckPass ? 'text-gray-300' : 'text-[#FF4757]'}>Risk per trade ≤ 2%</span>
          </div>
          <div className="flex items-center gap-2">
            {posCheckPass ? <CheckCircle2 className="w-4 h-4 text-[#00D4AA]" /> : <XCircle className="w-4 h-4 text-[#FF4757]" />}
            <span className={posCheckPass ? 'text-gray-300' : 'text-[#FF4757]'}>Position size ≤ 20%</span>
          </div>
          {isCrypto && (
            <div className="flex items-center gap-2">
              {levCheckPass ? <CheckCircle2 className="w-4 h-4 text-[#00D4AA]" /> : <XCircle className="w-4 h-4 text-[#FF4757]" />}
              <span className={levCheckPass ? 'text-gray-300' : 'text-[#FF4757]'}>Allowed leverage</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
