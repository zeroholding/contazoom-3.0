"use client";

import { Bell, Building2, FileText, Landmark, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { dataCurta, tempoRelativo } from "../../comum/formato";
import { TIPO_NOTIFICACAO, ehNotificacaoDeDocumento, type NotificacaoItem } from "@/lib/notificacoes/tipos";

/**
 * Ícone e cor de cada tipo de notificação.
 *
 * Os mesmos ícones das pastas padrão (`DOCUMENT_CATEGORIES`): quem conhece o
 * drive reconhece o tipo pelo desenho antes de ler. As cores seguem as famílias
 * do kit (âmbar, céu, esmeralda, violeta) em tom claro, para o sino não virar
 * um arco-íris; o laranja fica para o que é da marca e para o genérico.
 */
type VisualTipo = { Icone: LucideIcon; caixa: string; tinta: string };

const VISUAL: Record<string, VisualTipo> = {
  [TIPO_NOTIFICACAO.DOCUMENTO_IMPOSTOS]: {
    Icone: Landmark,
    caixa: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/80",
    tinta: "text-amber-700",
  },
  [TIPO_NOTIFICACAO.DOCUMENTO_FOLHA]: {
    Icone: Users,
    caixa: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/80",
    tinta: "text-sky-700",
  },
  [TIPO_NOTIFICACAO.DOCUMENTO_FATURAMENTO]: {
    Icone: TrendingUp,
    caixa: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80",
    tinta: "text-emerald-700",
  },
  [TIPO_NOTIFICACAO.DOCUMENTO_INSTITUCIONAL]: {
    Icone: Building2,
    caixa: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/80",
    tinta: "text-violet-700",
  },
  [TIPO_NOTIFICACAO.DOCUMENTO_GERAL]: {
    Icone: FileText,
    caixa:
      "bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)] ring-1 ring-inset ring-[var(--cz-laranja-borda)]",
    tinta: "text-[var(--cz-laranja-forte)]",
  },
};

const VISUAL_PADRAO: VisualTipo = {
  Icone: Bell,
  caixa: "bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)] ring-1 ring-inset ring-[var(--cz-hairline-forte)]",
  tinta: "text-[var(--cz-texto-suave)]",
};

export function visualDoTipo(tipo: string): VisualTipo {
  return VISUAL[tipo] ?? VISUAL_PADRAO;
}

export function IconeTipoNotificacao({ tipo, tamanho = "md" }: { tipo: string; tamanho?: "sm" | "md" }) {
  const { Icone, caixa } = visualDoTipo(tipo);
  const medidas = tamanho === "sm" ? "size-8 rounded-lg [&>svg]:size-4" : "size-10 rounded-xl [&>svg]:size-[18px]";
  return (
    <span className={`grid shrink-0 place-items-center ${medidas} ${caixa}`} aria-hidden="true">
      <Icone strokeWidth={2} />
    </span>
  );
}

/** "agora", "há 5 min", "há 3h"; depois de uma semana, a data. */
export function quandoChegou(iso: string): string {
  const idade = Date.now() - new Date(iso).getTime();
  if (Number.isFinite(idade) && idade > 7 * 24 * 60 * 60 * 1000) return dataCurta(iso);
  return tempoRelativo(iso) ?? "";
}

/** Linha principal: o nome do arquivo é o que o cliente procura. */
export function tituloDoItem(item: NotificacaoItem): string {
  if (ehNotificacaoDeDocumento(item.tipo) && item.dados?.nomeArquivo) return item.dados.nomeArquivo;
  return item.titulo;
}

/** Linha de contexto: competência (impostos), pasta (demais) ou a mensagem. */
export function detalheDoItem(item: NotificacaoItem): string {
  if (ehNotificacaoDeDocumento(item.tipo)) {
    if (item.dados?.competencia) return `Competência ${item.dados.competencia}`;
    if (item.dados?.pasta) return item.dados.pasta;
    return item.titulo;
  }
  return item.mensagem;
}
