"use client";

/**
 * Trilha de etapas.
 *
 * É a peça central do módulo: é aqui que a etapa se move, e a etapa é o que vai
 * para o log. O status macro dos seis selos é derivado disto, não digitado.
 *
 * Serve apuração e legalização com os mesmos componentes porque a forma da etapa
 * é idêntica nos dois (`numero`, `titulo`, `responsavelTipo`, `opcional`,
 * `situacao`) — só os endpoints mudam, e esses entram por callback.
 *
 * Decisões que valem explicar:
 *
 * - só a etapa EM_ANDAMENTO tem botão de concluir. Concluir a etapa 7 com a 5
 *   pendente faria o log mentir sobre a ordem do trabalho.
 * - a permissão vem por etapa, de `responsavelTipo`: o comercial não vê botão
 *   em etapa do escritório. Evita clique que a API recusaria com 403.
 * - etapa dispensada continua visível, riscada. Sumir com ela esconderia que
 *   alguém decidiu dispensá-la, e o motivo está justamente ali.
 */

import { Fragment } from "react";
import { RESPONSAVEL_LABEL } from "@/lib/tarefa-etapas";
import type { Etapa } from "./tipos";
import { SeloResponsavelEtapa, SeloSituacaoEtapa } from "./Selos";
import { Botao } from "./Campos";
import { dataHora } from "./formato";
import Icone from "./Icone";

export type PermissoesEtapa = {
  concluirEtapaComercial: boolean;
  concluirEtapaEscritorio: boolean;
  concluirEtapaAmbos: boolean;
};

/**
 * Pode concluir ESTA etapa?
 *
 * Espelha `podeConcluirEtapa` do servidor. Se divergir, a tela mostra botão que
 * toma 403 (ou esconde botão que funcionaria) — então a regra é a mesma:
 * responsabilidade da etapa contra papel de quem olha.
 */
export function podeMexerNaEtapa(
  etapa: Etapa,
  permissoes: PermissoesEtapa
): boolean {
  if (etapa.responsavelTipo === "COMERCIAL_CZ") {
    return permissoes.concluirEtapaComercial;
  }
  if (etapa.responsavelTipo === "ESCRITORIO") {
    return permissoes.concluirEtapaEscritorio;
  }
  return permissoes.concluirEtapaAmbos;
}

const CIRCULO: Record<string, string> = {
  CONCLUIDA: "border-[#039855] bg-[#039855] text-white",
  EM_ANDAMENTO: "border-orange-500 bg-orange-500 text-white",
  NAO_APLICAVEL: "border-gray-300 bg-gray-100 text-gray-400",
  PENDENTE: "border-gray-300 bg-white text-gray-400",
};

const ICONE_CIRCULO: Record<string, string> = {
  CONCLUIDA: "CheckCircle2",
  EM_ANDAMENTO: "Loader",
  NAO_APLICAVEL: "MinusCircle",
  PENDENTE: "Circle",
};

export default function ListaEtapas({
  etapas,
  permissoes,
  bloqueada,
  encerrada,
  podeVoltar,
  ocupado,
  onConcluir,
  onVoltar,
  onDispensar,
}: {
  etapas: Etapa[];
  /**
   * Aceito e não usado, de propósito.
   *
   * A posição do fluxo é lida de `etapa.situacao` (a etapa em curso é a única
   * `EM_ANDAMENTO`), que é a mesma fonte que o servidor usa para decidir o que
   * pode ser concluído. Derivar de `etapaAtual` daria uma segunda fonte de
   * verdade para a mesma coisa, e as duas divergiriam justamente no caso que
   * importa: etapa dispensada no meio do caminho.
   *
   * Continua no tipo porque as telas de detalhe passam, e retirar quebraria a
   * chamada delas sem ganho nenhum.
   */
  etapaAtual?: number;
  permissoes: PermissoesEtapa;
  bloqueada: boolean;
  encerrada: boolean;
  podeVoltar: boolean;
  /** Trava os botões enquanto uma ação está em voo. */
  ocupado: boolean;
  onConcluir: (etapa: Etapa) => void;
  onVoltar: (etapa: Etapa) => void;
  onDispensar: (etapa: Etapa) => void;
}) {
  if (etapas.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-gray-500">
        Nenhuma etapa registrada para esta tarefa.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-gray-100">
      {etapas.map((etapa, indice) => {
        const emCurso = etapa.situacao === "EM_ANDAMENTO";
        const dispensada = etapa.situacao === "NAO_APLICAVEL";
        const concluida = etapa.situacao === "CONCLUIDA";
        const minha = podeMexerNaEtapa(etapa, permissoes);
        const ultima = indice === etapas.length - 1;

        return (
          <li
            key={etapa.id}
            className={`relative px-5 py-4 transition-colors ${
              emCurso ? "bg-orange-50/50" : ""
            }`}
          >
            <div className="flex gap-4">
              {/* Trilha: círculo + linha até a etapa seguinte */}
              <div className="relative flex flex-col items-center">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    CIRCULO[etapa.situacao] ?? CIRCULO.PENDENTE
                  }`}
                  aria-hidden="true"
                >
                  {concluida || dispensada || emCurso ? (
                    <Icone
                      nome={ICONE_CIRCULO[etapa.situacao] ?? "Circle"}
                      className={`h-4 w-4 ${emCurso ? "animate-spin" : ""}`}
                    />
                  ) : (
                    etapa.numero
                  )}
                </span>
                {!ultima && (
                  <span
                    className={`mt-1 w-0.5 flex-1 ${
                      concluida || dispensada ? "bg-[#039855]/40" : "bg-gray-200"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-gray-400">
                        Etapa {etapa.numero}
                      </span>
                      {etapa.opcional && (
                        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
                          Opcional
                        </span>
                      )}
                    </p>
                    <h3
                      className={`mt-0.5 text-sm font-semibold ${
                        dispensada
                          ? "text-gray-400 line-through"
                          : "text-gray-900"
                      }`}
                    >
                      {etapa.titulo}
                    </h3>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <SeloResponsavelEtapa tipo={etapa.responsavelTipo} />
                    <SeloSituacaoEtapa situacao={etapa.situacao} />
                  </div>
                </div>

                {/* Quem fez e quando. É a metade do valor da tela. */}
                {(etapa.concluidaEm || etapa.concluidaPor) && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
                    <Icone nome="User" className="h-3.5 w-3.5" />
                    <span className="font-medium text-gray-700">
                      {etapa.concluidaPor || "—"}
                    </span>
                    <span>·</span>
                    <span>{dataHora(etapa.concluidaEm)}</span>
                  </p>
                )}

                {etapa.observacao && (
                  <p className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {etapa.observacao}
                  </p>
                )}

                {/* Ações só na etapa em curso, e só para quem é dono dela. */}
                {emCurso && !encerrada && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {minha ? (
                      <Fragment>
                        <Botao
                          variante="primario"
                          icone="CheckCircle2"
                          disabled={ocupado || bloqueada}
                          onClick={() => onConcluir(etapa)}
                          title={
                            bloqueada
                              ? "Resolva a pendência aberta antes de concluir a etapa"
                              : undefined
                          }
                        >
                          Concluir etapa
                        </Botao>

                        {etapa.opcional && (
                          <Botao
                            variante="secundario"
                            icone="MinusCircle"
                            disabled={ocupado}
                            onClick={() => onDispensar(etapa)}
                          >
                            Não se aplica
                          </Botao>
                        )}
                      </Fragment>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Icone nome="Ban" className="h-3.5 w-3.5" />
                        Etapa de {RESPONSAVEL_LABEL[etapa.responsavelTipo] ??
                          etapa.responsavelTipo}
                        . Você não executa esta etapa.
                      </p>
                    )}

                    {podeVoltar && etapa.numero > 1 && (
                      <Botao
                        variante="fantasma"
                        icone="ChevronLeft"
                        disabled={ocupado}
                        onClick={() => onVoltar(etapa)}
                      >
                        Voltar etapa
                      </Botao>
                    )}
                  </div>
                )}

                {bloqueada && emCurso && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#B54708]">
                    <Icone nome="AlertTriangle" className="h-3.5 w-3.5" />
                    Existe pendência aberta. Resolva a pendência para concluir
                    esta etapa.
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
