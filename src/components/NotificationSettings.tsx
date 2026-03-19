"use client";

import { useState, useEffect } from "react";
import { Send, Save, Eye, EyeOff, BellRing } from "lucide-react";

export function NotificationSettings() {
  const [data, setData] = useState({
    botToken: '',
    chatId: '',
    summaryTime: '17:00',
    config: {
      circuitBreaker: true,
      riskWarning: true,
      tradeOpen: true,
      tradeClose: true,
      dailySummary: true,
      drawdownWarning: true
    }
  });
  
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    fetch('/api/settings/notifications')
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    await handleSave(); // save first so the test uses latest
    const res = await fetch('/api/settings/telegram/test', { method: 'POST' });
    if (res.ok) {
      alert("✅ Test message sent from TradeCore Bot!");
    } else {
      alert("❌ Failed to send test. Check your Token and Chat ID.");
    }
    setTesting(false);
  };

  const toggleConfig = (key: keyof typeof data.config) => {
    setData({
      ...data,
      config: { ...data.config, [key]: !data.config[key] }
    });
  };

  if (loading) return <div className="animate-pulse h-96 bg-[#0E1628] rounded-xl" />;

  const isConnected = data.botToken.length > 20 && data.chatId.length > 5;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* Col 1 */}
      <div className="space-y-6">
        
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Send className="w-5 h-5 text-[#3d7fff]" /> Telegram Bot Setup
            </h3>
            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${isConnected ? 'bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/30' : 'bg-[#FF4757]/10 text-[#FF4757] border-[#FF4757]/30'}`}>
              {isConnected ? 'Connected' : 'Not Configured'}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-gray-400 mb-2 block">Bot Token (from BotFather)</label>
              <div className="relative">
                <input 
                  type={showToken ? "text" : "password"}
                  value={data.botToken} onChange={e => setData({...data, botToken: e.target.value})}
                  className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded pl-4 pr-10 py-2.5 text-white font-mono text-sm focus:border-[#3d7fff] outline-none"
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                />
                <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-3 text-gray-500 hover:text-white">
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-gray-400 mb-2 block">Chat ID (User or Group ID)</label>
              <input 
                type="text"
                value={data.chatId} onChange={e => setData({...data, chatId: e.target.value})}
                className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded px-4 py-2.5 text-white font-mono text-sm focus:border-[#3d7fff] outline-none"
                placeholder="123456789"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1a2540] text-white py-2.5 rounded font-bold uppercase tracking-widest text-sm hover:bg-[#1a2540]/80">
                {saving ? 'Saving...' : 'Save Keys'}
              </button>
              <button onClick={handleTest} disabled={testing || !isConnected} className="flex-1 bg-[#3d7fff] text-white py-2.5 rounded font-bold uppercase tracking-widest text-sm hover:bg-[#3d7fff]/80 disabled:opacity-50">
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-2">
            <BellRing className="w-5 h-5 text-[#00D4AA]" /> Notification Triggers
          </h3>
          
          <div className="space-y-2">
            {[
              { key: 'circuitBreaker', label: 'Circuit Breaker LOCKED', icon: '🔒' },
              { key: 'riskWarning', label: 'Risk Warning (70% limits)', icon: '⚠️' },
              { key: 'tradeOpen', label: 'Trade Opened', icon: '✅' },
              { key: 'tradeClose', label: 'Trade Closed Result', icon: '🏁' },
              { key: 'drawdownWarning', label: 'Drawdown Warning', icon: '🔴' }
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3 bg-[#0A0E1A] border border-[#1a2540] rounded hover:border-[#1a2540]/80 transition-colors">
                <div className="flex items-center gap-3 text-sm text-gray-300 font-medium tracking-wide">
                  <span className="text-lg">{item.icon}</span> {item.label}
                </div>
                <button 
                  onClick={() => toggleConfig(item.key as keyof typeof data.config)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${data.config[item.key as keyof typeof data.config] ? 'bg-[#00D4AA]' : 'bg-[#1a2540]'}`}
                >
                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${data.config[item.key as keyof typeof data.config] ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={handleSave} disabled={saving} className="mt-6 w-full bg-[#3d7fff] text-white py-2.5 rounded font-bold uppercase tracking-widest text-sm hover:bg-[#3d7fff]/80">
            Save Triggers
          </button>
        </div>

      </div>

      {/* Col 2 */}
      <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg h-fit">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white uppercase tracking-widest">Daily Summary Schedule</h3>
          <button 
            onClick={() => toggleConfig('dailySummary')}
            className={`relative w-11 h-6 rounded-full transition-colors ${data.config.dailySummary ? 'bg-[#00D4AA]' : 'bg-[#1a2540]'}`}
          >
            <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${data.config.dailySummary ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className={`transition-opacity ${data.config.dailySummary ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <label className="text-sm font-bold text-gray-400 mb-2 block">Delivery Time (WIB)</label>
          <input 
            type="time"
            value={data.summaryTime} onChange={e => setData({...data, summaryTime: e.target.value})}
            className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded px-4 py-2.5 text-white font-mono text-lg focus:border-[#3d7fff] outline-none mb-6"
          />

          <label className="text-sm font-bold text-gray-400 mb-2 block">Format Preview</label>
          <div className="bg-[#1a2540]/30 border border-[#3d7fff]/30 rounded p-4 text-sm font-mono text-gray-300 whitespace-pre-line leading-relaxed">
            {`📊 TradeCore Daily — Mar 19
P&L: +IDR 340,000 (+1.2%)
Trades: 3 (2W / 1L)
Drawdown: 2.1%
Status: ✅ SAFE`}
          </div>

          <button onClick={handleSave} className="mt-6 w-full bg-[#1a2540] text-white py-2.5 rounded font-bold uppercase tracking-widest text-sm hover:bg-[#1a2540]/80">
            Update Schedule
          </button>
        </div>
      </div>

    </div>
  );
}
