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
import { textoContagemCurto } from "@/lib/dias-uteis";
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
  /** Abre o formulário de edição (prazo, responsável, observações e anexos). */
  onEditar?: (tarefa: ApuracaoLista) => void;
  /** Abre a confirmação de exclusão. Só passado para administrador. */
  onExcluir?: (tarefa: ApuracaoLista) => void;
};

export default function CartaoApuracao({
  tarefa,
  mostrarStatus = false,
  arrastavel = false,
  onArrastarInicio,
  onRegistrarPendencia,
  onEditar,
  onExcluir,
}: CartaoApuracaoProps) {
  const concluida = tarefa.status === STATUS.CONCLUIDO || !!tarefa.concluidaEm;
  const podeRegistrar =
    !!onRegistrarPendencia && !tarefa.bloqueada && !concluida;
  const podeEditar = !!onEditar;
  const podeExcluir = !!onExcluir;
  /** Quantos botões sobrepostos existem no canto, para reservar o espaço certo. */
  const botoesCanto =
    (podeRegistrar ? 1 : 0) + (podeEditar ? 1 : 0) + (podeExcluir ? 1 : 0);

  const nome = nomeEmpresa(tarefa.empresa);
  const responsavel =
    tarefa.responsavel?.name?.trim() || tarefa.responsavel?.email || null;

  /**
   * "Faltam 3 dias úteis · 5 corridos", no cartão.
   *
   * O escritório pediu as duas contagens, e elas respondem coisas diferentes:
   * corridos é o que o cliente cobra, úteis é o que dá para trabalhar. O número
   * vem calculado do servidor, então dois operadores em fusos diferentes veem o
   * mesmo valor — feito aqui, dependeria do relógio de cada máquina.
   */
  const contagem = tarefa.contagemPrazo;
  const textoDias = textoContagemCurto(contagem);

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
          {/* Reserva o espaço dos botões sobrepostos, senão o nome passa por
              baixo. 1.75rem por botão, que é a largura do alvo de clique. */}
          {botoesCanto > 0 && (
            <span
              className="shrink-0"
              style={{ width: `${botoesCanto * 1.75}rem` }}
              aria-hidden="true"
            />
          )}
        </div>

        <p className="mt-0.5 truncate text-xs text-gray-500">
          {tarefa.empresa.cnpj ? (
            formatarCnpj(tarefa.empresa.cnpj)
          ) : (
            // Empresa em abertura não tem CNPJ. O texto diz o motivo, porque um
            // espaço em branco aqui parece dado que não carregou.
            <span className="inline-flex items-center gap-1">
              <Icone nome="Hourglass" className="h-3 w-3 shrink-0" />
              Em abertura
            </span>
          )}
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
          {tarefa.anexos > 0 && (
            <span
              title={`${tarefa.anexos} ${
                tarefa.anexos === 1 ? "anexo" : "anexos"
              }`}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600"
            >
              <Icone nome="Paperclip" className="h-3.5 w-3.5 shrink-0" />
              <span className="cz-num">{tarefa.anexos}</span>
            </span>
          )}
        </div>

        {/*
          Dias úteis e corridos, em linha própria.

          Fora da fileira de selos de propósito: é um número que se lê, não um
          estado que se reconhece pela cor. Em atraso vira vermelho, porque aí o
          número passa a cobrar ação; no prazo fica cinza para não competir com o
          selo de prazo ao lado, que é quem carrega o sinal.
        */}
        {textoDias && (
          <p
            className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${
              contagem?.atrasado
                ? "text-[#B42318]"
                : contagem?.hoje
                  ? "text-[#B54708]"
                  : "text-gray-500"
            }`}
          >
            <Icone
              nome={contagem?.atrasado ? "AlarmClock" : "CalendarDays"}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span>{textoDias}</span>
          </p>
        )}

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

      {/* Botões sobrepostos, fora da âncora: conteúdo interativo dentro de `<a>`
          é HTML inválido e o leitor de tela anuncia um controle só. */}
      {botoesCanto > 0 && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
          {podeEditar && (
            <button
              type="button"
              title="Editar prazo, responsável e anexos"
              aria-label={`Editar ${nome}`}
              onClick={(evento) => {
                // preventDefault/stopPropagation ficam porque o cartão pode ser
                // reaproveitado dentro de um alvo clicável (linha de tabela).
                evento.preventDefault();
                evento.stopPropagation();
                onEditar?.(tarefa);
              }}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#FFF2E9] hover:text-[#C2410C]"
            >
              <Icone nome="Pencil" className="h-4 w-4" />
            </button>
          )}
          {podeRegistrar && (
            <button
              type="button"
              title="Registrar pendência"
              aria-label={`Registrar pendência em ${nome}`}
              onClick={(evento) => {
                evento.preventDefault();
                evento.stopPropagation();
                onRegistrarPendencia?.(tarefa);
              }}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#FFFAEB] hover:text-[#B54708]"
            >
              <Icone nome="AlertTriangle" className="h-4 w-4" />
            </button>
          )}
          {/* Excluir por ÚLTIMO na fileira, encostado na borda: é a única ação
              sem volta, e a mais distante do centro do cartão é a que se clica
              menos por acidente. */}
          {podeExcluir && (
            <button
              type="button"
              title="Excluir competência"
              aria-label={`Excluir competência de ${nome}`}
              onClick={(evento) => {
                evento.preventDefault();
                evento.stopPropagation();
                onExcluir?.(tarefa);
              }}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[#FEF2F2] hover:text-[#B42318]"
            >
              <Icone nome="Trash2" className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
