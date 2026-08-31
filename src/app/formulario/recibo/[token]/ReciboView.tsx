"use client";

/**
 * Consulta pública do formulário pelo link único.
 *
 * A pessoa enviou, guardou o link, e volta nele semanas depois para conferir. O
 * conteúdo é o mesmo da revisão, mas em LEITURA: não há como editar por aqui, e
 * isso é decisão — o envio é a declaração do cliente, e declaração editável não
 * prova nada. Correção vem de um envio novo, com protocolo novo.
 *
 * A busca acontece no cliente, e não no servidor, por um motivo específico: o
 * token está na URL, e uma página renderizada no servidor com o token no caminho
 * termina no log de acesso do Traefik com os dados do formulário associados.
 * Buscando pela API, o token continua na URL (não tem como não estar), mas a
 * resposta não passa a fazer parte do HTML em cache de nenhuma camada.
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  SITUACAO_FORMULARIO_ICONE,
  SITUACAO_FORMULARIO_LABEL,
} from "@/lib/formulario-abertura";
import { BotaoForm, Cartao, Nota } from "../../componentes/Base";
import {
  Resumo,
  type DadosEnviados,
  type DocumentoResumo,
} from "../../componentes/Resumo";

type Recebido = {
  protocolo: string;
  dados: DadosEnviados;
  situacao: string;
  createdAt: string;
  documentos: DocumentoResumo[];
};

export default function ReciboView({ token }: { token: string }) {
  const [dados, setDados] = useState<Recebido | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch(`/api/formulario/publico/${token}`, {
        // Sem cache: o cliente pode voltar depois de o escritório mudar a
        // situação, e um recibo em cache mostraria "Recebido" para sempre.
        cache: "no-store",
      });
      if (!r.ok) {
        setErro(
          r.status === 404
            ? "Este link não é válido. Confira se copiou o endereço completo."
            : "Não conseguimos abrir seu formulário agora. Tente novamente em alguns instantes."
        );
        return;
      }
      const json = (await r.json()) as { formulario: Recebido };
      setDados(json.formulario);
    } catch {
      setErro("Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  return (
    <div lang="pt-BR" className="cz-form min-h-screen pb-14">
      <header className="border-b border-[#E7EAEF] bg-white">
        <div className="mx-auto max-w-[920px] px-4 py-6 sm:px-8 sm:py-8">
          <Image
            src="/logopng.webp"
            alt="ContaZoom"
            width={210}
            height={48}
            className="h-8 w-auto object-contain sm:h-9"
            priority
          />

          {dados && (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFDCC4] bg-[#FFF4EC] px-3 py-1 text-[0.75rem] font-bold uppercase tracking-[0.04em] text-[#C2410C]">
                  <Icone
                    nome={SITUACAO_FORMULARIO_ICONE[dados.situacao] ?? "Send"}
                    className="h-3.5 w-3.5"
                  />
                  {SITUACAO_FORMULARIO_LABEL[dados.situacao] ?? dados.situacao}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-[#667085]">
                  <Icone nome="Calendar" className="h-3.5 w-3.5" />
                  enviado em {dataHoraLegivel(dados.createdAt)}
                </span>
              </div>

              <h1 className="mt-3 text-[1.75rem] font-bold leading-9 tracking-[-0.03em] text-[#101828] sm:text-[2rem]">
                Abertura de CNPJ
              </h1>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-[#98A2B3]">
                  Protocolo
                </span>
                <span className="cz-num text-[1.375rem] font-bold tracking-[0.02em] text-[#101828]">
                  {dados.protocolo}
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[920px] px-4 py-6 sm:px-8 sm:py-10">
        {carregando && (
          <Cartao className="flex items-center justify-center gap-2.5 p-10">
            <Icone
              nome="Loader"
              className="h-5 w-5 animate-spin text-[#F26212]"
            />
            <span className="text-[0.9375rem] font-medium text-[#667085]">
              Abrindo seu formulário
            </span>
          </Cartao>
        )}

        {!carregando && erro && (
          <Cartao className="p-6 text-center sm:p-10">
            <span
              aria-hidden="true"
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]"
            >
              <Icone nome="AlertTriangle" className="h-7 w-7" />
            </span>
            <h2 className="mt-5 text-[1.25rem] font-bold tracking-[-0.02em] text-[#101828]">
              Não foi possível abrir
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-6 text-[#667085]">
              {erro}
            </p>
            <div className="mt-6 flex justify-center">
              <BotaoForm variante="primario" icone="RefreshCw" onClick={buscar}>
                Tentar de novo
              </BotaoForm>
            </div>
          </Cartao>
        )}

        {!carregando && dados && (
          <div className="space-y-5">
            <Nota tom="info">
              Esta é a cópia do que você enviou. Se algum dado estiver errado, fale
              com o escritório informando o protocolo{" "}
              <strong className="cz-num font-bold">{dados.protocolo}</strong> — não
              é preciso preencher tudo de novo.
            </Nota>

            <Resumo dados={dados.dados} documentos={dados.documentos} />
          </div>
        )}
      </main>
    </div>
  );
}

/** `dd/mm/aaaa às HH:mm` no fuso de quem olha. */
function dataHoraLegivel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
