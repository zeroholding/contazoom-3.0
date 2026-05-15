"use client";

import { useRef, useEffect, useLayoutEffect, useState, ReactNode } from "react";
import gsap from "gsap";
import AdminSidebar from "./AdminSidebar";

const FULL_W = "16rem";
const RAIL_W = "4rem";
const LS_KEY = "cz_sidebar_collapsed";

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function AdminLayoutWrapper({ children }: { children?: ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
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
    <div ref={containerRef} className="flex h-screen bg-gray-50 font-sans">
      <AdminSidebar collapsed={isSidebarCollapsed} />
      
      <div className="flex-1 flex flex-col h-screen overflow-hidden lg:ml-[var(--sidebar-w)] transition-all duration-200">
        
        {/* Admin Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={handleToggleSidebar}
              className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 hidden md:block"
            >
              <svg className={`w-5 h-5 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-gray-800">Centro de Controle</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">Sessão Administrador</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
