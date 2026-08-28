"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Users,
  ArrowLeft,
  FileText,
  FolderOpen,
  ClipboardList,
  Calculator,
  Landmark,
  Building2,
  History,
  type LucideIcon,
} from "lucide-react";

/**
 * Classe do item de navegação.
 *
 * Extraída porque a expressão é a mesma em oito links e errar uma letra numa
 * cópia deixa um item com aparência diferente sem ninguém notar.
 */
function classeItem(ativo: boolean, collapsed: boolean) {
  return `flex items-center gap-3 rounded-lg px-3 py-2.5 shadow-sm transition-colors ${ativo ? 'bg-orange-600 text-white' : 'text-gray-300 hover:bg-gray-800'} ${collapsed ? 'justify-center' : ''}`;
}

type ItemNav = {
  href: string;
  texto: string;
  icone: LucideIcon;
  /**
   * `true` acende só na rota exata. Necessário em `/admin/tarefas`: por prefixo,
   * ele ficaria aceso junto com "Apuração fiscal" em toda subrota.
   */
  exato?: boolean;
};

const OPERACAO: ItemNav[] = [
  { href: "/admin/tarefas", texto: "Tarefas", icone: ClipboardList, exato: true },
  { href: "/admin/tarefas/apuracao", texto: "Apuração fiscal", icone: Calculator },
  { href: "/admin/tarefas/legalizacao", texto: "Legalização", icone: Landmark },
  { href: "/admin/empresas", texto: "Empresas", icone: Building2 },
  { href: "/admin/tarefas/auditoria", texto: "Auditoria", icone: History },
];

export default function AdminSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  // Subrota mantém o item pai aceso: `/admin/tarefas/apuracao/<id>` continua
  // marcando "Apuração fiscal", senão a pessoa perde a referência ao abrir um
  // registro.
  const estaAtivo = (href: string, exato = false) =>
    exato ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

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

      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-2">
        <div className={`px-2 mb-2 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Operação</span>}
        </div>

        {OPERACAO.map((item) => {
          const Icone = item.icone;
          const ativo = estaAtivo(item.href, item.exato);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.texto : undefined}
              aria-current={ativo ? 'page' : undefined}
              className={classeItem(ativo, collapsed)}
            >
              <Icone className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="font-medium">{item.texto}</span>}
            </Link>
          );
        })}

        <div className={`px-2 mb-2 pt-6 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gestão Global</span>}
        </div>
        
        <Link 
          href="/admin" 
          className={classeItem(pathname === '/admin', collapsed)}
        >
          <Users className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="font-medium">Painel de Usuários</span>}
        </Link>

        <Link 
          href="/admin/documentos" 
          className={classeItem(pathname === '/admin/documentos', collapsed)}
        >
          <FolderOpen className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="font-medium">Enviar Documentos</span>}
        </Link>
        <Link 
          href="/admin/auditoria-documentos" 
          className={classeItem(pathname === '/admin/auditoria-documentos', collapsed)}
        >
          <FileText className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="font-medium">Auditoria Docs</span>}
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
