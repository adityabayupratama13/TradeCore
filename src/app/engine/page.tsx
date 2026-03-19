'use client';
import { useState, useEffect } from 'react';
import { Play, Square, Activity, AlertCircle, Clock, Zap, Target, History, RefreshCcw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function EngineDashboard() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

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

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (endpoint: string) => {
    setActionLoading(true);
    try {
      await fetch(`/api/engine/${endpoint}`, { method: 'POST' });
      await fetchStatus();
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
        </div>
      </div>

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
    </div>
  );
}
