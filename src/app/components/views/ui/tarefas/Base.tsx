"use client";

/**
 * Peças de layout do módulo: KPI, cabeçalho, vazio, carregando, aviso, paginação.
 *
 * Ficam juntas porque são casca — mudam sempre em conjunto e nenhuma tem lógica
 * própria. Espalhar em oito arquivos de vinte linhas só criaria oito imports.
 */

import Link from "next/link";
import { ReactNode } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  X,
} from "lucide-react";
import Icone from "./Icone";

/* ---------------------------------- KPI ----------------------------------- */

type CartaoKpiProps = {
  titulo: string;
  valor: number | string;
  icone: string;
  /** Cor do bloco do ícone. Laranja é o padrão da marca. */
  tom?: "laranja" | "cinza" | "verde" | "vermelho" | "ambar" | "azul";
  detalhe?: string;
  href?: string;
};

const TOM_ICONE: Record<string, string> = {
  laranja: "bg-orange-100 text-orange-600",
  cinza: "bg-gray-100 text-gray-700",
  verde: "bg-[#ECFDF3] text-[#027A48]",
  vermelho: "bg-[#FEF2F2] text-[#B42318]",
  ambar: "bg-[#FFFAEB] text-[#B54708]",
  azul: "bg-[#EFF8FF] text-[#175CD3]",
};

export function CartaoKpi({
  titulo,
  valor,
  icone,
  tom = "laranja",
  detalhe,
  href,
}: CartaoKpiProps) {
  const conteudo = (
    <>
      <div className={`mr-4 rounded-lg p-3 ${TOM_ICONE[tom]}`}>
        <Icone nome={icone} className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">{titulo}</p>
        <p className="text-2xl font-bold text-gray-900">{valor}</p>
        {detalhe && (
          <p className="mt-0.5 truncate text-xs text-gray-500">{detalhe}</p>
        )}
      </div>
    </>
  );

  const classe =
    "flex items-center rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

  if (href) {
    return (
      <Link
        href={href}
        className={`${classe} transition-colors hover:border-orange-300 hover:bg-orange-50/40`}
      >
        {conteudo}
      </Link>
    );
  }

  return <div className={classe}>{conteudo}</div>;
}

/* ------------------------------- Cabeçalho -------------------------------- */

export function Cabecalho({
  titulo,
  descricao,
  icone,
  acoes,
  voltarPara,
  voltarTexto = "Voltar",
}: {
  titulo: string;
  descricao?: string;
  icone?: string;
  acoes?: ReactNode;
  voltarPara?: string;
  voltarTexto?: string;
}) {
  return (
    <div className="space-y-3">
      {voltarPara && (
        <Link
          href={voltarPara}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-orange-600"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {voltarTexto}
        </Link>
      )}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="min-w-0">
          <h1 className="flex items-center text-2xl font-bold text-gray-900">
            {icone && (
              <Icone nome={icone} className="mr-2 h-6 w-6 text-orange-500" />
            )}
            <span className="truncate">{titulo}</span>
          </h1>
          {descricao && (
            <p className="mt-1 text-sm text-gray-500">{descricao}</p>
          )}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- Estados -------------------------------- */

export function Carregando({ texto = "Carregando" }: { texto?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      <span className="text-sm text-gray-500">{texto}</span>
    </div>
  );
}

/**
 * Estado vazio.
 *
 * Sempre com uma ação, quando existir uma: tela vazia sem saída faz o operador
 * achar que o sistema quebrou.
 */
export function Vazio({
  titulo,
  descricao,
  acao,
  icone = "Inbox",
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        {icone === "Inbox" ? (
          <Inbox className="h-7 w-7 text-gray-400" aria-hidden="true" />
        ) : (
          <Icone nome={icone} className="h-7 w-7 text-gray-400" />
        )}
      </div>
      <h3 className="text-base font-semibold text-gray-900">{titulo}</h3>
      {descricao && (
        <p className="mt-1 max-w-md text-sm text-gray-500">{descricao}</p>
      )}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

/** Faixa de erro ou aviso, dispensável pelo operador. */
export function Aviso({
  mensagem,
  tom = "erro",
  onFechar,
}: {
  mensagem: string;
  tom?: "erro" | "atencao" | "info" | "ok";
  onFechar?: () => void;
}) {
  if (!mensagem) return null;

  const tons: Record<string, string> = {
    erro: "border-[#FECDCA] bg-[#FEF2F2] text-[#B42318]",
    atencao: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
    info: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]",
    ok: "border-[#ABEFC6] bg-[#ECFDF3] text-[#027A48]",
  };

  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${tons[tom]}`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{mensagem}</span>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* -------------------------------- Paginação ------------------------------- */

/**
 * Paginação.
 *
 * `totalPaginas` pode chegar 0 de algumas rotas (é `ceil(total/limit)` puro), e
 * 0 renderizaria "Página 1 de 0". Normalizamos para no mínimo 1.
 */
export function Paginacao({
  pagina,
  totalPaginas,
  total,
  onMudar,
  rotulo = "registros",
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  onMudar: (pagina: number) => void;
  rotulo?: string;
}) {
  const paginas = Math.max(1, totalPaginas);
  if (total === 0) return null;

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row">
      <p className="text-sm text-gray-500">
        {total} {rotulo} · página {pagina} de {paginas}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMudar(pagina - 1)}
          disabled={pagina <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onMudar(pagina + 1)}
          disabled={pagina >= paginas}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Próxima
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- Blocos --------------------------------- */

export function Painel({
  titulo,
  descricao,
  acoes,
  children,
  className = "",
}: {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}
    >
      {(titulo || acoes) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            {titulo && (
              <h2 className="text-base font-semibold text-gray-900">
                {titulo}
              </h2>
            )}
            {descricao && (
              <p className="mt-0.5 text-sm text-gray-500">{descricao}</p>
            )}
          </div>
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Par rótulo/valor da ficha de detalhe. */
export function Dado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {rotulo}
      </dt>
      <dd className="mt-1 text-sm font-medium text-gray-900">{children}</dd>
    </div>
  );
}

/** Barra de progresso de etapas. Laranja porque é trabalho em curso. */
export function Progresso({
  feito,
  total,
  className = "",
}: {
  feito: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((feito / total) * 100)) : 0;
  const completo = pct >= 100;

  return (
    <div className={className}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={feito}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${feito} de ${total} etapas`}
      >
        <div
          className={`h-full rounded-full transition-all ${
            completo ? "bg-[#039855]" : "bg-orange-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
