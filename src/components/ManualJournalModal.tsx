import { useState } from "react";
import { X } from "lucide-react";

interface ManualJournalModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ManualJournalModal({ onClose, onSuccess }: ManualJournalModalProps) {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [direction, setDirection] = useState<'LONG' | 'SHORT' | 'BUY' | 'SELL'>('LONG');
  const [pnl, setPnl] = useState<string>("");
  const [emotion, setEmotion] = useState('CALM');
  const [rules, setRules] = useState(true);
  const [notes, setNotes] = useState("");
  const [lessons, setLessons] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const EMOTIONS = [
    { id: 'CALM', label: '😌 Calm' },
    { id: 'CONFIDENT', label: '😎 Confident' },
    { id: 'FOMO', label: '😰 FOMO' },
    { id: 'FEARFUL', label: '😨 Fearful' },
    { id: 'REVENGE', label: '😤 Revenge' }
  ];

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/journal/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date(date).toISOString(),
          symbol,
          direction,
          pnl: parseFloat(pnl) || 0,
          emotionState: emotion,
          ruleFollowed: rules,
          notes,
          lessonsLearned: lessons
        })
      });
      if (!res.ok) throw new Error("Failed to save manual journal");
      onSuccess();
    } catch (e) {
      console.error(e);
      alert("Error saving journal entry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A0E1A]/90 p-4 overflow-y-auto backdrop-blur-sm">
      <div className="bg-[#0E1628] border border-[#1a2540] w-full max-w-2xl rounded-xl p-6 shadow-2xl relative my-8">
        
        <div className="flex justify-between items-center mb-6 border-b border-[#1a2540] pb-4">
          <h3 className="text-xl font-bold text-white tracking-wider">Add Manual Entry</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="space-y-6">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Date & Time</label>
              <input 
                type="datetime-local" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Symbol (e.g. BTC/USDT)</label>
              <input 
                type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Direction</label>
              <select 
                value={direction} onChange={(e: any) => setDirection(e.target.value)}
                className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA]"
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">P&L Amount</label>
              <input 
                type="number" value={pnl} onChange={(e) => setPnl(e.target.value)}
                placeholder="e.g. -50 or 150"
                className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-2.5 rounded outline-none focus:border-[#00D4AA] font-mono"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Emotion State</label>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map(e => (
                <button
                  key={e.id} onClick={() => setEmotion(e.id)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${emotion === e.id ? 'bg-[#00D4AA]/10 text-[#00D4AA] border border-[#00D4AA]/50' : 'bg-[#0A0E1A] text-gray-400 border border-[#1a2540] hover:text-white'}`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex justify-between items-center w-full max-w-[200px]">
              <span>Rules Followed?</span>
              <button 
                onClick={() => setRules(!rules)}
                className={`w-12 h-6 rounded-full transition-colors relative ${rules ? 'bg-[#00D4AA]' : 'bg-[#FF4757]'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${rules ? 'left-7' : 'left-1'}`} />
              </button>
            </label>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Why did you enter?</label>
            <textarea 
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0A0E1A] border border-[#1a2540] text-white p-3 rounded outline-none focus:border-[#00D4AA] h-20 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-[#3d7fff] uppercase tracking-wider mb-2 block font-bold">Lessons Learned</label>
            <textarea 
              value={lessons} onChange={(e) => setLessons(e.target.value)}
              placeholder="What could you do better?"
              className="w-full bg-[#3d7fff]/5 border border-[#3d7fff]/30 text-white p-3 rounded outline-none focus:border-[#3d7fff] h-20 resize-none"
            />
          </div>

        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded text-gray-400 font-bold hover:text-white">CANCEL</button>
          <button 
            disabled={submitting || !symbol || !pnl} onClick={handleSave}
            className="px-6 py-2 rounded font-bold bg-[#00D4AA] text-[#0A0E1A] hover:bg-[#00D4AA]/80 disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(0,212,170,0.2)]"
          >
            {submitting ? 'SAVING...' : 'SAVE ENTRY'}
          </button>
        </div>

      </div>
    </div>
  );
}
