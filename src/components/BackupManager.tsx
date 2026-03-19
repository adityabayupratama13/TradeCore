"use client";

import { useState, useEffect, useRef } from "react";
import { Download, UploadCloud, Trash2, ShieldAlert, RefreshCw, FileQuestion } from "lucide-react";
import { format } from "date-fns";

export function BackupManager() {
  const [backups, setBackups] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({ enabled: false, frequency: 'Daily', time: '23:00', maxBackups: 30 });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBackups = async () => {
    const [bRes, cRes] = await Promise.all([
      fetch('/api/backup/list'),
      fetch('/api/settings/backup-config')
    ]);
    if (bRes.ok) setBackups(await bRes.json());
    if (cRes.ok) setConfig(await cRes.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' });
      if (res.ok) {
        // Trigger download
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disp = res.headers.get('Content-Disposition');
        const filename = disp ? disp.split('filename="')[1].replace('"', '') : `manual-backup-${Date.now()}.db`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        // Refresh list
        await fetchBackups();
        alert("Backup generated and downloaded successfully.");
      } else {
        alert("Failed to create backup.");
      }
    } catch(e) {
      console.error(e);
      alert("Error generating backup.");
    } finally {
      setBackingUp(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    await fetch('/api/settings/backup-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    setSavingConfig(false);
    alert('Auto-backup setup saved.');
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
    const res = await fetch(`/api/backup/${filename}`, { method: 'DELETE' });
    if (res.ok) await fetchBackups();
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("⚠️ RESTORING WILL OVERWRITE ALL CURRENT DATA. This cannot be undone. Make a backup first. Are you absolutely sure?")) return;
    
    // Double confirmation
    const confirmText = prompt('Type "RESTORE" to confirm complete database overwrite.');
    if (confirmText !== 'RESTORE') {
      alert("Restore cancelled.");
      if(fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        alert("Database successfully restored! The page will now reload.");
        window.location.reload();
      } else {
        const err = await res.json();
        alert(`Restore failed: ${err.error || 'Unknown error'}`);
      }
    } catch(err) {
      console.error(err);
      alert("Critical error during restore.");
    } finally {
      setRestoring(false);
      if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) return <div className="animate-pulse h-96 bg-[#0E1628] rounded-xl" />;

  const lastBackup = backups.length > 0 ? backups[0] : null;

  return (
    <div className="space-y-6">
      
      {/* Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Manual Backup */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-2 mb-6">
            <Download className="w-5 h-5 text-[#00D4AA]" /> Manual Backup
          </h3>

          <button 
            onClick={handleBackupNow} disabled={backingUp}
            className="w-full bg-[#00D4AA] text-[#0A0E1A] py-3 rounded font-bold uppercase tracking-widest hover:bg-[#00D4AA]/80 flex items-center justify-center gap-2 transition-colors mb-6"
          >
            {backingUp ? <RefreshCw className="w-5 h-5 animate-spin"/> : <Download className="w-5 h-5" />}
            {backingUp ? 'Generating...' : 'Backup Now'}
          </button>

          {lastBackup ? (
            <div className="bg-[#1a2540]/30 border border-[#1a2540] rounded p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Last backup:</span>
                <span className="text-white font-mono">{format(new Date(lastBackup.createdAt), "MMM dd, yyyy HH:mm 'WIB'")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Backup size:</span>
                <span className="text-white font-mono">{lastBackup.sizeMb} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Location:</span>
                <span className="text-gray-500 font-mono text-xs">./backups/{lastBackup.filename}</span>
              </div>
            </div>
          ) : (
             <div className="bg-[#1a2540]/30 border border-[#1a2540] rounded p-4 text-center text-sm text-gray-500 italic">
               No backups found in ./backups/ directory.
             </div>
          )}
        </div>

        {/* Restore */}
        <div className="bg-[#0E1628] border border-[#FF4757]/30 rounded-xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <UploadCloud className="w-40 h-40 text-[#FF4757]" />
          </div>
          
          <h3 className="text-lg font-bold text-[#FF4757] uppercase tracking-widest flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5" /> Restore from Backup
          </h3>
          
          <div className="bg-[#FF4757]/10 border border-[#FF4757]/30 rounded p-4 mb-6">
            <p className="text-sm text-[#FF4757] font-bold leading-relaxed">
              ⚠️ RESTORING WILL OVERWRITE ALL CURRENT DATA.<br/>
              This cannot be undone. Make a manual backup first.
            </p>
          </div>

          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".db" className="hidden" />

          <button 
            onClick={handleRestoreClick} disabled={restoring}
            className="w-full bg-transparent border-2 border-[#FF4757] text-[#FF4757] py-3 rounded font-bold uppercase tracking-widest hover:bg-[#FF4757] hover:text-[#0A0E1A] flex items-center justify-center gap-2 transition-colors relative z-10"
          >
            {restoring ? <RefreshCw className="w-5 h-5 animate-spin"/> : <UploadCloud className="w-5 h-5" />}
            {restoring ? 'Overwriting DB...' : 'Restore Database'}
          </button>
        </div>

      </div>

      {/* Row 2: Auto Backup Config & History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Auto Config */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-6 shadow-lg col-span-1">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white uppercase tracking-widest">Auto Backup Setup</h3>
            <button 
              onClick={() => setConfig({...config, enabled: !config.enabled})}
              className={`relative w-11 h-6 rounded-full transition-colors ${config.enabled ? 'bg-[#00D4AA]' : 'bg-[#1a2540]'}`}
            >
              <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className={`space-y-4 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
             <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block">Frequency</label>
                <select 
                  value={config.frequency} onChange={e => setConfig({...config, frequency: e.target.value})}
                  className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded px-4 py-2.5 text-white font-medium focus:border-[#3d7fff] outline-none"
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly (Sundays)</option>
                </select>
             </div>

             <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block">Time (WIB)</label>
                <input 
                  type="time" value={config.time} onChange={e => setConfig({...config, time: e.target.value})}
                  className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded px-4 py-2.5 text-white font-mono focus:border-[#3d7fff] outline-none"
                />
             </div>

             <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block">Max Backups to Keep</label>
                <input 
                  type="number" min="1" max="100" value={config.maxBackups} onChange={e => setConfig({...config, maxBackups: parseInt(e.target.value)})}
                  className="w-full bg-[#0A0E1A] border border-[#1a2540] rounded px-4 py-2.5 text-white font-mono focus:border-[#3d7fff] outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Older backups auto-deleted to save space.</p>
             </div>

             <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block">Backup Location</label>
                <input 
                  disabled value="./backups/"
                  className="w-full bg-[#0A0E1A]/50 border border-[#1a2540]/50 rounded px-4 py-2.5 text-gray-500 font-mono italic cursor-not-allowed"
                />
             </div>

             <button onClick={handleSaveConfig} disabled={savingConfig} className="w-full bg-[#3d7fff] text-white py-2.5 rounded font-bold uppercase tracking-widest text-sm hover:bg-[#3d7fff]/80 mt-2">
               Save Config
             </button>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-[#0E1628] border border-[#1a2540] rounded-xl p-0 shadow-lg col-span-2 overflow-hidden flex flex-col h-full">
           <div className="p-6 border-b border-[#1a2540] flex justify-between items-center bg-[#0A0E1A]/50 shrink-0">
             <h3 className="text-lg font-bold text-white uppercase tracking-widest">Backup History</h3>
             <span className="text-sm text-gray-500 font-bold bg-[#1a2540] px-3 py-1 rounded">{backups.length} Files</span>
           </div>

           <div className="flex-1 overflow-x-auto hide-scrollbar overflow-y-auto max-h-[400px]">
             {backups.length === 0 ? (
                <div className="flex flex-col flex-1 items-center justify-center p-20 text-gray-500 h-full">
                  <FileQuestion className="w-10 h-10 mb-4 opacity-50" />
                  <p className="font-bold tracking-widest uppercase">No Backups Found</p>
                </div>
             ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#1a2540] text-gray-400 font-bold uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="p-4">Filename</th>
                      <th className="p-4">Date & Time</th>
                      <th className="p-4">Size</th>
                      <th className="p-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a2540]">
                    {backups.map(b => (
                      <tr key={b.filename} className="hover:bg-[#1a2540]/30 transition-colors">
                        <td className="p-4 text-gray-300 font-mono text-xs">{b.filename}</td>
                        <td className="p-4 text-white font-mono text-xs">{format(new Date(b.createdAt), "yyyy-MM-dd HH:mm")}</td>
                        <td className="p-4 text-gray-400 font-mono text-xs">{b.sizeMb} MB</td>
                        <td className="p-4 text-center">
                          <button onClick={() => handleDelete(b.filename)} className="p-2 text-gray-500 hover:text-[#FF4757] transition-colors rounded hover:bg-[#FF4757]/10">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             )}
           </div>
        </div>

      </div>

    </div>
  );
}
