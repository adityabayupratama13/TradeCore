"use client";

import { useRiskStatus } from "@/hooks/useRiskStatus";
import { Info, Save, CheckCircle, Shield, Zap, TrendingDown, Calculator } from "lucide-react";
import { useState, useEffect } from "react";

export function RiskRulesForm() {
  const { status, refreshStatus } = useRiskStatus();
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {
    if (status?.rules) {
      setFormData(status.rules);
    }
  }, [status?.rules]);

  if (!status?.rules) return <div className="h-96 animate-pulse bg-[#0E1628] rounded-xl" />;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: parseFloat(e.target.value) });
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/risk/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (res.ok) {
        showToast("✅ Risk rules updated successfully", 'success');
        refreshStatus();
      } else {
        showToast(`❌ Failed to save: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch(e: any) {
      showToast(`❌ Failed to save: ${e.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const capital = (status as any)?.capital || 10000;
  
  return (
    <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl flex flex-col h-full relative">
      
      {/* Toast Notification positioned absolutely */}
      {toast && (
        <div className={`absolute top-4 right-4 px-4 py-2 rounded-md font-medium text-sm border shadow-lg z-50 flex items-center gap-2 animate-in slide-in-from-top-2
          ${toast.type === 'success' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
          {toast.message}
        </div>
      )}

      <div className="p-6 border-b border-[#1a2540] flex items-center justify-between">
         <h2 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-2">
           <Shield className="w-5 h-5 text-blue-400" />
           Risk Configuration Maps
         </h2>
         <button 
          onClick={handleSave} disabled={isSaving}
          className="bg-[#3d7fff] hover:bg-[#3d7fff]/80 text-white px-4 py-2 rounded text-sm font-bold tracking-wider flex items-center gap-2 transition"
         >
           <Save className="w-4 h-4" /> {isSaving ? 'SAVING...' : 'SAVE ALL SETTINGS'}
         </button>
      </div>

      <div className="p-6 overflow-y-auto hide-scrollbar space-y-8 flex-1">
        
        {/* SECTION 1: CIRCUIT BREAKERS */}
        <div>
          <h3 className="text-sm border-b border-[#1a2540] pb-2 font-bold text-gray-400 mb-4 flex items-center gap-2 uppercase">
            <TrendingDown className="w-4 h-4" /> Circuit Breakers (Account Level)
          </h3>
          <div className="grid grid-cols-3 gap-4">
             <div className="bg-[#0A0E1A] p-4 rounded-lg border border-[#1a2540]">
                <label className="text-xs font-bold text-gray-500 block mb-2 uppercase">Max Daily Loss %</label>
                <input name="maxDailyLossPct" type="number" step="0.1" value={formData.maxDailyLossPct || ''} onChange={handleChange} className="w-full bg-transparent border-b border-[#303645] focus:border-blue-500 outline-none text-xl font-mono text-white pb-1" />
             </div>
             <div className="bg-[#0A0E1A] p-4 rounded-lg border border-[#1a2540]">
                <label className="text-xs font-bold text-gray-500 block mb-2 uppercase">Max Weekly Loss %</label>
                <input name="maxWeeklyLossPct" type="number" step="0.1" value={formData.maxWeeklyLossPct || ''} onChange={handleChange} className="w-full bg-transparent border-b border-[#303645] focus:border-blue-500 outline-none text-xl font-mono text-white pb-1" />
             </div>
             <div className="bg-[#0A0E1A] p-4 rounded-lg border border-[#1a2540]">
                <label className="text-xs font-bold text-gray-500 block mb-2 uppercase">Max Drawdown %</label>
                <input name="maxDrawdownPct" type="number" step="0.1" value={formData.maxDrawdownPct || ''} onChange={handleChange} className="w-full bg-transparent border-b border-[#303645] focus:border-blue-500 outline-none text-xl font-mono text-pink-400 pb-1" />
             </div>
          </div>
        </div>

        {/* SECTION 2: POSITION SIZING */}
        <div>
          <h3 className="text-sm border-b border-[#1a2540] pb-2 font-bold text-gray-400 mb-4 flex items-center gap-2 uppercase">
            <Info className="w-4 h-4" /> Position Controls
          </h3>
          <div className="grid grid-cols-3 gap-4">
             <div className="bg-[#0A0E1A] p-4 rounded-lg border border-[#1a2540]">
                <label className="text-xs font-bold text-gray-500 block mb-2 uppercase">Concurrent Slots</label>
                <input name="maxOpenPositions" type="number" step="1" value={formData.maxOpenPositions || ''} onChange={handleChange} className="w-full bg-transparent border-b border-[#303645] focus:border-purple-500 outline-none text-xl font-mono text-white pb-1" />
             </div>
             <div className="bg-[#0A0E1A] p-4 rounded-lg border border-[#1a2540]">
                <label className="text-xs font-bold text-emerald-500/70 block mb-2 uppercase">Target ROI (Capital) %</label>
                <input name="minProfitTargetPct" type="number" step="0.1" value={formData.minProfitTargetPct || ''} onChange={handleChange} className="w-full bg-transparent border-b border-emerald-900 focus:border-emerald-500 outline-none text-xl font-mono text-emerald-400 pb-1" />
             </div>
             <div className="bg-[#0A0E1A] p-4 rounded-lg border border-[#1a2540] opacity-50">
                <label className="text-xs font-bold text-gray-500 block mb-2 uppercase">Deprecated Cap</label>
                <div className="text-sm font-mono text-gray-400 pb-1">N/A</div>
             </div>
          </div>
        </div>

        {/* SECTION 3: CATEGORY LEVERAGE & RISK */}
        <div>
          <h3 className="text-sm border-b border-[#1a2540] pb-2 font-bold text-gray-400 mb-4 flex items-center gap-2 uppercase">
            <Zap className="w-4 h-4 text-orange-400" /> Dynamic Category Limits
          </h3>
          <div className="grid grid-cols-1 gap-3">
             {/* LARGE CAP */}
             <div className="bg-[#0A0E1A] border border-[#1a2540] p-4 rounded flex items-center gap-6">
                <div className="w-24 font-bold text-blue-400">LARGE CAP</div>
                <div><label className="text-xs text-gray-500 block">Risk %</label><input name="riskPctLargeCap" type="number" step="0.1" value={formData.riskPctLargeCap||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-white outline-none"/></div>
                <div><label className="text-xs text-gray-500 block">Base Lev</label><input name="leverageLargeCap" type="number" value={formData.leverageLargeCap||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-white outline-none"/></div>
                <div><label className="text-xs text-gray-500 block">Max Lev</label><input name="maxLeverageLarge" type="number" value={formData.maxLeverageLarge||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-pink-400 outline-none"/></div>
             </div>
             {/* MID CAP */}
             <div className="bg-[#0A0E1A] border border-[#1a2540] p-4 rounded flex items-center gap-6">
                <div className="w-24 font-bold text-purple-400">MID CAP</div>
                <div><label className="text-xs text-gray-500 block">Risk %</label><input name="riskPctMidCap" type="number" step="0.1" value={formData.riskPctMidCap||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-white outline-none"/></div>
                <div><label className="text-xs text-gray-500 block">Base Lev</label><input name="leverageMidCap" type="number" value={formData.leverageMidCap||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-white outline-none"/></div>
                <div><label className="text-xs text-gray-500 block">Max Lev</label><input name="maxLeverageMid" type="number" value={formData.maxLeverageMid||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-pink-400 outline-none"/></div>
             </div>
             {/* LOW CAP */}
             <div className="bg-[#0A0E1A] border border-[#1a2540] p-4 rounded flex items-center gap-6">
                <div className="w-24 font-bold text-orange-400">LOW CAP</div>
                <div><label className="text-xs text-gray-500 block">Risk %</label><input name="riskPctLowCap" type="number" step="0.1" value={formData.riskPctLowCap||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-white outline-none"/></div>
                <div><label className="text-xs text-gray-500 block">Base Lev</label><input name="leverageLowCap" type="number" value={formData.leverageLowCap||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-white outline-none"/></div>
                <div><label className="text-xs text-gray-500 block">Max Lev</label><input name="maxLeverageLow" type="number" value={formData.maxLeverageLow||''} onChange={handleChange} className="w-16 bg-transparent border-b border-gray-600 text-pink-400 outline-none"/></div>
             </div>
          </div>
        </div>

        {/* SECTION 4: LIVE SIMULATOR */}
        <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-5">
           <h3 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
             <Calculator className="w-4 h-4" /> Live Position Simulator (Capital: ${(capital).toLocaleString()})
           </h3>
           <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="text-gray-400">Large Cap Risk: <span className="text-white">${((capital * (formData.riskPctLargeCap||5))/100).toFixed(2)}</span> @ {formData.leverageLargeCap||50}x</div>
              <div className="text-gray-400">Mid Cap Risk: <span className="text-white">${((capital * (formData.riskPctMidCap||7))/100).toFixed(2)}</span> @ {formData.leverageMidCap||20}x</div>
              <div className="text-gray-400">Low Cap Risk: <span className="text-white">${((capital * (formData.riskPctLowCap||10))/100).toFixed(2)}</span> @ {formData.leverageLowCap||20}x</div>
           </div>
        </div>

      </div>
    </div>
  );
}
