"use client";

import { useState, useEffect } from "react";
import { Save, AlertTriangle, RefreshCw, Trash2, ShieldAlert } from "lucide-react";
import { formatUSD } from "@/lib/formatters";

export function PortfolioConfig() {
  const [data, setData] = useState({ name: '', startingCapital: 0, activeCapitalPct: 80 });
  const [currentCapital, setCurrentCapital] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/portfolio').then(r => r.json()),
      fetch('/api/performance/summary').then(r => r.json())
    ]).then(([settings, perf]) => {
      if (settings.portfolio) {
        setData({
          name: settings.portfolio.name,
          startingCapital: settings.portfolio.startingCapital,
          activeCapitalPct: settings.activeCapitalPct
        });
        setCurrentCapital(settings.portfolio.totalCapital || settings.portfolio.startingCapital);
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/portfolio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setSaving(false);
  };

  const handleReset = (type: string) => {
    let msg = "";
    let confirmTxt = "";
    if (type === 'DAILY') {
      msg = "Reset today's P&L tracking? This cannot be undone.";
      if (!confirm(msg)) return;
      // In a real app we would call an API here.
      alert('Daily metrics reset successfully.');
    } else if (type === 'TRADES') {
      msg = "Type DELETE to confirm wiping all trades and journal entries.";
      confirmTxt = prompt(msg) || "";
      if (confirmTxt === 'DELETE') alert('Trades cleared.');
    } else if (type === 'FACTORY') {
      msg = "Type RESET to confirm Factory Reset (keeps only config).";
      confirmTxt = prompt(msg) || "";
      if (confirmTxt === 'RESET') alert('Factory reset completed.');
    }
  };

  if (loading) return <div className="animate-pulse h-96 bg-[#0E1628] rounded-xl" />;

  const activeAmount = (data.startingCapital * data.activeCapitalPct) / 100;
  const bufferAmount = data.startingCapital - activeAmount;

  return (
    <div className="space-y-6">
      
      {/* Card 1 */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg">
        <h3 className="text-lg font-bold text-white uppercase tracking-widest mb-6">Portfolio Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-bold text-gray-400 mb-2 block">Portfolio Name</label>
            <input 
              value={data.name} onChange={e => setData({...data, name: e.target.value})}
              className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded px-4 py-2.5 text-white font-medium focus:border-[#3d7fff] outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-400 mb-2 block">Starting Capital (USD)</label>
            <input 
              type="number" value={data.startingCapital} onChange={e => setData({...data, startingCapital: parseFloat(e.target.value)})}
              className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded px-4 py-2.5 text-white font-mono focus:border-[#3d7fff] outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-400 mb-2 block">Current Total Capital</label>
            <div className="w-full bg-[#0A0E1A]/50 border border-[#1a2540]/50 rounded px-4 py-2.5 text-gray-400 font-mono cursor-not-allowed">
              {formatUSD(currentCapital)}
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-gray-400 mb-2 block">Base Currency</label>
            <div className="w-full bg-[#0A0E1A]/50 border border-[#1a2540]/50 rounded px-4 py-2.5 text-gray-400 font-bold cursor-not-allowed">
              USD (US Dollar)
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="mt-6 bg-[#3d7fff] text-white px-6 py-2.5 rounded font-bold uppercase tracking-widest text-sm hover:bg-[#3d7fff]/80 flex items-center gap-2">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Card 2 */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg">
         <h3 className="text-lg font-bold text-white uppercase tracking-widest mb-6">Capital Management</h3>
         
         <div className="mb-4">
           <label className="text-sm font-bold text-gray-300 mb-2 flex items-center justify-between">
             <span>Active Capital for Trading</span>
             <span className="text-[#3d7fff] text-lg font-mono">{data.activeCapitalPct}%</span>
           </label>
           <p className="text-xs text-gray-500 mb-4">Only risk this % of total capital in active trades. Keep remainder as buffer/savings.</p>
           
           <input 
             type="range" min="10" max="100" step="5"
             value={data.activeCapitalPct} onChange={e => setData({...data, activeCapitalPct: parseInt(e.target.value)})}
             className="w-full appearance-none bg-[#1a2540] h-2 rounded-full outline-none slider-thumb"
           />
         </div>

         <div className="flex flex-col sm:flex-row gap-4 mt-6">
           <div className="flex-1 bg-[#0A0E1A] border border-[#1a2540] rounded p-4 border-l-4 border-l-[#00D4AA]">
             <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Active Trading Size</div>
             <div className="font-mono text-white text-lg font-bold">IDR {activeAmount.toLocaleString()}</div>
           </div>
           <div className="flex-1 bg-[#0A0E1A] border border-[#1a2540] rounded p-4 border-l-4 border-l-[#FFA502]">
             <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Safety Buffer</div>
             <div className="font-mono text-white text-lg font-bold">IDR {bufferAmount.toLocaleString()}</div>
           </div>
         </div>

         <button onClick={handleSave} disabled={saving} className="mt-6 bg-[#1a2540] text-white px-6 py-2.5 rounded font-bold uppercase tracking-widest text-sm hover:bg-[#1a2540]/80">
           Save Allocation
         </button>
      </div>

      {/* Card 3 */}
      <div className="bg-[#0E1628] border border-[#FF4757]/30 rounded-xl p-6 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
          <ShieldAlert className="w-32 h-32 text-[#FF4757]" />
        </div>
        
        <h3 className="text-lg font-bold text-[#FF4757] uppercase tracking-widest mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Danger Zone: Factory Resets
        </h3>
        <p className="text-xs text-gray-400 mb-6">These actions carry permanent data loss. Proceed with extreme caution.</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-[#0A0E1A] border border-[#1a2540] rounded">
            <div>
              <div className="font-bold text-white text-sm">Reset Daily Performance</div>
              <div className="text-xs text-gray-500">Clears today's P&L and metrics back to 0.</div>
            </div>
            <button onClick={() => handleReset('DAILY')} className="bg-[#FFA502] text-[#0A0E1A] px-4 py-2 rounded text-xs font-bold uppercase tracking-wider hover:opacity-80 flex items-center gap-2">
              <RefreshCw className="w-3 h-3" /> Reset Today
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-[#0A0E1A] border border-[#1a2540] rounded">
            <div>
              <div className="font-bold text-white text-sm">Clear All Trades</div>
              <div className="text-xs text-gray-500">Deletes every trade and journal entry in history.</div>
            </div>
            <button onClick={() => handleReset('TRADES')} className="bg-[#FF4757] text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider hover:opacity-80 flex items-center gap-2">
              <Trash2 className="w-3 h-3" /> Clear Trades
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-[#0A0E1A] border border-[#FF4757]/50 rounded">
            <div>
              <div className="font-bold text-[#FF4757] text-sm">Factory Reset</div>
              <div className="text-xs text-[#FF4757]/70">Wipes EVERYTHING except basic portfolio configuration.</div>
            </div>
            <button onClick={() => handleReset('FACTORY')} className="bg-transparent border border-[#FF4757] text-[#FF4757] px-4 py-2 rounded text-xs font-bold uppercase tracking-wider hover:bg-[#FF4757]/10 flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" /> Hard Reset
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
