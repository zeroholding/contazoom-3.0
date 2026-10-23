"use client";

import { ArrowRight, CheckCheck, ChevronRight, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  marcarTodasNotificacoesComoLidas,
  marcarNotificacoesComoLidas,
  useNotificacoes,
} from "@/hooks/useNotificacoes";
import { ehNotificacaoDeDocumento, infoTipoNotificacao, type NotificacaoItem } from "@/lib/notificacoes/tipos";
import { irParaNotificacao } from "./navegacao";
import { IconeTipoNotificacao, quandoChegou, tituloDoItem } from "./visual";

/**
 * Aviso do Dashboard: documentos que a equipe enviou e o cliente ainda não viu.
 *
 * O Dashboard é a primeira tela depois do login, e para o cliente de
 * contabilidade o documento novo (guia, folha, declaração) costuma ser mais
 * urgente que o gráfico de vendas. Por isso fica no topo, antes dos filtros, e
 * some sozinho quando não há nada novo — não ocupa espaço "vazio".
 */

const VISIVEIS = 3;

/** "Impostos e obrigações · Competência setembro de 2026", sem repetir o tipo. */
function contextoDoItem(item: NotificacaoItem): string {
  const rotulo = infoTipoNotificacao(item.tipo).rotulo;
  if (item.dados?.competencia) return `${rotulo} · Competência ${item.dados.competencia}`;
  const pasta = item.dados?.pasta;
  if (!pasta) return rotulo;
  return pasta.toLocaleLowerCase("pt-BR").startsWith(rotulo.toLocaleLowerCase("pt-BR")) ? pasta : `${rotulo} · ${pasta}`;
}

export default function AvisoDocumentosNovos() {
  const { user } = useAuthContext();
  const router = useRouter();
  const { status, itens, porTipo } = useNotificacoes(user?.id);
  const [marcando, setMarcando] = useState(false);

  const novos = useMemo(
    () => itens.filter((item) => !item.lida && ehNotificacaoDeDocumento(item.tipo)),
    [itens],
  );

  if (status !== "pronto" || novos.length === 0) return null;

  // A lista carregada é limitada; a contagem por tipo vem do servidor inteira.
  const tiposComNovos = porTipo.filter((grupo) => ehNotificacaoDeDocumento(grupo.tipo) && grupo.naoLidas > 0);
  const total = Math.max(
    novos.length,
    tiposComNovos.reduce((soma, grupo) => soma + grupo.naoLidas, 0),
  );
  const maisRecente = novos[0];
  const unico = total === 1 && maisRecente.link;
  // Só diz que foi por e-mail quando foi: sem a Brevo configurada, ou nos
  // segundos antes do envio agrupado, o aviso existe só aqui.
  const avisadoPorEmail = novos.some((item) => item.emailEnviado);

  const abrir = (item: NotificacaoItem) => {
    void marcarNotificacoesComoLidas([item.id]);
    irParaNotificacao(router, item);
  };

  const marcarTodos = async () => {
    setMarcando(true);
    try {
      for (const grupo of tiposComNovos) await marcarTodasNotificacoesComoLidas(grupo.tipo);
    } finally {
      setMarcando(false);
    }
  };

  return (
    <section
      aria-labelledby="cz-aviso-documentos-titulo"
      className="cz-aviso-entra mb-6 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-laranja-borda)] bg-[var(--cz-superficie)] shadow-[var(--cz-elev-1)] max-md:mb-4"
    >
      <div className="relative flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Brilho laranja discreto no canto: marca o cartão como "da casa" sem
            pintar o fundo inteiro, que brigaria com os cartões de número abaixo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle,rgba(242,98,18,0.12),transparent_65%)]"
        />
        <div className="relative flex min-w-0 items-start gap-3.5">
          <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--cz-laranja)] text-white shadow-[0_10px_24px_-10px_rgba(242,98,18,0.75)]">
            <FileText className="size-6" aria-hidden="true" />
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--cz-superficie)] px-1 text-[11px] font-extrabold leading-none text-[var(--cz-laranja-forte)] tabular-nums ring-2 ring-[var(--cz-laranja)]">
              {total > 99 ? "99+" : total}
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--cz-laranja-forte)]">
              {total === 1 ? "Documento novo" : "Documentos novos"}
            </p>
            <h2 id="cz-aviso-documentos-titulo" className="mt-0.5 text-[17px] font-extrabold leading-snug text-[var(--cz-texto)]">
              {total === 1 ? "Chegou um documento novo para você" : `Chegaram ${total} documentos novos para você`}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
              {total === 1 ? "Enviado" : "O mais recente foi enviado"} pela equipe ContaZoom{" "}
              {quandoChegou(maisRecente.criadaEm)}.{avisadoPorEmail ? " O aviso também foi para o seu e-mail." : ""}
            </p>
          </div>
        </div>

        <div className="relative flex shrink-0 gap-2 max-sm:flex-col">
          <button
            type="button"
            onClick={() => (unico ? abrir(maisRecente) : router.push("/documentos"))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--cz-raio)] bg-[var(--cz-laranja)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[var(--cz-laranja-forte)] max-md:h-11 max-md:text-[14px]"
          >
            {unico ? "Abrir documento" : "Ver documentos"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void marcarTodos()}
            disabled={marcando}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--cz-raio)] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-4 text-[13px] font-bold text-[var(--cz-texto-suave)] transition-colors hover:border-[var(--cz-laranja-borda)] hover:text-[var(--cz-texto)] disabled:opacity-60 max-md:h-11 max-md:text-[14px]"
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            Marcar como vistos
          </button>
        </div>
      </div>

      <ul className="relative border-t border-[var(--cz-hairline)] bg-[var(--cz-fundo)]/70">
        {novos.slice(0, VISIVEIS).map((item) => (
          <li key={item.id} className="border-b border-[var(--cz-hairline)] last:border-b-0">
            <button
              type="button"
              onClick={() => abrir(item)}
              className="group flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--cz-superficie)] sm:px-5"
            >
              <IconeTipoNotificacao tipo={item.tipo} tamanho="sm" />
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[13.5px] font-bold text-[var(--cz-texto)] transition-colors group-hover:text-[var(--cz-laranja-forte)]"
                  title={tituloDoItem(item)}
                >
                  {tituloDoItem(item)}
                </span>
                <span className="block truncate text-xs text-[var(--cz-texto-suave)]">{contextoDoItem(item)}</span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold text-[var(--cz-texto-fraco)] max-sm:hidden">
                {quandoChegou(item.criadaEm)}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-[var(--cz-texto-fraco)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--cz-laranja-forte)]"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
        {total > VISIVEIS && (
          <li className="px-4 py-2.5 text-xs font-semibold text-[var(--cz-texto-suave)] sm:px-5">
            E mais {total - VISIVEIS} {total - VISIVEIS === 1 ? "documento" : "documentos"} na central de documentos.
          </li>
        )}
      </ul>
    </section>
  );
}
