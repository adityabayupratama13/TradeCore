"use client";

import { ShieldAlert } from "lucide-react";
import { RiskMeters } from "@/components/RiskMeters";
import { RiskRulesForm } from "@/components/RiskRulesForm";
import { PositionExposureTable } from "@/components/PositionExposureTable";
import { RiskHistoryLog } from "@/components/RiskHistoryLog";

export default function RiskPage() {
  return (
    <div className="space-y-6 w-full max-w-[1600px] mx-auto pb-10">
      
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="w-6 h-6 text-[#FF4757]" />
        <h2 className="text-2xl font-semibold text-white">Risk Manager</h2>
      </div>

      {/* ROW 1: LIVE RISK METERS */}
      <RiskMeters />

      {/* ROW 2: TRADING MODE SELECTOR & RISK MANAGEMENT */}
      <div className="flex flex-col gap-6">
        <RiskRulesForm />
        
        <div className="w-full">
          <PositionExposureTable />
        </div>
      </div>

      {/* ROW 3: RISK HISTORY LOG (Full Width) */}
      <RiskHistoryLog />

    </div>
  );
}
