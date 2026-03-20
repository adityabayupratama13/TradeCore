"use client";

import { useRiskStatus } from "@/hooks/useRiskStatus";
import { Info, Save, CheckCircle, Shield, Zap, TrendingDown, Calculator, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { TRADING_MODES, getModeConfig } from "@/lib/tradingModes";

export function RiskRulesForm() {
  const { status, refreshStatus } = useRiskStatus();
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  const [showOverride, setShowOverride] = useState(false);
  const [showDegenModal, setShowDegenModal] = useState(false);
  const [degenInput, setDegenInput] = useState("");

  useEffect(() => {
    if (status?.rules) {
      setFormData(status.rules);
    }
  }, [status?.rules]);

  if (!status?.rules) return <div className="h-96 animate-pulse bg-[#0E1628] rounded-xl" />;

  const capital = (status as any)?.capital || 10000;
  const activeMode = formData.activeMode || 'SAFE';

  // Check if current settings differ from the preset mode settings indicating a CUSTOM state
  const presetConfig = getModeConfig(activeMode);
  const isCustom = activeMode !== 'CUSTOM' && (
    formData.riskPctLargeCap !== presetConfig.settings.riskPctLargeCap ||
    formData.maxDailyLossPct !== presetConfig.settings.maxDailyLossPct
    // Simple heuristic to show "🔧 CUSTOM" if overridden
  );

  const displayMode = isCustom ? 'CUSTOM' : activeMode;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Modify forces 'activeMode' to CUSTOM virtually if we want, but user said "Mengubah nilai di sini tidak mengubah mode. Selector menampilkan Custom". We just let isCustom flag handle the UI.
    setFormData({ ...formData, [e.target.name]: parseFloat(e.target.value) });
  };

  const showToastMsg = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleModeSelect = async (m: string) => {
    if (m === 'DEGEN') {
      setShowDegenModal(true);
      return;
    }
    await applyMode(m);
  };

  const applyMode = async (m: string, confirmed = false) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/risk/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, confirmed })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFormData({ ...formData, activeMode: m, ...data.settings });
        showToastMsg(`✅ Mode berhasil diubah ke ${TRADING_MODES[m].badge}. Semua parameter diperbarui otomatis.`, 'success');
        refreshStatus();
        if (m === 'DEGEN') setShowDegenModal(false);
      } else {
        showToastMsg(`❌ Failed to change mode: ${data.message || 'Error'}`, 'error');
      }
    } catch(e: any) {
      showToastMsg(`❌ Failed to connect: ${e.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const saveOverrides = async () => {
    setIsSaving(true);
    try {
      // Overrides simply patch the risk rules table, leaving activeMode intact, which triggers CUSTOM flag
      const res = await fetch('/api/risk/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (res.ok) {
        showToastMsg("✅ Override berhasil disimpan", 'success');
        refreshStatus();
      } else {
        showToastMsg(`❌ Failed to save: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch(e: any) {
      showToastMsg(`❌ Failed to save: ${e.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const resetPreset = () => {
    if (activeMode && activeMode !== 'CUSTOM') {
       const cfg = getModeConfig(activeMode);
       setFormData({ ...formData, ...cfg.settings });
    }
  };

  const modeCards = Object.values(TRADING_MODES);

  return (
    <div className="flex flex-col gap-6">
      
      {/* TOAST SYSTEM */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-md font-medium text-sm border shadow-lg z-50 flex items-center gap-2 animate-in slide-in-from-top-2
          ${toast.type === 'success' ? 'bg-green-900/90 text-green-300 border-green-500/50' : 'bg-red-900/90 text-red-300 border-red-500/50'}`}>
          {toast.message}
        </div>
      )}

      {/* DEGEN MODAL */}
      {showDegenModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
           <div className="bg-[#0A0E1A] border border-red-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl shadow-red-900/20">
              <h3 className="text-xl font-bold text-red-500 mb-4 flex items-center gap-2">
                <AlertTriangle /> 💀 Aktivasi DEGEN Mode
              </h3>
              <div className="text-gray-300 text-sm space-y-4 mb-6">
                 <p>Mode ini menggunakan leverage sangat tinggi (50-70x).</p>
                 <p>Pergerakan harga 1-2% dapat meliquidasi posisimu.</p>
                 <p className="font-bold text-red-400">Kamu BISA kehilangan seluruh saldo dalam 1 trade.</p>
                 <p>Apakah kamu memahami dan menerima risiko ini?</p>
              </div>
              <input 
                type="text" 
                placeholder="ketik 'DEGEN' untuk konfirmasi"
                value={degenInput}
                onChange={(e) => setDegenInput(e.target.value)}
                className="w-full bg-[#0E1628] border border-red-900 focus:border-red-500 rounded p-3 text-white mb-6 outline-none"
              />
              <div className="flex gap-3">
                 <button onClick={() => setShowDegenModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded font-bold">Batal</button>
                 <button 
                  disabled={degenInput !== 'DEGEN' || isSaving}
                  onClick={() => applyMode('DEGEN', true)}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 rounded font-bold transition"
                 >
                   {isSaving ? 'Tunggu...' : 'Ya, Aktifkan DEGEN Mode'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* RECOMMENDATION BANNER */}
      {capital <= 50 && (
        <div className="bg-emerald-900/30 border border-emerald-500/50 rounded-xl p-5 flex items-start gap-4 shadow-lg shadow-emerald-900/10">
           <div className="text-4xl">💡</div>
           <div className="flex-1">
              <h3 className="text-emerald-400 font-bold text-lg mb-1">REKOMENDASI UNTUK KAMU</h3>
              <p className="text-emerald-100/80 text-sm mb-3">Berdasarkan capital ${(capital).toLocaleString()}, kami sarankan mulai dengan <span className="font-bold text-emerald-300">🛡️ SAFE MODE</span>.</p>
              <ul className="text-xs text-emerald-100/60 space-y-1 mb-4">
                 <li>• Loss per trade maksimal ${(capital * 0.03).toFixed(2)} (3%)</li>
                 <li>• Leverage rendah = tidak mudah liquidasi</li>
                 <li>• Validasi sistem dulu selama 1 bulan</li>
                 <li>• Kalau konsisten profit → upgrade ke BALANCED</li>
              </ul>
              <button 
                onClick={() => handleModeSelect('SAFE')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-bold transition"
              >
                Aktifkan SAFE Mode
              </button>
           </div>
        </div>
      )}

      {/* TOP SECTION: MODE SELECTOR */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-xl">
         <div className="mb-6">
            <h2 className="text-2xl font-bold text-white tracking-wide">Trading Mode</h2>
            <p className="text-gray-400 text-sm">Pilih mode sesuai pengalaman dan toleransi risiko kamu</p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {modeCards.map(c => {
               const isActive = displayMode === c.mode;
               return (
                 <div 
                   key={c.mode}
                   onClick={() => handleModeSelect(c.mode)}
                   style={{ borderColor: isActive ? c.color : '#1a2540', boxShadow: isActive ? `0 0 15px ${c.color}20` : 'none' }}
                   className={`p-5 rounded-xl border-2 cursor-pointer transition-all duration-300 hover:bg-[#151f32] flex flex-col h-full
                     ${isActive ? 'bg-[#151f32]' : 'bg-[#0A0E1A] opacity-70 hover:opacity-100'}`}
                 >
                    <div className="text-lg font-bold mb-2 p-2 rounded bg-black/20 text-center" style={{ color: c.color }}>
                       {c.badge}
                    </div>
                    <p className="text-gray-400 text-xs mb-4 flex-1">{c.description}</p>
                    <div className="text-xs font-mono bg-black/30 p-2 rounded text-gray-300 space-y-1 text-center">
                       <div>Risk/trade: {c.settings.riskPctLargeCap}%</div>
                       <div>Lev BTC: {c.settings.leverageLargeCap}x</div>
                       <div>Max pos: {c.settings.maxOpenPositions}</div>
                    </div>
                 </div>
               )
            })}
         </div>

         {isCustom && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded text-yellow-400 text-sm text-center font-bold">
               🔧 CUSTOM OVERRIDES ACTIVE
            </div>
         )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MIDDLE SECTION: CURRENT READ-ONLY SETTINGS */}
        <div className="lg:col-span-2 bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-xl">
           <h3 className="text-lg font-bold text-white mb-4 border-b border-[#1a2540] pb-2 flex items-center gap-2">
              <span style={{color: isCustom ? '#aaa' : getModeConfig(activeMode).color}}>
                {isCustom ? '🔧 CUSTOM MODE ' : getModeConfig(activeMode).badge}
              </span>
              <span className="text-gray-500 text-sm uppercase font-normal">— Active Settings</span>
           </h3>

           <div className="grid md:grid-cols-3 gap-6">
              <div>
                 <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Risk Per Trade</h4>
                 <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-blue-400">BTC/ETH/BNB</span>
                      <span className="text-white">{formData.riskPctLargeCap}% <span className="text-gray-500 text-xs">= ${(capital * (formData.riskPctLargeCap/100)).toFixed(2)}</span></span>
                    </div>
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-purple-400">Mid Cap</span>
                      <span className="text-white">{formData.riskPctMidCap}% <span className="text-gray-500 text-xs">= ${(capital * (formData.riskPctMidCap/100)).toFixed(2)}</span></span>
                    </div>
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-orange-400">Low Cap</span>
                      <span className="text-white">{formData.riskPctLowCap}% <span className="text-gray-500 text-xs">= ${(capital * (formData.riskPctLowCap/100)).toFixed(2)}</span></span>
                    </div>
                 </div>
              </div>

              <div>
                 <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Base Leverage</h4>
                 <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-blue-400">BTC/ETH/BNB</span>
                      <span className="text-white">{formData.leverageLargeCap}x</span>
                    </div>
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-purple-400">Mid Cap</span>
                      <span className="text-white">{formData.leverageMidCap}x</span>
                    </div>
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-orange-400">Low Cap</span>
                      <span className="text-white">{formData.leverageLowCap}x</span>
                    </div>
                 </div>
              </div>

              <div>
                 <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Limits</h4>
                 <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-gray-400">Max Positions</span>
                      <span className="text-white">{formData.maxOpenPositions}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-gray-400">Min Confidence</span>
                      <span className="text-white">{formData.minConfidence}%</span>
                    </div>
                    <div className="flex justify-between border-b border-[#1a2540] pb-1">
                      <span className="text-gray-400">Min TP Target</span>
                      <span className="text-emerald-400">{formData.minProfitTargetPct}% cap</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* CIRCUIT BREAKER (Always Visible) */}
        <div className="bg-[#1A0B10] border border-red-500/30 rounded-xl p-6 shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full" />
           <h3 className="text-lg font-bold text-red-500 mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Circuit Breaker
           </h3>
           <p className="text-xs text-red-400/70 mb-5 pb-3 border-b border-red-900/50">Batas ini aktif di semua mode dan merupakan hard limits.</p>
           
           <div className="space-y-4">
              <div className="bg-black/40 p-3 rounded border border-red-900/30 flex justify-between items-center">
                 <span className="text-gray-400 text-sm font-bold">Daily Loss Limit</span>
                 <span className="text-red-400 font-mono text-lg">{formData.maxDailyLossPct}%</span>
              </div>
              <div className="bg-black/40 p-3 rounded border border-red-900/30 flex justify-between items-center">
                 <span className="text-gray-400 text-sm font-bold">Weekly Loss Limit</span>
                 <span className="text-red-400 font-mono text-lg">{formData.maxWeeklyLossPct}%</span>
              </div>
              <div className="bg-black/40 p-3 rounded border border-red-900/30 flex justify-between items-center">
                 <span className="text-gray-400 text-sm font-bold">Max Drawdown</span>
                 <span className="text-pink-500 font-mono text-lg">{formData.maxDrawdownPct}%</span>
              </div>
           </div>
        </div>
      </div>

      {/* BOTTOM SECTION: CUSTOM OVERRIDE */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl overflow-hidden shadow-xl">
         <button 
           onClick={() => setShowOverride(!showOverride)}
           className="w-full p-4 flex justify-between items-center bg-[#111A2E] hover:bg-[#152038] transition"
         >
           <div className="flex items-center gap-2 text-gray-300 font-bold">
              <TrendingDown className="w-4 h-4" /> ⚙️ Custom Override (Advanced)
           </div>
           {showOverride ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
         </button>

         {showOverride && (
           <div className="p-6 border-t border-[#1a2540] space-y-6">
              <div className="mb-4 text-sm text-gray-400">Mengubah nilai di sini tidak mengubah mode. Selector akan menampilkan 'Custom'.</div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {/* Position specific Overrides */}
                 <div className="space-y-4">
                    <h4 className="text-gray-500 font-bold uppercase text-xs border-b border-[#1a2540] pb-2">Limits & Core</h4>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">Max Open Positions</label>
                      <input name="maxOpenPositions" type="number" value={formData.maxOpenPositions||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-blue-500 rounded p-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">Min Confidence %</label>
                      <input name="minConfidence" type="number" value={formData.minConfidence||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-blue-500 rounded p-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-400">Min TP Target % Capital</label>
                      <input name="minProfitTargetPct" type="number" value={formData.minProfitTargetPct||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-blue-500 rounded p-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-red-500/70">Max Daily Loss %</label>
                      <input name="maxDailyLossPct" type="number" value={formData.maxDailyLossPct||''} onChange={handleChange} className="bg-[#0A0E1A] border border-red-900/50 focus:border-red-500 rounded p-2 text-white outline-none" />
                    </div>
                 </div>

                 <div className="space-y-4">
                    <h4 className="text-gray-500 font-bold uppercase text-xs border-b border-[#1a2540] pb-2">Risk % Per Trade</h4>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-blue-400">Large Cap Risk %</label>
                      <input name="riskPctLargeCap" type="number" step="0.1" value={formData.riskPctLargeCap||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-blue-500 rounded p-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-purple-400">Mid Cap Risk %</label>
                      <input name="riskPctMidCap" type="number" step="0.1" value={formData.riskPctMidCap||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-purple-500 rounded p-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-orange-400">Low Cap Risk %</label>
                      <input name="riskPctLowCap" type="number" step="0.1" value={formData.riskPctLowCap||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-orange-500 rounded p-2 text-white outline-none" />
                    </div>
                 </div>

                 <div className="space-y-4">
                    <h4 className="text-gray-500 font-bold uppercase text-xs border-b border-[#1a2540] pb-2">Leverage Caps</h4>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-blue-400">Large Cap Lev</label>
                      <input name="leverageLargeCap" type="number" value={formData.leverageLargeCap||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-blue-500 rounded p-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-purple-400">Mid Cap Lev</label>
                      <input name="leverageMidCap" type="number" value={formData.leverageMidCap||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-purple-500 rounded p-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-orange-400">Low Cap Lev</label>
                      <input name="leverageLowCap" type="number" value={formData.leverageLowCap||''} onChange={handleChange} className="bg-[#0A0E1A] border border-[#303645] focus:border-orange-500 rounded p-2 text-white outline-none" />
                    </div>
                 </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#1a2540]">
                 <button onClick={resetPreset} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm font-bold text-gray-300">
                   Reset ke Mode Preset
                 </button>
                 <button onClick={saveOverrides} disabled={isSaving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold text-white flex items-center gap-2">
                   <Save className="w-4 h-4" /> {isSaving ? 'Menyimpan...' : 'Simpan Override'}
                 </button>
              </div>
           </div>
         )}
      </div>

    </div>
  );
}
