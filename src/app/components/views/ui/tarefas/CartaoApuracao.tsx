"use client";

/**
 * Cartão de uma apuração mensal. Usado nas colunas do Kanban.
 *
 * O cartão inteiro navega para o detalhe da competência. A camada de fora é uma
 * `div` posicionada, e não o próprio `Link`, por dois motivos práticos:
 *
 *   1. o botão de registrar pendência não pode ficar DENTRO de uma âncora
 *      (conteúdo interativo dentro de `<a>` é HTML inválido e o leitor de tela
 *      anuncia um controle só);
 *   2. o arraste precisa de um alvo estável. Âncora tem arraste nativo próprio
 *      (arrasta a URL), então o `Link` recebe `draggable={false}` e quem carrega
 *      o `draggable` é a `div` de fora.
 *
 * Nada aqui decide o que o arraste significa: isso é regra da tela de lista.
 * O cartão só avisa que começou e entrega a tarefa.
 */

import Link from "next/link";
import type { DragEvent } from "react";
import { STATUS, competenciaCurta } from "@/lib/tarefa-status";
import type { ApuracaoLista } from "./tipos";
import { formatarCnpj, iniciais, nomeEmpresa } from "./formato";
import { Progresso } from "./Base";
import { SeloBloqueio, SeloPrazo, SeloRegime, SeloStatus } from "./Selos";
import Icone from "./Icone";

type CartaoApuracaoProps = {
  tarefa: ApuracaoLista;
  /** Mostra o selo de status. Desnecessário no Kanban: a coluna já diz. */
  mostrarStatus?: boolean;
  arrastavel?: boolean;
  onArrastarInicio?: (
    evento: DragEvent<HTMLDivElement>,
    tarefa: ApuracaoLista
  ) => void;
  onRegistrarPendencia?: (tarefa: ApuracaoLista) => void;
};

export default function CartaoApuracao({
  tarefa,
  mostrarStatus = false,
  arrastavel = false,
  onArrastarInicio,
  onRegistrarPendencia,
}: CartaoApuracaoProps) {
  const concluida = tarefa.status === STATUS.CONCLUIDO || !!tarefa.concluidaEm;
  const podeRegistrar =
    !!onRegistrarPendencia && !tarefa.bloqueada && !concluida;

  const nome = nomeEmpresa(tarefa.empresa);
  const responsavel =
    tarefa.responsavel?.name?.trim() || tarefa.responsavel?.email || null;

  return (
    <div
      className="relative"
      draggable={arrastavel}
      onDragStart={(evento) => {
        if (!arrastavel) return;
        evento.dataTransfer.effectAllowed = "move";
        // O id no dataTransfer é redundante (a tela guarda a tarefa arrastada em
        // estado), mas sem nenhum dado o Firefox cancela o arraste.
        evento.dataTransfer.setData("text/plain", tarefa.id);
        onArrastarInicio?.(evento, tarefa);
      }}
    >
      <Link
        href={`/admin/tarefas/apuracao/${tarefa.id}`}
        draggable={false}
        className={`block rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:border-orange-400 hover:bg-orange-50/30 ${
          arrastavel ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <div className="flex items-start gap-2">
          <p
            className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900"
            title={tarefa.empresa.razaoSocial}
          >
            {nome}
          </p>
          {/* Reserva o espaço do botão sobreposto, senão o nome passa por baixo. */}
          {podeRegistrar && <span className="w-7 shrink-0" aria-hidden="true" />}
        </div>

        <p className="mt-0.5 truncate text-xs text-gray-500">
          {formatarCnpj(tarefa.empresa.cnpj)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SeloRegime regime={tarefa.regime} />
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600">
            <Icone nome="Calendar" className="h-3.5 w-3.5 shrink-0" />
            {competenciaCurta(tarefa.ano, tarefa.mes)}
          </span>
          {mostrarStatus && <SeloStatus status={tarefa.status} curto />}
        </div>

        <div className="mt-2.5">
          <p className="text-xs font-medium text-gray-700">
            Etapa {tarefa.etapaAtual} de {tarefa.totalEtapas}
          </p>
          {tarefa.tituloEtapaAtual && (
            <p
              className="mt-0.5 truncate text-xs text-gray-500"
              title={tarefa.tituloEtapaAtual}
            >
              {tarefa.tituloEtapaAtual}
            </p>
          )}
          <Progresso
            feito={tarefa.etapasConcluidas}
            total={tarefa.totalEtapas}
            className="mt-1.5"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <SeloPrazo situacao={tarefa.prazo.situacao} dias={tarefa.prazo.dias} />
          {tarefa.bloqueada && (
            <SeloBloqueio
              responsavel={tarefa.bloqueioResponsavel}
              dias={tarefa.diasEmBloqueio}
            />
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2.5">
          {responsavel ? (
            <>
              <span
                title={responsavel}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white"
              >
                {iniciais(responsavel)}
              </span>
              <span className="truncate text-xs text-gray-600">
                {responsavel}
              </span>
            </>
          ) : (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400">
                <Icone nome="User" className="h-3.5 w-3.5" />
              </span>
              <span className="truncate text-xs text-gray-400">
                Sem responsável
              </span>
            </>
          )}
        </div>
      </Link>

      {podeRegistrar && (
        <button
          type="button"
          title="Registrar pendência"
          aria-label={`Registrar pendência em ${nome}`}
          onClick={(evento) => {
            // O botão está fora da âncora, mas preventDefault/stopPropagation
            // ficam porque o cartão pode ser reaproveitado dentro de um alvo
            // clicável (linha de tabela, por exemplo).
            evento.preventDefault();
            evento.stopPropagation();
            onRegistrarPendencia?.(tarefa);
          }}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#FFFAEB] hover:text-[#B54708]"
        >
          <Icone nome="AlertTriangle" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
