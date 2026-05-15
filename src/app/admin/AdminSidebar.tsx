import Link from "next/link";
import Image from "next/image";
import { Shield, Users, LogOut, ArrowLeft } from "lucide-react";

export default function AdminSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside className={`fixed inset-y-0 left-0 z-50 transform bg-indigo-950 text-white transition-all duration-200 ease-in-out ${collapsed ? 'w-[4rem]' : 'w-64'} hidden md:flex flex-col`}>
      <div className="flex h-16 items-center justify-center border-b border-indigo-900/50">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-indigo-400" />
            <span className="font-bold text-xl tracking-wide">ContaZoom<span className="text-indigo-400">Admin</span></span>
          </div>
        ) : (
          <Shield className="w-8 h-8 text-indigo-400" />
        )}
      </div>

      <nav className="flex-1 px-3 py-6 space-y-2">
        <div className={`px-2 mb-2 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && <span className="text-xs font-semibold text-indigo-400/70 uppercase tracking-wider">Gestão</span>}
        </div>
        <Link href="/admin" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 bg-indigo-600 text-white shadow-md ${collapsed ? 'justify-center' : ''}`}>
          <Users className="w-5 h-5" />
          {!collapsed && <span className="font-medium">Usuários do Sistema</span>}
        </Link>
      </nav>

      <div className="p-4 border-t border-indigo-900/50">
        <Link href="/dashboard" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-indigo-200 hover:bg-indigo-900/50 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}>
          <ArrowLeft className="w-5 h-5" />
          {!collapsed && <span className="font-medium">Voltar ao App</span>}
        </Link>
      </div>
    </aside>
  );
}
