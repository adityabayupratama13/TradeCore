'use client';
import { useState, useEffect } from 'react';
import { Play, Square, Activity, AlertCircle, Clock, Zap, Target, History, RefreshCcw, Grid } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function EngineDashboard() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [hunterWatchlist, setHunterWatchlist] = useState<any[]>([]);
  const [hunterActive, setHunterActive] = useState<any[]>([]);
  const [hunterScanning, setHunterScanning] = useState(false);
  const [emergencyLocked, setEmergencyLocked] = useState(false);

  // ── V7 Grid State ──
  const [v7Status, setV7Status]           = useState<any>(null);
  const [v7ActionLoading, setV7ActionLoading] = useState(false);
  const [v7Config, setV7Config]           = useState({
    symbol: 'ETHUSDT', leverage: 15, gridCount: 8, gridSpacingPct: 0.5, capitalPct: 85
  });
  const [showV7Config, setShowV7Config]   = useState(false);

  // ── V8 Grid State ──
  const [v8Status, setV8Status]           = useState<any>(null);
  const [v8ActionLoading, setV8ActionLoading] = useState(false);
  const [v8Config, setV8Config]           = useState({
    symbol: 'ETHUSDT', leverage: 20, gridCount: 12, gridSpacingPct: 0.3, capitalPct: 80
  });
  const [showV8Config, setShowV8Config]   = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/engine/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHunter = async () => {
    try {
      const [wlRes, apRes] = await Promise.all([
        fetch('/api/engine/watchlist'),
        fetch('/api/engine/active-pairs')
      ]);
      const wlData = await wlRes.json();
      const apData = await apRes.json();
      if (wlData.success) setHunterWatchlist(wlData.watchlist);
      if (apData.success) setHunterActive(apData.activePairs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchHunter();
    fetchV7Status();
    fetchV8Status();
    const interval = setInterval(() => {
      fetchStatus();
      fetchHunter();
      fetchV7Status();
      fetchV8Status();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchV7Status = async () => {
    try {
      const res  = await fetch('/api/engine/grid-v7/status');
      const data = await res.json();
      setV7Status(data);
    } catch (_) {}
  };

  const handleV7Start = async () => {
    setV7ActionLoading(true);
    try {
      const res = await fetch('/api/engine/grid-v7/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v7Config)
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ V7 Grid Bot started!\n${data.config.symbol} | ${data.config.leverage}x | ${data.config.spacing} | Range: ${data.config.range}`);
        await fetchV7Status();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setV7ActionLoading(false);
    }
  };

  const handleV7Stop = async () => {
    if (!confirm('Stop V7 Grid Bot? This will close all open positions.')) return;
    setV7ActionLoading(true);
    try {
      const res  = await fetch('/api/engine/grid-v7/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`🛑 V7 stopped.\nTotal Profit: $${data.totalProfit?.toFixed(2)} | Fills: ${data.totalFills}`);
        await fetchV7Status();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setV7ActionLoading(false);
    }
  };

  const fetchV8Status = async () => {
    try {
      const res  = await fetch('/api/engine/grid-v8/status');
      const data = await res.json();
      setV8Status(data);
    } catch (_) {}
  };

  const handleV8Start = async () => {
    setV8ActionLoading(true);
    try {
      const res = await fetch('/api/engine/grid-v8/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v8Config)
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ V8 Weekend Grid Bot started!\n${data.config.symbol} | ${data.config.leverage}x | ${data.config.spacing} | Range: ${data.config.range}`);
        await fetchV8Status();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setV8ActionLoading(false);
    }
  };

  const handleV8Stop = async () => {
    if (!confirm('Stop V8 Grid Bot? This will close all open positions.')) return;
    setV8ActionLoading(true);
    try {
      const res  = await fetch('/api/engine/grid-v8/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`🛑 V8 stopped.\nTotal Profit: $${data.totalProfit?.toFixed(2)} | Fills: ${data.totalFills}`);
        await fetchV8Status();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setV8ActionLoading(false);
    }
  };

  const handleScanNow = async () => {
    setHunterScanning(true);
    try {
      const res = await fetch('/api/engine/scan-pairs', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setHunterWatchlist(data.watchlist);
        setHunterActive(data.activePairs);
      }
    } finally {
      setHunterScanning(false);
    }
  };

  const handleAction = async (endpoint: string) => {
    setActionLoading(true);
    try {
      if (endpoint === 'test-trade') {
         const res = await fetch(`/api/engine/test-trade`, { method: 'POST' });
         const data = await res.json();
         if (!res.ok || !data.success) {
            alert(`❌ Error: ${data.error || 'Test trade failed'}`);
         } else {
            alert(`✅ Order #${data.orderId} — ${data.side} ${data.symbol} @ $${data.price}\nCheck Binance Demo → Positions tab`);
         }
      } else if (endpoint === 'clear-lock') {
         const res = await fetch(`/api/risk/clear-lock`, { method: 'POST' });
         const data = await res.json();
         if (data.success) {
            setEmergencyLocked(false);
            alert(`✅ ${data.message}`);
         } else {
            alert(`❌ Error: ${data.error || 'Failed to clear lock'}`);
         }
      } else if (endpoint === 'manual-lock') {
         const res = await fetch(`/api/engine/manual-lock`, { method: 'POST' });
         const data = await res.json();
         if (data.success) {
            setEmergencyLocked(true);
            alert(`✅ ${data.message}`);
         }
      } else {
         await fetch(`/api/engine/${endpoint}`, { method: 'POST' });
         await fetchStatus();
      }
    } catch (e: any) {
         alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !status) return <div className="p-8 text-center text-gray-400 animate-pulse">Initializing Engine Telemetry...</div>;
  if (!status) return <div className="p-8 text-center text-red-500">Failed to connect to Neural Engine</div>;

  const isRunning = status.isRunning;

  const getTriggerBadge = (trigger: string) => {
    switch (trigger) {
      case 'BREAKOUT': return <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-xs font-bold border border-red-500/30">BREAKOUT</span>;
      case 'VOLUME_SPIKE': return <span className="bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded text-xs font-bold border border-orange-500/30">VOLUME_SPIKE</span>;
      case 'EMA_CROSS': return <span className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded text-xs font-bold border border-blue-500/30">EMA_CROSS</span>;
      case 'MOMENTUM_CONTINUATION': return <span className="bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded text-xs font-bold border border-purple-500/30">MOMENTUM_CONT</span>;
      case 'RSI_REVERSAL': return <span className="bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded text-xs font-bold border border-yellow-500/30">RSI_REV</span>;
      case 'SCHEDULED_FALLBACK': return <span className="bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded text-xs font-bold border border-gray-500/30">FALLBACK</span>;
      default: return <span className="text-gray-600">None</span>;
    }
  };

  const getDurationBadge = (duration: string) => {
    if (!duration) return null;
    if (duration.includes('1-2')) return <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-bold border border-green-500/30">⏱ {duration}</span>;
    if (duration.includes('2-4')) return <span className="bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded text-xs font-bold border border-yellow-500/30">⏱ {duration}</span>;
    if (duration.includes('4-8')) return <span className="bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded text-xs font-bold border border-orange-500/30">⏱ {duration}</span>;
    return <span className="bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded text-xs font-bold border border-gray-500/30">⏱ {duration}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#1A1A1A] p-6 rounded-xl border border-gray-800">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className={`w-6 h-6 ${isRunning ? 'text-[#00D4AA] animate-pulse' : 'text-gray-500'}`} />
            Autonomous Trading Engine
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            LLM-driven market evaluation and execution core.
          </p>
        </div>

        <div className="flex gap-3">
          {isRunning ? (
            <button 
              onClick={() => handleAction('stop')}
              disabled={actionLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-all font-medium disabled:opacity-50"
            >
              <Square className="w-4 h-4" /> STOP ENGINE
            </button>
          ) : (
            <button 
              onClick={() => handleAction('start')}
              disabled={actionLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#00D4AA]/10 text-[#00D4AA] border border-[#00D4AA]/30 rounded-lg hover:bg-[#00D4AA]/20 transition-all font-medium disabled:opacity-50"
            >
              <Play className="w-4 h-4" /> START ENGINE
            </button>
          )}
          <button 
            onClick={() => handleAction('run-now')}
            disabled={actionLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-500/10 text-blue-500 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-all font-medium disabled:opacity-50"
          >
            <RefreshCcw className="w-4 h-4" /> RUN CYCLE NOW
          </button>
          <button 
            onClick={() => handleAction('test-trade')}
            disabled={actionLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-all font-medium disabled:opacity-50"
          >
            <Zap className="w-4 h-4" /> 🧪 TEST TRADE
          </button>
          <button 
            onClick={() => handleAction('manual-lock')}
            disabled={actionLoading || emergencyLocked}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white border border-red-500 rounded-lg transition-all font-bold tracking-wide shadow-lg disabled:opacity-50"
          >
            🔒 LOCK TRADING NOW
          </button>
        </div>
      </div>

      {emergencyLocked && (
        <div className="bg-red-500/20 border-l-4 border-red-500 p-4 rounded-r-lg mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex gap-3">
            <AlertCircle className="text-red-500 w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-500 font-bold text-lg">🚨 TRADING LOCKED (EMERGENCY)</h3>
              <p className="text-red-400 text-sm mt-1 mb-0">
                Circuit breaker is active. All new entries are blocked. Open orders were cancelled.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* UNPROTECTED POSITIONS BANNER */}
      {status?.unprotectedPositions?.length > 0 && (
        <div className="bg-red-500/20 border-l-4 border-red-500 p-4 rounded-r-lg mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex gap-3">
            <AlertCircle className="text-red-500 w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-500 font-bold text-lg">🚨 UNPROTECTED POSITION DETECTED</h3>
              <p className="text-red-400 text-sm mt-1 mb-0">
                {status.unprotectedPositions.map((p: any) => `${p.symbol} ${p.direction}`).join(', ')} has no Stop Loss order!
              </p>
            </div>
          </div>
          <button
            onClick={() => handleAction('close-all')} // Assuming close-all closes positions
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-lg transition-colors shrink-0"
          >
            [CLOSE NOW]
          </button>
        </div>
      )}

      {/* METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-400 mb-2">Engine Modules</div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-[#00D4AA] shadow-[0_0_10px_#00D4AA]' : 'bg-red-500'}`}></div>
              👁️ PriceWatcher: <span className="text-gray-300 ml-auto">{isRunning ? 'ACTIVE (60s)' : 'STOPPED'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-blue-400 shadow-[0_0_10px_#60A5FA]' : 'bg-red-500'}`}></div>
              🤖 AIAnalyzer: <span className="text-gray-300 ml-auto">{isRunning ? 'READY / STANDBY' : 'STOPPED'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-purple-400 shadow-[0_0_10px_#A78BFA]' : 'bg-red-500'}`}></div>
              📊 PosManager: <span className="text-gray-300 ml-auto">{isRunning ? 'ACTIVE (5m)' : 'STOPPED'}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-400 mb-1">Global Health</div>
          <div className="text-3xl font-bold flex items-center gap-2 mt-3">
            <Activity className="w-6 h-6 text-blue-400" />
            {status.tradesToday} Trades Today
          </div>
          <div className="text-xs text-gray-500 mt-2">
            LLM Usage heavily constrained by Trigger Logic
          </div>
        </div>

        <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-5">
          <div className="text-sm text-gray-400 mb-1">Last System Pulse</div>
          <div className="text-2xl font-bold flex items-center gap-2 mt-2">
            <Clock className="w-5 h-5 text-gray-500" />
            {status.lastRun ? formatDistanceToNow(new Date(status.lastRun), { addSuffix: true }) : 'Never'}
          </div>
        </div>
      </div>

      {/* 🦅 DYNAMIC HUNTER SECTION */}
      <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#151515]">
          <div>
            <h2 className="font-bold flex items-center gap-2 text-blue-400">
              🦅 Dynamic Hunter
            </h2>
            <div className="text-xs text-gray-500 mt-1 flex gap-4">
              <span>Scanning 250+ USDT Pairs Hourly</span>
            </div>
          </div>
          <button 
            onClick={handleScanNow}
            disabled={hunterScanning}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded text-sm hover:bg-blue-500/20 disabled:opacity-50"
          >
             <RefreshCcw className={`w-3.5 h-3.5 ${hunterScanning ? 'animate-spin' : ''}`} /> {hunterScanning ? 'Scanning...' : 'SCAN NOW'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
           {/* LEFT: WATCHLIST TABLE */}
           <div className="col-span-2 border-r border-gray-800">
             {hunterWatchlist.length > 0 && hunterWatchlist.length < 3 && !hunterScanning && (
                <div className="bg-orange-500/10 border-b border-orange-500/20 p-3 text-orange-400 text-xs flex flex-col justify-center items-center text-center">
                  <span className="font-bold flex items-center gap-1 mb-1">⚠️ Market conditions neutral</span>
                  <span>fewer than 3 high-signal pairs found. Engine monitoring all SAFE_UNIVERSE coins. Waiting for clearer setups.</span>
                </div>
             )}
             <div className="p-3 border-b border-gray-800 bg-black/20 text-xs font-bold text-gray-400">
               TOP 20 WATCHLIST
             </div>
             <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
               <table className="w-full text-xs text-left">
                 <thead className="text-gray-500 uppercase bg-black/40 sticky top-0">
                   <tr>
                     <th className="px-3 py-2">Sym</th>
                     <th className="px-3 py-2">Funding</th>
                     <th className="px-3 py-2">Cat</th>
                     <th className="px-3 py-2">OI (1h)</th>
                     <th className="px-3 py-2">Signal</th>
                     <th className="px-3 py-2">Smart $$$</th>
                   </tr>
                 </thead>
                 <tbody>
                    {hunterWatchlist.length === 0 ? (
                      <tr><td colSpan={6} className="p-4 text-center text-gray-500">Not scanned yet</td></tr>
                    ) : (
                      hunterWatchlist.map((w: any, idx: number) => (
                        <tr key={w.symbol} className={`border-b border-gray-800/20 ${w.fundingCategory === 'EXTREME' ? 'bg-red-500/5 hover:bg-red-500/10' : w.fundingCategory === 'HIGH' ? 'bg-orange-500/5 hover:bg-orange-500/10' : 'hover:bg-white/5'}`}>
                           <td className="px-3 py-2 font-mono font-bold flex items-center gap-1">
                             {w.tier === 'ACTIVE' && <Zap className="w-3 h-3 text-[#00D4AA]" />} {w.symbol}
                           </td>
                           <td className={`px-3 py-2 ${w.fundingRate > 0 ? 'text-green-400' : 'text-red-400'}`}>{(w.fundingRate*100).toFixed(4)}%</td>
                           <td className="px-3 py-2">{w.fundingCategory}</td>
                           <td className="px-3 py-2">
                             <div className="flex flex-col">
                               <span>{w.oiValue}</span>
                               <span className={w.oiChange1h && w.oiChange1h !== 'N/A' ? (w.oiChange1h.includes('+') ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}>{w.oiChange1h}</span>
                             </div>
                           </td>
                           <td className="px-3 py-2 text-[10px] leading-tight max-w-[80px]">
                             {w.oiSignal?.type}
                           </td>
                           <td className="px-3 py-2">
                             {w.oiData?.topTraderLsRatio > 1.2 ? '🟢' : w.oiData?.topTraderLsRatio < 0.8 ? '🔴' : '⚪'}
                           </td>
                        </tr>
                      ))
                    )}
                 </tbody>
               </table>
             </div>
           </div>

           {/* RIGHT: TOP 5 ACTIVE CARDS */}
           <div className="col-span-1 bg-black/10">
             <div className="p-3 border-b border-gray-800 bg-black/20 text-xs font-bold text-[#00D4AA]">
               ⚡ ACTIVE TRADING PAIRS (TOP 5)
             </div>
             <div className="p-3 space-y-3 max-h-[450px] overflow-y-auto custom-scrollbar">
                {hunterActive.length === 0 ? (
                  <div className="text-center text-gray-500 mt-10">No active pairs</div>
                ) : (
                  hunterActive.map((a: any) => (
                     <div key={a.symbol} className="bg-[#151515] border border-gray-800 rounded p-3">
                        <div className="flex justify-between items-center mb-2">
                           <span className="font-bold text-lg">{a.symbol}</span>
                           <span className={`text-sm font-mono ${a.fundingRate > 0 ? 'text-green-400' : 'text-red-400'}`}>
                             {(a.fundingRate*100).toFixed(4)}%
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-xs mb-2">
                           <span className="bg-gray-800/50 px-2 py-0.5 rounded text-gray-300">
                             {a.fundingCategory === 'EXTREME' ? '🔥 EXTREME' : a.fundingCategory === 'HIGH' ? '⚠️ HIGH' : 'NORMAL'}
                           </span>
                           <span className={`px-2 py-0.5 rounded border ${a.squeezeRisk === 'HIGH' ? 'border-red-500/30 text-red-400' : a.squeezeRisk === 'LOW' ? 'border-green-500/30 text-green-400' : 'border-orange-500/30 text-orange-400'}`}>
                             Risk: {a.squeezeRisk}
                           </span>
                        </div>
                        <div className="bg-black/40 border border-gray-800/50 p-2 rounded text-xs flex justify-between mb-2">
                           <span className="text-gray-400">Bias:</span>
                           <span className={a.biasSide === 'PREFER_SHORT' ? 'text-red-400 font-bold' : a.biasSide === 'PREFER_LONG' ? 'text-green-400 font-bold' : 'text-gray-300'}>
                             {a.biasSide}
                           </span>
                        </div>

                        <div className="bg-blue-900/10 border border-blue-500/20 p-2 rounded flex flex-col gap-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">OI: {a.oiValue}</span>
                            <span className={a.oiChange1h && a.oiChange1h !== 'N/A' ? (a.oiChange1h.includes('+') ? 'text-green-400 font-bold' : 'text-red-400 font-bold') : 'text-gray-500 font-bold'}>{a.oiChange1h} {a.oiChange1h !== 'N/A' ? '(1h)' : ''}</span>
                          </div>
                          
                          <div className={`text-center font-bold py-1 flex items-center justify-center gap-1 rounded ${
                            a.oiSignal?.type.includes('SHORT_SQUEEZE') ? 'bg-red-500/20 text-red-500 animate-pulse' :
                            a.oiSignal?.type.includes('LONG_SQUEEZE') ? 'bg-red-500/20 text-red-500 animate-pulse' :
                            a.oiSignal?.type.includes('TREND_CONTINUATION') ? 'bg-green-500/20 text-green-500' :
                            a.oiSignal?.type.includes('SHORT_COVERING') ? 'bg-yellow-500/20 text-yellow-500' :
                            a.oiSignal?.type.includes('ACCUMULATION') ? 'bg-blue-500/20 text-blue-500' :
                            a.oiSignal?.type.includes('DISTRIBUTION') ? 'bg-orange-500/20 text-orange-500' :
                            'bg-gray-800 text-gray-400'
                          }`}>
                            {a.oiSignal?.type === 'SHORT_SQUEEZE_SETUP' ? '🚨 SHORT SQUEEZE' :
                             a.oiSignal?.type === 'LONG_SQUEEZE_SETUP' ? '🚨 LONG SQUEEZE' :
                             a.oiSignal?.type === 'TREND_CONTINUATION' ? '📈 TREND CONT.' :
                             a.oiSignal?.type === 'SHORT_COVERING' ? '⚠️ SHORT COVER' :
                             a.oiSignal?.type === 'ACCUMULATION' ? '📊 ACCUMULATION' :
                             a.oiSignal?.type === 'DISTRIBUTION' ? '📉 DISTRIBUTION' :
                             a.oiSignal?.type}
                          </div>

                          <div className="flex justify-between items-center mt-1">
                            <span className="text-gray-400">Smart $$$:</span>
                            <span className={a.oiData?.topTraderLsRatio > 1.2 ? 'text-green-400' : a.oiData?.topTraderLsRatio < 0.8 ? 'text-red-400' : 'text-gray-400'}>
                              {a.oiData?.topTraderLsRatio > 1.2 ? '↑ Longs' : a.oiData?.topTraderLsRatio < 0.8 ? '↓ Shorts' : 'Neutral'}
                            </span>
                          </div>

                          <div className="flex flex-col mt-1">
                            <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                              <span>Taker Flow (15m)</span>
                              <span>{a.oiData ? (a.oiData.takerBuyRatio * 100).toFixed(0) : 50}% / {a.oiData ? (a.oiData.takerSellRatio * 100).toFixed(0) : 50}%</span>
                            </div>
                            <div className="w-full h-1.5 flex rounded-full overflow-hidden bg-gray-800">
                              <div className="bg-green-500 h-full" style={{ width: `${a.oiData ? (a.oiData.takerBuyRatio * 100) : 50}%` }}></div>
                              <div className="bg-red-500 h-full" style={{ width: `${a.oiData ? (a.oiData.takerSellRatio * 100) : 50}%` }}></div>
                            </div>
                          </div>
                        </div>
                     </div>
                  ))
                )}
             </div>
           </div>
        </div>
        <div className="bg-[#111] p-3 text-center text-xs text-gray-500 border-t border-gray-800">
          Pairs auto-rotate every 1 hour based on real-time market liquidations and crowd positioning.
        </div>
      </div>

      {/* PRICE WATCHER STATUS TABLE */}
      <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl flex flex-col overflow-hidden">
         <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#151515]">
            <h2 className="font-bold flex items-center gap-2 text-yellow-500">
              <Zap className="w-5 h-5" /> Layer 1: Price Watcher Matrix
            </h2>
         </div>
         <div className="overflow-x-auto">
           <table className="w-full text-sm text-left">
             <thead className="text-xs text-gray-500 uppercase bg-black/40 border-b border-gray-800">
               <tr>
                 <th className="px-5 py-4">Symbol</th>
                 <th className="px-5 py-4">Last Polled</th>
                 <th className="px-5 py-4">Last AI Call</th>
                 <th className="px-5 py-4">Last Trigger</th>
                 <th className="px-5 py-4">Status & Cooldown</th>
                 <th className="px-5 py-4">Next Fallback</th>
               </tr>
             </thead>
             <tbody>
               {status.watcherStatus && Object.keys(status.watcherStatus).map((sym: string) => {
                  const w = status.watcherStatus[sym];
                  return (
                    <tr key={sym} className="border-b border-gray-800/30 hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 font-bold">{sym}</td>
                      <td className="px-5 py-3 text-gray-300">{w.lastCheckSecs !== null ? `${w.lastCheckSecs}s ago` : 'Never'}</td>
                      <td className="px-5 py-3 text-gray-300">{w.lastAiCallMins !== null ? `${w.lastAiCallMins}m ago` : 'Never'}</td>
                      <td className="px-5 py-3">
                         {w.lastTrigger !== 'None' ? (
                            <div className="flex flex-col gap-1 items-start">
                              {getTriggerBadge(w.lastTrigger)}
                              {w.lastTriggerTime && <span className="text-[10px] text-gray-500">{formatDistanceToNow(new Date(w.lastTriggerTime), {addSuffix: true})}</span>}
                            </div>
                         ) : <span className="text-gray-600">None</span>}
                      </td>
                      <td className="px-5 py-3">
                         {w.cooldownRemainingMins > 0 ? (
                             <span className="text-red-400 bg-red-500/10 px-2 py-1 rounded inline-flex items-center gap-1">Wait {w.cooldownRemainingMins}m</span>
                         ) : (
                             <span className="text-[#00D4AA] bg-[#00D4AA]/10 px-2 py-1 rounded inline-flex items-center gap-1">Ready</span>
                         )}
                      </td>
                      <td className="px-5 py-3 text-gray-300">
                         {w.nextForcedMin > 0 ? (
                            <span className="text-blue-400 font-mono bg-blue-500/10 px-2 py-1 rounded">in {w.nextForcedMin}m</span>
                         ) : (
                            <span className="text-purple-400 font-mono bg-purple-500/10 px-2 py-1 rounded">Pending</span>
                         )}
                      </td>
                    </tr>
                  )
               })}
             </tbody>
           </table>
         </div>
      </div>

      {/* TODAY'S PERFORMANCE (New) */}
      {status.performanceStats && (
        <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-5">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-400" /> Today's Performance
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
             <div className="bg-[#151515] p-3 rounded border border-gray-800">
               <div className="text-xs text-gray-500 mb-1">Trades Today</div>
               <div className="text-xl font-bold">{status.performanceStats.total}</div>
             </div>
             <div className="bg-[#151515] p-3 rounded border border-gray-800">
               <div className="text-xs text-gray-500 mb-1">Win/Loss</div>
               <div className="text-xl font-bold text-gray-300">
                  <span className="text-[#00D4AA]">{status.performanceStats.wins}</span> / <span className="text-red-500">{status.performanceStats.losses}</span>
               </div>
             </div>
             <div className="bg-[#151515] p-3 rounded border border-gray-800">
               <div className="text-xs text-gray-500 mb-1">Net P&L</div>
               <div className={`text-xl font-bold ${status.performanceStats.netPnl >= 0 ? 'text-[#00D4AA]' : 'text-red-500'}`}>
                  {status.performanceStats.netPnl > 0 ? '+' : ''}{status.performanceStats.netPnl.toFixed(2)}%
               </div>
             </div>
             <div className="bg-[#151515] p-3 rounded border border-gray-800">
               <div className="text-xs text-gray-500 mb-1">Best Trade</div>
               <div className="text-xl font-bold text-[#00D4AA]">
                  +{status.performanceStats.bestTrade.toFixed(2)}%
               </div>
             </div>
             <div className="bg-[#151515] p-3 rounded border border-gray-800">
               <div className="text-xs text-gray-500 mb-1">Partial TPs</div>
               <div className="text-xl font-bold text-orange-400">{status.performanceStats.partials}</div>
             </div>
             <div className="bg-[#151515] p-3 rounded border border-gray-800">
               <div className="text-xs text-gray-500 mb-1">Breakevens</div>
               <div className="text-xl font-bold text-blue-400">{status.performanceStats.breakevens}</div>
             </div>
          </div>
        </div>
      )}

      {/* TODAY'S BLACKLIST (FAST SL RULE & MAX TRADES) */}
      <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-5">
        <h2 className="font-bold mb-4 flex items-center gap-2 text-red-400">
          <Square className="w-5 h-5 text-red-500" /> Today's Constrained / Blocked Coins
        </h2>
        {status.blacklistedCoins?.length === 0 ? (
          <div className="bg-[#151515] p-3 rounded border border-gray-800 text-gray-400 flex items-center gap-2">
            ✅ No coins currently blacklisted or constrained
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {status.blacklistedCoins?.map((coin: any) => (
              <div key={coin.symbol} className="bg-red-500/10 p-3 rounded border border-red-500/20 flex flex-col">
                <div className="font-bold text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {coin.symbol}</div>
                <div className="text-xs text-gray-400 mt-1 mb-2">Blocked: {coin.reason || 'Fast SL (≤5m loss)'}</div>
                <div className="text-xs font-mono text-gray-500 mt-auto">{coin.reason?.includes('Max Trades') ? 'Resumes: Tomorrow' : `Resumes: ${format(new Date(coin.until), 'yyyy-MM-dd HH:mm')}`}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TWO COLUMNS: SIGNALS & LOGS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LIVE SIGNALS FEED */}
        <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl flex flex-col h-[600px]">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center">
            <h2 className="font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#00D4AA]" /> AI Signal Feed
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {status.signalHistory?.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">No signals generated yet.</div>
            ) : (
              status.signalHistory?.map((sig: any, i: number) => (
                <div key={i} className="bg-[#222] border border-gray-800/50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{sig.symbol}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        sig.action === 'LONG' || sig.action === 'BUY' ? 'bg-[#00D4AA]/20 text-[#00D4AA]' : 
                        sig.action === 'SHORT' || sig.action === 'SELL' ? 'bg-red-500/20 text-red-500' : 
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {sig.action}
                      </span>
                      {sig.action !== 'SKIP' && sig.estimatedDuration && getDurationBadge(sig.estimatedDuration)}
                    </div>
                    <span className="text-xs text-gray-500">{formatDistanceToNow(new Date(sig.createdAt), { addSuffix: true })}</span>
                  </div>
                  <p className="text-sm text-gray-300 mb-3">{sig.reasoning}</p>
                  
                  {sig.action !== 'SKIP' && (
                    <div className="grid grid-cols-3 gap-2 text-xs bg-black/30 p-2 rounded border border-gray-800">
                      <div><span className="text-gray-500">Entry:</span> {sig.entryPrice}</div>
                      <div><span className="text-gray-500 text-red-500/70">SL:</span> {sig.stopLoss}</div>
                      <div><span className="text-gray-500 text-[#00D4AA]/70">TP:</span> {sig.takeProfit}</div>
                      <div><span className="text-gray-500">Lev:</span> {sig.leverage}x</div>
                      <div><span className="text-gray-500">Conf:</span> {sig.confidence}%</div>
                      <div><span className="text-gray-500">R/R:</span> {sig.riskReward}</div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RAW SYSTEM LOGS */}
        <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl flex flex-col h-[600px]">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#151515] rounded-t-xl">
            <h2 className="font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-gray-400" /> System Evaluation Logs
            </h2>
            <div className="text-xs text-gray-500 bg-black px-2 py-1 rounded">Cycle #{status.cycleCount}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/20 font-mono text-sm space-y-2">
            {status.recentLogs?.length === 0 ? (
              <div className="text-center text-gray-600 mt-10">Awaiting first engine run...</div>
            ) : (
              status.recentLogs?.map((log: any, i: number) => (
                <div key={i} className="flex gap-3 pb-2 border-b border-gray-800/30">
                  <span className="text-gray-600 whitespace-nowrap">
                    {format(new Date(log.createdAt), 'HH:mm:ss')}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${
                        log.result === 'EXECUTED' ? 'text-[#00D4AA]' :
                        log.result === 'BLOCKED' ? 'text-red-500' :
                        log.result === 'ERROR' ? 'text-orange-500' : 'text-gray-400'
                      }`}>
                        [{log.result}]
                      </span>
                      {log.symbol && <span className="text-blue-400">{log.symbol}</span>}
                      {log.action && <span className="text-gray-300">Action: {log.action}</span>}
                    </div>
                    {log.reason && <div className="text-gray-500 mt-0.5 text-xs">{log.reason}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
      {/* ═══════════════════════════════════════════════════════ */}
      {/* V7 SMART GRID BOT PANEL                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="bg-[#0D1117] border border-blue-500/30 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-blue-500/20 flex justify-between items-center bg-gradient-to-r from-blue-900/20 to-transparent">
          <div>
            <h2 className="font-bold flex items-center gap-2 text-blue-400 text-lg">
              <Grid className="w-5 h-5" />
              V7 Smart Grid Bot
              <span className="text-xs font-normal text-gray-500 ml-1">— 15x | 8 grids | 0.5% spacing</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Soft Expand mode · No auto-close · No SL · No circuit breaker</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${
              v7Status?.isActive
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 animate-pulse'
                : 'bg-gray-800 text-gray-500 border-gray-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${ v7Status?.isActive ? 'bg-blue-400' : 'bg-gray-600' }`} />
              {v7Status?.isActive ? 'ACTIVE' : 'IDLE'}
            </div>
            {/* Start / Stop button */}
            {v7Status?.isActive ? (
              <button
                onClick={handleV7Stop}
                disabled={v7ActionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50"
              >
                <Square className="w-4 h-4" /> STOP V7
              </button>
            ) : (
              <button
                onClick={handleV7Start}
                disabled={v7ActionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-all text-sm font-medium disabled:opacity-50"
              >
                <Play className="w-4 h-4" /> START V7
              </button>
            )}
            {/* Config toggle */}
            {!v7Status?.isActive && (
              <button
                onClick={() => setShowV7Config(!showV7Config)}
                className="px-3 py-2 bg-gray-800 text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm transition-all"
              >
                ⚙️ Config
              </button>
            )}
          </div>
        </div>

        {/* Config panel (only when idle) */}
        {showV7Config && !v7Status?.isActive && (
          <div className="p-4 border-b border-blue-500/10 bg-black/20">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Symbol</label>
                <input value={v7Config.symbol} onChange={e => setV7Config({...v7Config, symbol: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Leverage</label>
                <input type="number" value={v7Config.leverage} onChange={e => setV7Config({...v7Config, leverage: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Grid Count</label>
                <input type="number" value={v7Config.gridCount} onChange={e => setV7Config({...v7Config, gridCount: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Spacing %</label>
                <input type="number" step="0.1" value={v7Config.gridSpacingPct} onChange={e => setV7Config({...v7Config, gridSpacingPct: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Capital %</label>
                <input type="number" value={v7Config.capitalPct} onChange={e => setV7Config({...v7Config, capitalPct: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
            </div>
          </div>
        )}

        {/* Live stats (only when active) */}
        {v7Status?.isActive && (
          <div className="p-4">
            {/* Range bar */}
            <div className="mb-4 bg-black/30 rounded-lg p-3 border border-gray-800">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Lower: <span className="text-blue-300 font-mono">${v7Status.lowerBound?.toFixed(2)}</span></span>
                <span className="text-gray-400">⟵ Grid Range ⟶</span>
                <span>Upper: <span className="text-blue-300 font-mono">${v7Status.upperBound?.toFixed(2)}</span></span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-[#151d2e] border border-blue-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Total Profit</div>
                <div className={`text-xl font-bold ${ (v7Status.totalProfit||0) >= 0 ? 'text-blue-400' : 'text-red-400' }`}>
                  ${(v7Status.totalProfit||0).toFixed(3)}
                </div>
              </div>
              <div className="bg-[#151d2e] border border-blue-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Total Fills</div>
                <div className="text-xl font-bold text-white">{v7Status.totalFills||0}</div>
              </div>
              <div className="bg-[#151d2e] border border-blue-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Active Orders</div>
                <div className="text-xl font-bold text-green-400">{v7Status.activeLevels||0}</div>
              </div>
              <div className="bg-[#151d2e] border border-blue-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Filled Levels</div>
                <div className="text-xl font-bold text-yellow-400">{v7Status.filledLevels||0}</div>
              </div>
              <div className="bg-[#151d2e] border border-blue-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Soft Expands</div>
                <div className={`text-xl font-bold ${ (v7Status.expandCount||0) >= 5 ? 'text-red-400' : 'text-orange-400' }`}>
                  {v7Status.expandCount||0}×
                </div>
              </div>
              <div className="bg-[#151d2e] border border-blue-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Runtime</div>
                <div className="text-sm font-bold text-gray-300">{v7Status.runtime||'—'}</div>
              </div>
            </div>

            {/* Config summary */}
            <div className="mt-3 flex gap-3 text-xs text-gray-500">
              <span>📊 {v7Status.symbol}</span>
              <span>⚡ {v7Status.leverage}x</span>
              <span>📦 {v7Status.totalLevels} levels</span>
              <span>📏 {v7Status.gridSpacingPct}% spacing</span>
              <span>🕐 Last cycle: {v7Status.lastCycleAt ? formatDistanceToNow(new Date(v7Status.lastCycleAt), { addSuffix: true }) : '—'}</span>
            </div>
          </div>
        )}

        {/* Idle state */}
        {!v7Status?.isActive && !showV7Config && (
          <div className="p-8 text-center text-gray-600">
            <Grid className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p>V7 Grid Bot is idle. Click <span className="text-blue-400">START V7</span> to launch.</p>
            <p className="text-xs mt-1 text-gray-700">Default: ETHUSDT · 15x · 8 grids · 0.5% · 85% capital</p>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* V8 WEEKEND GRID BOT PANEL                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="bg-[#0D1117] border border-purple-500/30 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-purple-500/20 flex justify-between items-center bg-gradient-to-r from-purple-900/20 to-transparent">
          <div>
            <h2 className="font-bold flex items-center gap-2 text-purple-400 text-lg">
              <Grid className="w-5 h-5" />
              V8 Smart Grid Bot
              <span className="text-xs font-normal text-gray-500 ml-1">— 20x | 12 grids | 0.3% spacing</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">V6-proven 0.3% spacing · 20x leverage · Wider range · Soft Expand · No CB</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${
              v8Status?.isActive
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 animate-pulse'
                : 'bg-gray-800 text-gray-500 border-gray-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${ v8Status?.isActive ? 'bg-purple-400' : 'bg-gray-600' }`} />
              {v8Status?.isActive ? 'ACTIVE' : 'IDLE'}
            </div>
            {v8Status?.isActive ? (
              <button
                onClick={handleV8Stop}
                disabled={v8ActionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50"
              >
                <Square className="w-4 h-4" /> STOP V8
              </button>
            ) : (
              <button
                onClick={handleV8Start}
                disabled={v8ActionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-all text-sm font-medium disabled:opacity-50"
              >
                <Play className="w-4 h-4" /> START V8
              </button>
            )}
            {!v8Status?.isActive && (
              <button
                onClick={() => setShowV8Config(!showV8Config)}
                className="px-3 py-2 bg-gray-800 text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm transition-all"
              >
                ⚙️ Config
              </button>
            )}
          </div>
        </div>

        {/* Config panel */}
        {showV8Config && !v8Status?.isActive && (
          <div className="p-4 border-b border-purple-500/10 bg-black/20">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Symbol</label>
                <input value={v8Config.symbol} onChange={e => setV8Config({...v8Config, symbol: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Leverage</label>
                <input type="number" value={v8Config.leverage} onChange={e => setV8Config({...v8Config, leverage: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Grid Count</label>
                <input type="number" value={v8Config.gridCount} onChange={e => setV8Config({...v8Config, gridCount: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Spacing %</label>
                <input type="number" step="0.05" value={v8Config.gridSpacingPct} onChange={e => setV8Config({...v8Config, gridSpacingPct: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Capital %</label>
                <input type="number" value={v8Config.capitalPct} onChange={e => setV8Config({...v8Config, capitalPct: +e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" />
              </div>
            </div>
          </div>
        )}

        {/* Live stats */}
        {v8Status?.isActive && (
          <div className="p-4">
            <div className="mb-4 bg-black/30 rounded-lg p-3 border border-gray-800">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Lower: <span className="text-purple-300 font-mono">${v8Status.lowerBound?.toFixed(2)}</span></span>
                <span className="text-gray-400">⟵ Grid Range ⟶</span>
                <span>Upper: <span className="text-purple-300 font-mono">${v8Status.upperBound?.toFixed(2)}</span></span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-[#1a1528] border border-purple-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Total Profit</div>
                <div className={`text-xl font-bold ${ (v8Status.totalProfit||0) >= 0 ? 'text-purple-400' : 'text-red-400' }`}>
                  ${(v8Status.totalProfit||0).toFixed(3)}
                </div>
              </div>
              <div className="bg-[#1a1528] border border-purple-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Total Fills</div>
                <div className="text-xl font-bold text-white">{v8Status.totalFills||0}</div>
              </div>
              <div className="bg-[#1a1528] border border-purple-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Active Orders</div>
                <div className="text-xl font-bold text-green-400">{v8Status.activeLevels||0}</div>
              </div>
              <div className="bg-[#1a1528] border border-purple-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Filled Levels</div>
                <div className="text-xl font-bold text-yellow-400">{v8Status.filledLevels||0}</div>
              </div>
              <div className="bg-[#1a1528] border border-purple-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Soft Expands</div>
                <div className={`text-xl font-bold ${ (v8Status.expandCount||0) >= 5 ? 'text-red-400' : 'text-orange-400' }`}>
                  {v8Status.expandCount||0}×
                </div>
              </div>
              <div className="bg-[#1a1528] border border-purple-900/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Runtime</div>
                <div className="text-sm font-bold text-gray-300">{v8Status.runtime||'—'}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-3 text-xs text-gray-500">
              <span>📊 {v8Status.symbol}</span>
              <span>⚡ {v8Status.leverage}x</span>
              <span>📦 {v8Status.totalLevels} levels</span>
              <span>📏 {v8Status.gridSpacingPct}% spacing</span>
              <span>🕐 Last cycle: {v8Status.lastCycleAt ? formatDistanceToNow(new Date(v8Status.lastCycleAt), { addSuffix: true }) : '—'}</span>
            </div>
          </div>
        )}

        {/* Idle state */}
        {!v8Status?.isActive && !showV8Config && (
          <div className="p-8 text-center text-gray-600">
            <Grid className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p>V8 Smart Grid Bot is idle. Click <span className="text-purple-400">START V8</span> to launch.</p>
            <p className="text-xs mt-1 text-gray-700">Default: ETHUSDT · 20x · 12 grids · 0.3% · 80% capital</p>
          </div>
        )}
      </div>

    </div>
  );
}
