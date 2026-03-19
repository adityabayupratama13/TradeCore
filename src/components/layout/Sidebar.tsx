"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { 
  Hexagon, 
  Home, 
  LineChart, 
  Layers, 
  Clock, 
  Book, 
  Shield, 
  BarChart2, 
  Settings,
  Zap
} from "lucide-react";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Live Prices", href: "/prices", icon: LineChart },
  { name: "Open Positions", href: "/positions", icon: Layers },
  { name: "Trade History", href: "/history", icon: Clock },
  { name: "Journal", href: "/journal", icon: Book },
  { name: "Risk Manager", href: "/risk", icon: Shield },
  { name: "Performance", href: "/performance", icon: BarChart2 },
  { name: "AI Engine", href: "/engine", icon: Zap },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed left-0 top-0 h-screen w-[240px] bg-[#0E1628] border-r border-[#1a2540] flex flex-col z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-[#1a2540]">
        <Hexagon className="w-6 h-6 text-[#00D4AA] fill-[#00D4AA]/20" />
        <span className="font-bold text-white tracking-wider">TRADE CORE</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                isActive 
                  ? "bg-[#00D4AA]/10 text-[#00D4AA]" 
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Live Clock */}
      <div className="p-4 border-t border-[#1a2540] mt-auto">
        <div className="bg-[#0A0E1A] rounded-lg p-3 text-center border border-[#1a2540]">
          {currentTime ? (
            <>
              <div className="text-sm font-medium text-gray-300">
                {format(currentTime, "MMM dd, yyyy")}
              </div>
              <div className="text-lg font-mono text-[#00D4AA] mt-1 space-x-1">
                <span>{format(currentTime, "HH:mm:ss")}</span>
                <span className="text-xs text-gray-500">WIB</span>
              </div>
            </>
          ) : (
            <div className="h-[46px] animate-pulse bg-white/5 rounded" />
          )}
        </div>
      </div>
    </div>
  );
}
