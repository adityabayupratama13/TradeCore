import { useState } from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export function SystemCheck() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, boolean> | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/system-check', { method: 'POST' });
      const data = await res.json();
      setResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (val: boolean | undefined) => {
    if (val === undefined) return <div className="w-5 h-5 rounded-full bg-gray-800" />;
    return val ? <CheckCircle2 className="w-5 h-5 text-[#00D4AA]" /> : <XCircle className="w-5 h-5 text-red-500" />;
  };

  const allPassed = results && Object.values(results).every(v => v);

  return (
    <div className="bg-[#1A1A1A] border border-gray-800 rounded-xl p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
         <div>
           <h3 className="text-lg font-bold">System Health & Demo Test Checklist</h3>
           <p className="text-sm text-gray-400 mt-1">Validate all system nodes before running Demo Live API connections</p>
         </div>
         <button 
           onClick={runCheck}
           disabled={loading}
           className="px-6 py-2.5 bg-blue-600/10 text-blue-500 border border-blue-500/30 hover:bg-blue-600/20 rounded-lg transition-all font-medium flex items-center gap-2 whitespace-nowrap"
         >
           {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
           RUN SYSTEM CHECK
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.binance)}
           <span className={results?.binance === false ? 'text-red-400 font-medium' : 'text-gray-300'}>Binance API connected (ping test)</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.openrouter)}
           <span className={results?.openrouter === false ? 'text-red-400 font-medium' : 'text-gray-300'}>OpenRouter API config (test call)</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.telegram)}
           <span className={results?.telegram === false ? 'text-red-400 font-medium' : 'text-gray-300'}>Telegram bot connected</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.sqlite)}
           <span className={results?.sqlite === false ? 'text-red-400 font-medium' : 'text-gray-300'}>SQLite database writable</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.riskRules)}
           <span className={results?.riskRules === false ? 'text-red-400 font-medium' : 'text-gray-300'}>Risk rules configured</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.portfolio)}
           <span className={results?.portfolio === false ? 'text-red-400 font-medium' : 'text-gray-300'}>Portfolio capital set (not 0)</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.circuitBreaker)}
           <span className={results?.circuitBreaker === false ? 'text-red-400 font-medium' : 'text-gray-300'}>Circuit breaker working</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.demoTrades)}
           <span className={results?.demoTrades === false ? 'text-red-400 font-medium' : 'text-gray-300'}>At least 1 demo trade completed</span>
        </div>
        <div className="flex items-center gap-3 p-4 bg-black/40 rounded border border-gray-800/50">
           {getIcon(results?.backup)}
           <span className={results?.backup === false ? 'text-red-400 font-medium' : 'text-gray-300'}>Backup logic verified</span>
        </div>
      </div>

      {results && (
        <div className={`mt-8 p-5 rounded-lg flex items-center justify-center font-bold text-lg border ${allPassed ? 'bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/30 shadow-[0_0_20px_rgba(0,212,170,0.1)]' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
           {allPassed ? '✅ READY FOR LIVE TRADING' : '⚠️ Fix issues before going live'}
        </div>
      )}
    </div>
  );
}
