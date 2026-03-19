"use client";

import { Plus } from "lucide-react";
import { TradeEntryModal } from "./TradeEntryModal";
import { useState } from "react";

export function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#00D4AA] text-[#0A0E1A] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,212,170,0.4)] hover:shadow-[0_0_30px_rgba(0,212,170,0.6)] hover:scale-105 transition-all duration-300 z-40 group"
      >
        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {isOpen && (
        <TradeEntryModal onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
