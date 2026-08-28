"use client";

/**
 * Histórico de alterações.
 *
 * É o pedido literal do usuário: "cada cliente as etapas estágios que se
 * encontram e o log disse quando foi alterado por quem o status". Então cada
 * linha responde três coisas, sempre: o QUE mudou, QUEM mudou, QUANDO.
 *
 * `autorNome` e `autorPapel` vêm congelados na linha do log, não da relação com
 * o usuário. É de propósito: se a pessoa mudar de papel ou sair da empresa, o
 * histórico continua dizendo quem era quando fez. Um log que se reescreve com o
 * cadastro atual não serve de histórico.
 */

import { ACAO_LOG_LABEL } from "@/lib/tarefa-etapas";
import { labelDoStatus } from "@/lib/tarefa-status";
import type { LogItem } from "./tipos";
import { dataHora, tempoRelativo } from "./formato";
import { SeloPapel } from "./Selos";
import Icone from "./Icone";

/** Ícone e tom por ação. Ação de retrocesso e de bloqueio não podem parecer rotina. */
const ESTILO_ACAO: Record<string, { icone: string; tom: string }> = {
  TAREFA_CRIADA: { icone: "Plus", tom: "bg-gray-100 text-gray-600" },
  ETAPA_CONCLUIDA: { icone: "CheckCircle2", tom: "bg-[#ECFDF3] text-[#027A48]" },
  ETAPA_AVANCADA: { icone: "ChevronRight", tom: "bg-[#FFF4EB] text-[#C2410C]" },
  ETAPA_RETORNADA: { icone: "RotateCcw", tom: "bg-[#FFFAEB] text-[#B54708]" },
  ETAPA_NAO_APLICAVEL: { icone: "MinusCircle", tom: "bg-gray-100 text-gray-500" },
  STATUS_ALTERADO: { icone: "TrendingUp", tom: "bg-[#EFF8FF] text-[#175CD3]" },
  BLOQUEIO_REGISTRADO: {
    icone: "AlertTriangle",
    tom: "bg-[#FEF2F2] text-[#B42318]",
  },
  BLOQUEIO_RESOLVIDO: { icone: "Unlock", tom: "bg-[#ECFDF3] text-[#027A48]" },
  RESPONSAVEL_ALTERADO: { icone: "User", tom: "bg-[#F4F3FF] text-[#5925DC]" },
  PRAZO_ALTERADO: { icone: "Calendar", tom: "bg-[#EFF8FF] text-[#175CD3]" },
  OBSERVACAO_ADICIONADA: { icone: "FileText", tom: "bg-gray-100 text-gray-600" },
  TAREFA_CONCLUIDA: { icone: "ClipboardCheck", tom: "bg-[#ECFDF3] text-[#027A48]" },
  TAREFA_REABERTA: { icone: "Unlock", tom: "bg-[#FFFAEB] text-[#B54708]" },
  PROTOCOLO_ATUALIZADO: { icone: "Landmark", tom: "bg-[#EFF8FF] text-[#175CD3]" },
  EMPRESA_VINCULADA: { icone: "Link2", tom: "bg-[#EFF8FF] text-[#175CD3]" },
};

const PADRAO = { icone: "CircleDot", tom: "bg-gray-100 text-gray-500" };

/**
 * "de → para" legível.
 *
 * `de` e `para` guardam valores brutos: às vezes status (`EM_REVISAO`), às vezes
 * número de etapa (`4`), às vezes regime. Traduzimos quando reconhecemos como
 * status e deixamos cru quando não é — inventar tradução esconderia o dado real.
 */
function transicao(log: LogItem): string | null {
  const de = log.de?.trim();
  const para = log.para?.trim();
  if (!de && !para) return null;

  const traduz = (valor: string) => {
    const rotulo = labelDoStatus(valor);
    return rotulo === valor ? valor : rotulo;
  };

  if (de && para) return `${traduz(de)} → ${traduz(para)}`;
  return para ? traduz(para) : traduz(de as string);
}

export default function Historico({
  logs,
  truncado = false,
  vazio = "Nenhuma alteração registrada ainda.",
}: {
  logs: LogItem[];
  /** A API devolve no máximo 100 linhas; avisar é melhor que sumir com o resto. */
  truncado?: boolean;
  vazio?: string;
}) {
  if (logs.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-gray-500">{vazio}</p>
    );
  }

  return (
    <div>
      <ol className="divide-y divide-gray-100">
        {logs.map((log, indice) => {
          const estilo = ESTILO_ACAO[log.acao] ?? PADRAO;
          const mudanca = transicao(log);

          return (
            <li
              key={log.id ?? `${log.createdAt}-${indice}`}
              className="flex gap-3 px-5 py-3.5"
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${estilo.tom}`}
              >
                <Icone nome={estilo.icone} className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {ACAO_LOG_LABEL[log.acao] ?? log.acao}
                  </span>
                  {mudanca && (
                    <span className="text-xs font-medium text-gray-500">
                      {mudanca}
                    </span>
                  )}
                </div>

                {log.detalhe && (
                  <p className="mt-1 text-sm text-gray-600">{log.detalhe}</p>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">
                    {log.autorNome}
                  </span>
                  {/* Peso fraco em vez de forçar padding: no histórico o papel é
                      contexto do autor, não o dado da linha. */}
                  <SeloPapel papel={log.autorPapel} peso="fraco" />
                  <span>·</span>
                  <span title={dataHora(log.createdAt)}>
                    {dataHora(log.createdAt)}
                  </span>
                  <span className="text-gray-400">
                    ({tempoRelativo(log.createdAt)})
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {truncado && (
        <p className="flex items-center justify-center gap-1.5 border-t border-gray-200 bg-gray-50 px-5 py-3 text-xs text-gray-500">
          <Icone nome="Info" className="h-3.5 w-3.5" />
          Mostrando as 100 alterações mais recentes. Use a Auditoria para o
          histórico completo.
        </p>
      )}
    </div>
  );
}
