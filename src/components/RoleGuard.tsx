"use client";

/**
 * Barreira de PAPEL no cliente.
 *
 * `ProtectedRoute` responde "está logado?" e nada mais. Sem isto, um cliente
 * com login válido abriria `/admin/tarefas` e veria a casca da tela com todas as
 * listas vazias e 403 no console — parece defeito, não parece bloqueio.
 *
 * Isto NÃO é segurança: é experiência. A autorização de verdade está em cada
 * rota de API (`requireInterno` / `requirePapel`). Se este componente fosse
 * removido, nenhum dado vazaria — a pessoa só veria telas vazias.
 */

import Link from "next/link";
import { ReactNode } from "react";
import { Loader2, Lock, ArrowLeft } from "lucide-react";
import { useSessao } from "@/hooks/useSessao";
import { PAPEIS_INTERNOS, papelLabel } from "@/lib/papeis";

type RoleGuardProps = {
  children: ReactNode;
  /** Papéis liberados. Por padrão, todos os papéis internos. */
  papeis?: string[];
  /** O que a pessoa tentou acessar, para a mensagem não ser genérica. */
  area?: string;
};

export default function RoleGuard({
  children,
  papeis = PAPEIS_INTERNOS,
  area = "esta área",
}: RoleGuardProps) {
  const { sessao, carregando, papel } = useSessao();

  if (carregando) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <span className="text-sm text-gray-500">Verificando permissão</span>
        </div>
      </div>
    );
  }

  const liberado = !!papel && papeis.includes(papel);

  if (!liberado) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <Lock className="h-7 w-7 text-gray-500" aria-hidden="true" />
          </div>

          <h1 className="text-lg font-bold text-gray-900">
            Acesso não liberado
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            {sessao ? (
              <>
                Seu perfil é{" "}
                <span className="font-semibold text-gray-900">
                  {papelLabel(papel)}
                </span>
                , e {area} está liberada para{" "}
                {papeis.map((p) => papelLabel(p)).join(", ")}.
              </>
            ) : (
              <>Não foi possível confirmar seu perfil de acesso.</>
            )}
          </p>

          <p className="mt-3 text-xs text-gray-500">
            Se você deveria ter acesso, peça a um administrador para ajustar seu
            perfil em Usuários.
          </p>

          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao painel
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
