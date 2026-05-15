"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Users, LogOut, ArrowLeft, FileText, UploadCloud } from "lucide-react";

export default function AdminSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 transform bg-gray-900 text-white transition-all duration-200 ease-in-out ${collapsed ? 'w-[4rem]' : 'w-64'} hidden md:flex flex-col`}>
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-orange-500" />
            <span className="font-bold text-xl tracking-wide">ContaZoom<span className="text-orange-500">Admin</span></span>
          </div>
        ) : (
          <Shield className="w-8 h-8 text-orange-500" />
        )}
      </div>

      <nav className="flex-1 px-3 py-6 space-y-2">
        <div className={`px-2 mb-2 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gestão Global</span>}
        </div>
        
        <Link 
          href="/admin" 
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 shadow-sm transition-colors ${pathname === '/admin' ? 'bg-orange-600 text-white' : 'text-gray-300 hover:bg-gray-800'} ${collapsed ? 'justify-center' : ''}`}
        >
          <Users className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="font-medium">Painel de Usuários</span>}
        </Link>

        <Link 
          href="/admin/documentos" 
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 shadow-sm transition-colors ${pathname === '/admin/documentos' ? 'bg-orange-600 text-white' : 'text-gray-300 hover:bg-gray-800'} ${collapsed ? 'justify-center' : ''}`}
        >
          <UploadCloud className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="font-medium">Enviar Documentos</span>}
        </Link>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <Link href="/dashboard" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}>
          <ArrowLeft className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="font-medium">Sair do Admin</span>}
        </Link>
      </div>
    </aside>
  );
}
