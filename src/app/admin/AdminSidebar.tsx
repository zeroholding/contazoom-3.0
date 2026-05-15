import Link from "next/link";
import Image from "next/image";
import { Shield, Users, LogOut, ArrowLeft } from "lucide-react";

export default function AdminSidebar({ collapsed }: { collapsed: boolean }) {
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
          {!collapsed && <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gestão</span>}
        </div>
        <Link href="/admin" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 bg-orange-600 text-white shadow-md ${collapsed ? 'justify-center' : ''}`}>
          <Users className="w-5 h-5" />
          {!collapsed && <span className="font-medium">Usuários do Sistema</span>}
        </Link>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <Link href="/dashboard" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}>
          <ArrowLeft className="w-5 h-5" />
          {!collapsed && <span className="font-medium">Voltar ao App</span>}
        </Link>
      </div>
    </aside>
  );
}
