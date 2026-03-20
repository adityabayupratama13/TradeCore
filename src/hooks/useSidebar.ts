"use client";

import { useState, useEffect } from 'react';

export function useSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Persist collapsed state
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);
  
  const toggle = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('sidebar_collapsed', JSON.stringify(next));
  };
  
  return { isCollapsed, isMobileOpen, toggle, setIsMobileOpen };
}
