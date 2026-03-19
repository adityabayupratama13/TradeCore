"use client";

import { useRiskStatus } from "@/hooks/useRiskStatus";
import { Info, Save, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";

export function RiskRulesForm() {
  const { status, refreshStatus } = useRiskStatus();
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status?.rules) {
      setFormData(status.rules);
    }
  }, [status?.rules]);

  if (!status?.rules) return <div className="h-96 animate-pulse bg-[#0E1628] rounded-xl" />;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: parseFloat(e.target.value) });
    setSaved(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/risk/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxDailyLossPct: formData.maxDailyLossPct,
          maxWeeklyLossPct: formData.maxWeeklyLossPct,
          maxDrawdownPct: formData.maxDrawdownPct,
          maxPositionSizePct: formData.maxPositionSizePct,
          maxRiskPerTradePct: formData.maxRiskPerTradePct,
          maxLeverage: formData.maxLeverage,
          maxOpenPositions: formData.maxOpenPositions
        })
      });

      if (res.ok) {
        setSaved(true);
        refreshStatus();
        setTimeout(() => setSaved(false), 3000);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 h-full flex flex-col">
      <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
        Risk Rules Configuration
      </h2>

      <div className="space-y-5 flex-1 overflow-y-auto hide-scrollbar pb-4 pr-2">

        <div>
          <label className="text-sm font-bold text-gray-300 mb-1 block">1. Max Daily Loss %</label>
          <div className="flex items-center gap-3">
            <input 
              name="maxDailyLossPct" type="number" step="0.1" min="1" max="10"
              value={formData.maxDailyLossPct || ''} onChange={handleChange}
              className="w-24 bg-[#0A0E1A] border border-[#1a2540] rounded px-3 py-2 text-white font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="w-4 h-4" /> Trading locks when daily loss hits this %
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-300 mb-1 block">2. Max Weekly Loss %</label>
          <div className="flex items-center gap-3">
            <input 
              name="maxWeeklyLossPct" type="number" step="0.1" min="3" max="20"
              value={formData.maxWeeklyLossPct || ''} onChange={handleChange}
              className="w-24 bg-[#0A0E1A] border border-[#1a2540] rounded px-3 py-2 text-white font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="w-4 h-4" /> Review required when weekly loss hits this %
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-300 mb-1 block">3. Max Total Drawdown %</label>
          <div className="flex items-center gap-3">
            <input 
              name="maxDrawdownPct" type="number" step="0.1" min="5" max="30"
              value={formData.maxDrawdownPct || ''} onChange={handleChange}
              className="w-24 bg-[#0A0E1A] border border-[#1a2540] rounded px-3 py-2 text-white font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="w-4 h-4" /> Mandatory system review at this drawdown
            </div>
          </div>
        </div>

        <div>
           <label className="text-sm font-bold text-gray-300 mb-1 block">4. Max Position Size % of Capital</label>
           <div className="flex items-center gap-3">
            <input 
              name="maxPositionSizePct" type="number" step="1" min="5" max="50"
              value={formData.maxPositionSizePct || ''} onChange={handleChange}
              className="w-24 bg-[#0A0E1A] border border-[#1a2540] rounded px-3 py-2 text-white font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="w-4 h-4" /> Single position cannot exceed this % of total capital
            </div>
          </div>
        </div>

        <div>
           <label className="text-sm font-bold text-gray-300 mb-1 block">5. Max Risk Per Trade % of Capital</label>
           <div className="flex items-center gap-3">
            <input 
              name="maxRiskPerTradePct" type="number" step="0.1" min="0.5" max="5"
              value={formData.maxRiskPerTradePct || ''} onChange={handleChange}
              className="w-24 bg-[#0A0E1A] border border-[#1a2540] rounded px-3 py-2 text-white font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="w-4 h-4" /> Max loss if stop loss hit — per trade
            </div>
          </div>
        </div>

        <div>
           <label className="text-sm font-bold text-gray-300 mb-1 block">6. Max Leverage (Crypto)</label>
           <div className="flex items-center gap-3">
            <input 
              name="maxLeverage" type="number" step="1" min="1" max="20"
              value={formData.maxLeverage || ''} onChange={handleChange}
              className="w-24 bg-[#0A0E1A] border border-[#1a2540] rounded px-3 py-2 text-white font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="w-4 h-4" /> System warns above this, blocks at 2× this value
            </div>
          </div>
        </div>

        <div>
           <label className="text-sm font-bold text-gray-300 mb-1 block">7. Max Open Positions</label>
           <div className="flex items-center gap-3">
            <input 
              name="maxOpenPositions" type="number" step="1" min="1" max="10"
              value={formData.maxOpenPositions || ''} onChange={handleChange}
              className="w-24 bg-[#0A0E1A] border border-[#1a2540] rounded px-3 py-2 text-white font-mono"
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="w-4 h-4" /> Cannot open new trade if this many positions open
            </div>
          </div>
        </div>

      </div>

      <div className="mt-6 pt-6 border-t border-[#1a2540]">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full py-3 rounded font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors
            ${saved ? 'bg-green-500/20 text-green-500 border border-green-500' : 'bg-[#3d7fff] hover:bg-[#3d7fff]/80 text-white'}`}
        >
          {saved ? <><CheckCircle className="w-5 h-5"/> Rules Updated</> : <><Save className="w-5 h-5" /> {isSaving ? 'Saving...' : 'Update Risk Rules'}</>}
        </button>

        <div className="mt-4 p-3 bg-[#FF4757]/10 border border-[#FF4757]/30 rounded text-xs text-[#FF4757] font-medium leading-relaxed">
          ⚠️ These rules protect your family capital.<br/>
          Tightening limits = more protection.<br/>
          Loosening limits = more risk.<br/>
          Think carefully before changing.
        </div>
      </div>
    </div>
  );
}
