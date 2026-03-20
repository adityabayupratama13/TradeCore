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
  Zap,
  ChevronLeft,
  ChevronRight,
  Menu
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

interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
}

export function Sidebar({ isCollapsed, isMobileOpen, toggle }: SidebarProps) {
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
    <div 
      className={`fixed left-0 transition-all duration-300 ease-in-out bg-[#0E1628] border-r border-[#1a2540] flex flex-col z-[90] transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} w-[var(--current-sidebar-width,240px)] overflow-hidden`}
      style={{ top: '60px', height: 'calc(100vh - 60px)' }}
    >
      {/* Toggle Button */}
      <div className="flex border-b border-[#1a2540]">
        <button 
          onClick={toggle}
          className="w-full flex items-center justify-center p-3 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5 mx-auto" /> : <ChevronLeft className="w-5 h-5 mx-auto" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto no-scrollbar">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={`flex items-center gap-3 py-2.5 rounded-md transition-colors relative group ${
                isActive 
                  ? "bg-[#00D4AA]/10 text-[#00D4AA]" 
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              } ${isCollapsed ? 'justify-center px-0' : 'px-3'}`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="font-medium text-sm whitespace-nowrap">{item.name}</span>}
              
              {/* Tooltip on collapse hover */}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible whitespace-nowrap z-50 transition-all">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Live Clock */}
      <div className={`p-4 border-t border-[#1a2540] mt-auto transition-all ${isCollapsed ? 'px-2' : ''}`}>
        <div className={`bg-[#0A0E1A] rounded-lg border border-[#1a2540] ${isCollapsed ? 'p-2 text-center' : 'p-3 text-center'}`}>
          {currentTime ? (
            isCollapsed ? (
              <Clock className="w-5 h-5 text-[#00D4AA] mx-auto" />
            ) : (
              <>
                <div className="text-sm font-medium text-gray-300">
                  {format(currentTime, "MMM dd, yyyy")}
                </div>
                <div className="text-lg font-mono text-[#00D4AA] mt-1 space-x-1">
                  <span>{format(currentTime, "HH:mm:ss")}</span>
                  <span className="text-xs text-gray-500">WIB</span>
                </div>
              </>
            )
          ) : (
            <div className="h-[46px] animate-pulse bg-white/5 rounded" />
          )}
        </div>
      </div>
    </div>
  );
}
