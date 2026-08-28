"use client";

/**
 * Selos de status, prazo, regime, papel e situação de etapa.
 *
 * Regra que vale para todos: NENHUM estado é comunicado só por cor. Sempre
 * cor + texto + ícone. Quem não distingue vermelho de verde precisa conseguir
 * operar o sistema, e um Kanban que só muda de tonalidade é inútil impresso ou
 * em monitor ruim.
 */

import {
  corDoStatus,
  labelDoStatus,
  STATUS_LABEL_CURTO,
} from "@/lib/tarefa-status";
import {
  BLOQUEIO_RESPONSAVEL_LABEL,
  REGIME_LABEL,
  REGIME_SIGLA,
  RESPONSAVEL_LABEL,
  SITUACAO_EMPRESA_LABEL,
  SITUACAO_ETAPA_LABEL,
} from "@/lib/tarefa-etapas";
import { PAPEL_ICONE, papelLabel, papelSelo } from "@/lib/papeis";
import { corPrazo, iconePrazo, textoPrazo } from "./formato";
import Icone from "./Icone";

const BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap";

/* --------------------------------- Status --------------------------------- */

export function SeloStatus({
  status,
  curto = false,
  className = "",
}: {
  status: string;
  curto?: boolean;
  className?: string;
}) {
  const cor = corDoStatus(status);
  const texto = curto
    ? STATUS_LABEL_CURTO[status] ?? labelDoStatus(status)
    : labelDoStatus(status);

  return (
    <span
      className={`${BASE} ${cor.selo} ${className}`}
      title={labelDoStatus(status)}
    >
      <Icone nome={cor.icone} className="h-3.5 w-3.5 shrink-0" />
      {texto}
    </span>
  );
}

/* ---------------------------------- Prazo --------------------------------- */

export function SeloPrazo({
  situacao,
  dias,
  className = "",
}: {
  situacao: string;
  dias: number | null | undefined;
  className?: string;
}) {
  // Prazo concluído não é informação em lista: só ocupa espaço no cartão.
  if (situacao === "CONCLUIDO") return null;

  return (
    <span className={`${BASE} ${corPrazo(situacao)} ${className}`}>
      <Icone nome={iconePrazo(situacao)} className="h-3.5 w-3.5 shrink-0" />
      {textoPrazo(situacao, dias)}
    </span>
  );
}

/* --------------------------------- Regime --------------------------------- */

/** Sigla (SN/LP) para cartão; nome inteiro fica no `title`. */
export function SeloRegime({
  regime,
  completo = false,
  className = "",
}: {
  regime: string;
  completo?: boolean;
  className?: string;
}) {
  const cor =
    regime === "SIMPLES_NACIONAL"
      ? "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]"
      : "bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]";

  return (
    <span
      className={`${BASE} ${cor} ${className}`}
      title={REGIME_LABEL[regime] ?? regime}
    >
      {completo
        ? REGIME_LABEL[regime] ?? regime
        : REGIME_SIGLA[regime] ?? regime}
    </span>
  );
}

/* ---------------------------------- Papel --------------------------------- */

export function SeloPapel({
  papel,
  className = "",
}: {
  papel: string | null | undefined;
  className?: string;
}) {
  const nome = papel ?? "";
  return (
    <span className={`${BASE} ${papelSelo(nome)} ${className}`}>
      <Icone
        nome={PAPEL_ICONE[nome] ?? "User"}
        className="h-3.5 w-3.5 shrink-0"
      />
      {papelLabel(nome)}
    </span>
  );
}

/* ------------------------------ Etapa e afins ----------------------------- */

const COR_SITUACAO_ETAPA: Record<string, string> = {
  PENDENTE: "bg-gray-100 text-gray-600 border-gray-200",
  EM_ANDAMENTO: "bg-[#FFF4EB] text-[#C2410C] border-[#FED7AA]",
  CONCLUIDA: "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]",
  NAO_APLICAVEL: "bg-gray-50 text-gray-500 border-gray-200",
};

const ICONE_SITUACAO_ETAPA: Record<string, string> = {
  PENDENTE: "Circle",
  EM_ANDAMENTO: "Loader",
  CONCLUIDA: "CheckCircle2",
  NAO_APLICAVEL: "MinusCircle",
};

export function SeloSituacaoEtapa({
  situacao,
  className = "",
}: {
  situacao: string;
  className?: string;
}) {
  return (
    <span
      className={`${BASE} ${
        COR_SITUACAO_ETAPA[situacao] ?? COR_SITUACAO_ETAPA.PENDENTE
      } ${className}`}
    >
      <Icone
        nome={ICONE_SITUACAO_ETAPA[situacao] ?? "Circle"}
        className="h-3.5 w-3.5 shrink-0"
      />
      {SITUACAO_ETAPA_LABEL[situacao] ?? situacao}
    </span>
  );
}

/** Quem é dono da etapa. Cor diferente para não confundir com status. */
export function SeloResponsavelEtapa({
  tipo,
  className = "",
}: {
  tipo: string;
  className?: string;
}) {
  const cor =
    tipo === "COMERCIAL_CZ"
      ? "bg-[#FFF4EB] text-[#C2410C] border-[#FED7AA]"
      : tipo === "ESCRITORIO"
      ? "bg-gray-100 text-gray-700 border-gray-200"
      : "bg-[#F4F3FF] text-[#5925DC] border-[#D9D6FE]";

  return (
    <span className={`${BASE} ${cor} ${className}`}>
      {RESPONSAVEL_LABEL[tipo] ?? tipo}
    </span>
  );
}

/* ------------------------------ Empresa e bloqueio ------------------------ */

const COR_SITUACAO_EMPRESA: Record<string, string> = {
  ATIVA: "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]",
  SUSPENSA: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  ENCERRADA: "bg-gray-100 text-gray-600 border-gray-200",
  EM_ABERTURA: "bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]",
};

export function SeloSituacaoEmpresa({
  situacao,
  className = "",
}: {
  situacao: string;
  className?: string;
}) {
  return (
    <span
      className={`${BASE} ${
        COR_SITUACAO_EMPRESA[situacao] ?? "bg-gray-100 text-gray-600 border-gray-200"
      } ${className}`}
    >
      {SITUACAO_EMPRESA_LABEL[situacao] ?? situacao}
    </span>
  );
}

/**
 * Pendência aberta, com quem trava e há quantos dias.
 *
 * Os dias são o ponto: "travado há 12 dias esperando o cliente" é o que resolve
 * reunião; "travado" sozinho não cobra ação de ninguém.
 */
export function SeloBloqueio({
  responsavel,
  dias,
  className = "",
}: {
  responsavel: string | null | undefined;
  dias: number | null | undefined;
  className?: string;
}) {
  const quem = responsavel
    ? BLOQUEIO_RESPONSAVEL_LABEL[responsavel] ?? responsavel
    : "Pendência";
  const tempo =
    dias === null || dias === undefined
      ? ""
      : dias === 0
      ? " · hoje"
      : dias === 1
      ? " · há 1 dia"
      : ` · há ${dias} dias`;

  return (
    <span
      className={`${BASE} border-[#FEDF89] bg-[#FFFAEB] text-[#B54708] ${className}`}
    >
      <Icone nome="AlertTriangle" className="h-3.5 w-3.5 shrink-0" />
      {quem}
      {tempo}
    </span>
  );
}
