"use client";

import { useState, useEffect } from "react";
import { Download, Database, Code, Heart, Settings } from "lucide-react";

export function AboutBox() {
  const [stats, setStats] = useState<any>(null);
  
  useEffect(() => {
    fetch('/api/settings/db-stats')
      .then(r => r.json())
      .then(d => setStats(d));
  }, []);

  const handleExport = (type: 'json' | 'csv') => {
    window.location.href = `/api/export/${type}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* App Info */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg flex flex-col items-center justify-center text-center py-12">
         <div className="w-20 h-20 bg-gradient-to-br from-[#00D4AA] to-[#3d7fff] rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-[#00D4AA]/20">
           <Settings className="w-10 h-10 text-white" />
         </div>
         <h1 className="text-3xl font-bold text-white tracking-widest uppercase mb-2">TradeCore</h1>
         <div className="text-[#3d7fff] font-mono mb-6">v1.0.0 — Production</div>
         
         <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-sm mx-auto">
           <span className="bg-[#1a2540] text-gray-300 text-xs px-3 py-1 rounded font-mono">Next.js 14</span>
           <span className="bg-[#1a2540] text-gray-300 text-xs px-3 py-1 rounded font-mono">SQLite Local</span>
           <span className="bg-[#1a2540] text-gray-300 text-xs px-3 py-1 rounded font-mono">Prisma ORM</span>
           <span className="bg-[#1a2540] text-gray-300 text-xs px-3 py-1 rounded font-mono">TailwindCSS</span>
         </div>

         <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
           Built with <Heart className="w-4 h-4 text-[#FF4757] fill-[#FF4757]" /> for family capital protection
         </div>
      </div>

      <div className="space-y-6">
        
        {/* DB Stats */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg">
           <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-2 mb-6">
             <Database className="w-5 h-5 text-[#FFA502]" /> Database Statistics
           </h3>

           {!stats ? (
             <div className="h-40 animate-pulse bg-[#1a2540]/50 rounded" />
           ) : (
             <div className="grid grid-cols-2 gap-4">
               <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
                 <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Total Trades</div>
                 <div className="text-2xl font-bold text-white font-mono">{stats.tradesCount}</div>
               </div>
               <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
                 <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Journal Entries</div>
                 <div className="text-2xl font-bold text-white font-mono">{stats.journalCount}</div>
               </div>
               <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
                 <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Database Size</div>
                 <div className="text-2xl font-bold text-white font-mono">{stats.sizeMb} <span className="text-sm">MB</span></div>
               </div>
               <div className="bg-[#0A0E1A] border border-[#1a2540] rounded p-4">
                 <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Last Migration</div>
                 <div className="text-sm text-gray-400 font-mono truncate" title={stats.lastMigration}>{stats.lastMigration}</div>
               </div>
               <div className="col-span-2 bg-[#1a2540]/30 border border-[#1a2540] rounded px-4 py-3 flex justify-between items-center">
                 <span className="text-xs text-gray-500 font-bold uppercase">Location:</span>
                 <span className="text-xs text-white font-mono truncate">{stats.dbPath}</span>
               </div>
             </div>
           )}
        </div>

        {/* Quick Links */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg">
           <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-2 mb-4">
             <Code className="w-5 h-5 text-gray-400" /> Export Options
           </h3>
           <p className="text-xs text-gray-500 mb-6">Download your data to use globally outside the system bounds.</p>
           
           <div className="flex flex-col sm:flex-row gap-4">
             <button 
               onClick={() => handleExport('json')}
               className="flex-1 bg-[#1a2540] hover:bg-[#1a2540]/80 text-white py-3 rounded text-xs font-bold uppercase tracking-widest transition-colors flex justify-center items-center gap-2"
             >
               <Download className="w-4 h-4" /> Export All Data JSON
             </button>
             <button 
               onClick={() => handleExport('csv')}
               className="flex-1 bg-[#1a2540] hover:bg-[#1a2540]/80 text-white py-3 rounded text-xs font-bold uppercase tracking-widest transition-colors flex justify-center items-center gap-2"
             >
               <Download className="w-4 h-4" /> Export Trades CSV
             </button>
           </div>
        </div>

      </div>

    </div>
  );
}
