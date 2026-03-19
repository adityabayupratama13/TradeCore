"use client";

import { useState } from "react";
import { Settings, Shield, Bell, HardDrive, Info, CheckCircle2 } from "lucide-react";
import { PortfolioConfig } from "@/components/PortfolioConfig";
import { NotificationSettings } from "@/components/NotificationSettings";
import { BackupManager } from "@/components/BackupManager";
import { AboutBox } from "@/components/AboutBox";
import { SystemCheck } from "@/components/SystemCheck";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'PORTFOLIO' | 'NOTIFICATIONS' | 'BACKUP' | 'SYSTEM_CHECK' | 'ABOUT'>('PORTFOLIO');

  const tabs = [
    { id: 'PORTFOLIO', label: 'Portfolio', icon: <Shield className="w-4 h-4" /> },
    { id: 'NOTIFICATIONS', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'BACKUP', label: 'Backup', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'SYSTEM_CHECK', label: 'System Check', icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'ABOUT', label: 'About', icon: <Info className="w-4 h-4" /> }
  ] as const;

  return (
    <div className="space-y-6 w-full max-w-[1600px] mx-auto pb-10">
      
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-6 h-6 text-[#3d7fff]" />
        <h2 className="text-2xl font-semibold text-white">System Settings</h2>
      </div>

      <div className="flex bg-[#0A0E1A] overflow-x-auto hide-scrollbar border-b border-[#1a2540]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-4 uppercase tracking-widest text-xs font-bold transition-all whitespace-nowrap border-b-2 ${
              activeTab === tab.id 
                ? 'text-[#3d7fff] border-[#3d7fff] bg-[#3d7fff]/5' 
                : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-[#1a2540]/30'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'PORTFOLIO' && <PortfolioConfig />}
        {activeTab === 'NOTIFICATIONS' && <NotificationSettings />}
        {activeTab === 'BACKUP' && <BackupManager />}
        {activeTab === 'SYSTEM_CHECK' && <SystemCheck />}
        {activeTab === 'ABOUT' && <AboutBox />}
      </div>

    </div>
  );
}
