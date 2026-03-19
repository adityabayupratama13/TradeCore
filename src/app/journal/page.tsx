"use client";

import { useState, useEffect } from "react";
import { Book, Plus, Filter } from "lucide-react";
import { useJournalFilters } from "@/hooks/useJournalFilters";
import { JournalCard } from "@/components/JournalCard";
import { EmotionAnalytics } from "@/components/EmotionAnalytics";
import { JournalDetailModal } from "@/components/JournalDetailModal";
import { ManualJournalModal } from "@/components/ManualJournalModal";

const EMOTIONS = [
  { id: 'CALM', label: '😌 Calm' },
  { id: 'FOMO', label: '😰 FOMO' },
  { id: 'FEARFUL', label: '😨 Fearful' },
  { id: 'REVENGE', label: '😤 Revenge' },
  { id: 'CONFIDENT', label: '😎 Confident' }
];

export default function JournalPage() {
  const { filters, setFilters, setDateRange, toggleEmotion, entries, loading, refresh } = useJournalFilters();
  const [analytics, setAnalytics] = useState<any>(null);
  
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [entries]); // Refresh analytics when entries change (e.g., after add/delete)

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/journal/analytics');
      if (res.ok) setAnalytics(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this journal entry?")) return;
    try {
      const res = await fetch(`/api/journal/${id}`, { method: 'DELETE' });
      if (res.ok) {
        refresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Book className="w-6 h-6 text-[#00D4AA]" />
          Trade Journal & Emotion Tracker
        </h2>
        <button 
          onClick={() => setIsManualModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#00D4AA]/10 text-[#00D4AA] rounded border border-[#00D4AA]/30 hover:bg-[#00D4AA]/20 transition-colors font-bold text-sm tracking-wider"
        >
          <Plus className="w-4 h-4" /> ADD MANUAL ENTRY
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: TIMELINE (65%) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* FILTER BAR */}
          <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-4 sticky top-4 z-10 shadow-xl space-y-4">
            
            <div className="flex items-center gap-2 text-sm">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400 font-bold uppercase tracking-wider text-xs">Filters</span>
            </div>

            <div className="flex flex-wrap gap-4">
              
              {/* Date Range */}
              <select 
                onChange={(e) => setDateRange(e.target.value as any)}
                className="bg-[#0A0E1A] border border-[#1a2540] text-gray-300 text-xs px-3 py-1.5 rounded outline-none focus:border-[#00D4AA]"
              >
                <option value="All Time">All Time</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
                <option value="Last 3 Months">Last 3 Months</option>
              </select>

              {/* Result Toggle */}
              <div className="flex bg-[#0A0E1A] border border-[#1a2540] rounded overflow-hidden">
                {['All', 'WIN', 'LOSS'].map(r => (
                  <button 
                    key={r} onClick={() => setFilters(p => ({...p, result: r as any}))}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${filters.result === r ? 'bg-[#1a2540] text-white' : 'text-gray-500 hover:bg-[#1a2540]/50'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Rule Followed Toggle */}
              <div className="flex bg-[#0A0E1A] border border-[#1a2540] rounded overflow-hidden">
                {[
                  { id: 'All', label: 'All Rules' },
                  { id: 'true', label: 'Followed' },
                  { id: 'false', label: 'Broken' }
                ].map(r => (
                  <button 
                    key={r.id} onClick={() => setFilters(p => ({...p, ruleFollowed: r.id as any}))}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${filters.ruleFollowed === r.id ? 'bg-[#1a2540] text-white' : 'text-gray-500 hover:bg-[#1a2540]/50'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Market Type Toggle */}
              <div className="flex bg-[#0A0E1A] border border-[#1a2540] rounded overflow-hidden">
                {[
                  { id: 'All', label: 'All Markets' },
                  { id: 'CRYPTO_FUTURES', label: 'Crypto' },
                  { id: 'SAHAM_IDX', label: 'IDX' }
                ].map(r => (
                  <button 
                    key={r.id} onClick={() => setFilters(p => ({...p, marketType: r.id as any}))}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${filters.marketType === r.id ? 'bg-[#1a2540] text-white' : 'text-gray-500 hover:bg-[#1a2540]/50'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

            </div>

             {/* Emotion Multi-Select pills */}
             <div className="flex items-center gap-2 pt-3 border-t border-[#1a2540] flex-wrap">
               <span className="text-xs text-gray-500 font-bold mr-2">Emotions:</span>
               <button 
                  onClick={() => toggleEmotion('All')}
                  className={`px-2 py-1 rounded text-xs transition-colors ${filters.emotion.includes('All') ? 'bg-white/20 text-white' : 'bg-[#0A0E1A] text-gray-500 border border-[#1a2540]'}`}
                >
                  All
                </button>
               {EMOTIONS.map(e => (
                <button 
                  key={e.id} onClick={() => toggleEmotion(e.id)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${filters.emotion.includes(e.id) ? 'bg-[#3d7fff]/20 text-[#3d7fff] border border-[#3d7fff]/30' : 'bg-[#0A0E1A] text-gray-500 border border-[#1a2540]'}`}
                >
                  {e.label}
                </button>
               ))}
             </div>

             <div className="text-xs text-gray-500 pt-1">
               Showing {entries.length} journal {entries.length === 1 ? 'entry' : 'entries'}
             </div>

          </div>

          {/* TIMELINE LIST */}
          <div className="space-y-4">
            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-40 bg-white/5 rounded-xl w-full" />
                <div className="h-40 bg-white/5 rounded-xl w-full" />
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-[#0E1628] border border-[#1a2540] border-dashed rounded-xl p-12 text-center flex flex-col items-center">
                <Book className="w-12 h-12 text-gray-600 mb-4" />
                <h3 className="text-lg font-bold text-white tracking-wider">NO ENTRIES FOUND</h3>
                <p className="text-gray-400 mt-2">Start trading and reflect on each trade to build your journal.</p>
                <button 
                  onClick={() => setIsManualModalOpen(true)}
                  className="mt-6 px-6 py-2 bg-[#1a2540] text-white hover:bg-white/20 rounded font-bold transition-colors"
                >
                  Add Manual Entry
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 relative">
                {/* Visual timeline line */}
                <div className="absolute top-8 bottom-8 left-8 w-0.5 bg-[#1a2540] -z-10" />
                
                {entries.map(entry => (
                  <JournalCard 
                    key={entry.id} 
                    entry={entry} 
                    onClick={() => setSelectedEntry(entry)}
                    onEdit={(e) => { e.stopPropagation(); setSelectedEntry(entry); /* Reusing detail modal for edit info */ }}
                    onDelete={(e) => handleDelete(e, entry.id)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: ANALYTICS SIDEBAR (35%) */}
        <div className="lg:col-span-4 relative">
          <EmotionAnalytics analytics={analytics} />
        </div>
        
      </div>

      {/* MODALS */}
      {selectedEntry && (
        <JournalDetailModal 
          entry={selectedEntry} 
          onClose={() => setSelectedEntry(null)} 
        />
      )}

      {isManualModalOpen && (
        <ManualJournalModal 
          onClose={() => setIsManualModalOpen(false)} 
          onSuccess={() => {
            setIsManualModalOpen(false);
            refresh();
          }} 
        />
      )}

    </div>
  );
}
