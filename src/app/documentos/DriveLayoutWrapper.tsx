"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import gsap from "gsap";
import Sidebar from "@/app/components/views/ui/Sidebar";
import Topbar from "@/app/components/views/ui/Topbar";
import DriveDocumentos from "@/app/components/views/ui/DriveDocumentos";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function DriveLayoutWrapper() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasInitialSet = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "1") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useIsoLayout(() => {
    if (hasInitialSet.current) return;
    const el = containerRef.current;
    if (!el) return;
    hasInitialSet.current = true;
    gsap.set(el, { css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W } });
  }, [isSidebarCollapsed]);

  useIsoLayout(() => {
    const el = containerRef.current;
    if (!el) return;
    gsap.to(el, {
      duration: 0.2,
      ease: "power2.out",
      css: { "--sidebar-w": isSidebarCollapsed ? RAIL_W : FULL_W },
    });
  }, [isSidebarCollapsed]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div ref={containerRef} className="flex h-screen bg-[#F3F3F3] font-sans">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={handleToggleSidebar} 
        isMobileOpen={isSidebarMobileOpen} 
        onMobileClose={() => setIsSidebarMobileOpen(false)} 
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden lg:ml-[var(--sidebar-w)] transition-all duration-200">
        <Topbar onMobileOpen={() => setIsSidebarMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          <DriveDocumentos />
        </main>
      </div>
    </div>
  );
}
