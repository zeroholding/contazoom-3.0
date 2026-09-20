"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Aviso, Carregando } from "@/app/components/views/ui/tarefas/Base";
import { Botao } from "@/app/components/views/ui/tarefas/Campos";
import { apiGet, mensagemDeErro } from "@/app/components/views/ui/tarefas/api";

type Linha = {
  competencia: string;
  label: string;
  origem: string;
  valor: string;
  valorApurado: string | null;
  documentos: number;
  observacao: string | null;
};

type Declaracao = {
  id: string;
  protocolo: string;
  inicio: string;
  fim: string;
  linhas: Linha[];
  valorTotal: string;
  mediaMensal: string;
  razaoSocial: string;
  cnpj: string;
  regime: string;
  finalidade: string | null;
  situacao: string;
  substituidaPorId: string | null;
  substituidaPorProtocolo: string | null;
  emitidaPorNome: string;
  conteudoHash: string;
  versaoTemplate: number;
  createdAt: string;
  integridadeOk: boolean;
};

const real = (valor: string | number) =>
  Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const cnpj = (valor: string) =>
  valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

const dataLonga = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

const ORIGEM: Record<string, string> = {
  XML: "Documentos fiscais",
  MANUAL: "Informado manualmente",
  MISTO: "Documentos + ajuste",
};

export default function DeclaracaoFaturamentoDocumento({ id }: { id: string }) {
  const [declaracao, setDeclaracao] = useState<Declaracao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const controlador = new AbortController();
    let vivo = true;
    apiGet<{ declaracao: Declaracao }>(
      `/api/fiscal/declaracao/${id}`,
      controlador.signal,
    )
      .then((resposta) => {
        if (vivo) setDeclaracao(resposta.declaracao);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (mensagem) setErro(mensagem);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [id]);

  if (carregando) return <Carregando texto="Abrindo a declaração" variante="ficha" />;
  if (erro || !declaracao) return <Aviso mensagem={erro || "Declaração não encontrada."} />;

  return (
    <div className="cz-declaracao-pagina mx-auto max-w-[960px] p-4 sm:p-6">
      <div className="cz-nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/tarefas/faturamento"
          className="text-[13px] font-semibold text-[var(--cz-texto-suave)] hover:text-[var(--cz-texto)]"
        >
          ← Voltar ao faturamento
        </Link>
        <Botao icone="Printer" onClick={() => window.print()}>
          Imprimir / Salvar como PDF
        </Botao>
      </div>

      {declaracao.situacao === "SUBSTITUIDA" && (
        <div className="mb-5 border-4 border-red-700 px-4 py-3 text-center text-sm font-black uppercase tracking-[0.15em] text-red-800">
          Documento substituído — não utilizar
          {declaracao.substituidaPorProtocolo && (
            <span className="mt-1 block text-[10px] font-semibold normal-case tracking-normal">
              Substituída pelo protocolo {declaracao.substituidaPorProtocolo}.
            </span>
          )}
        </div>
      )}

      <article className="cz-declaracao-imprimir rounded-[16px] border border-slate-200 bg-white px-8 py-10 text-slate-900 shadow-sm sm:px-12">
        <header className="border-b-2 border-slate-900 pb-5 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            ContaZoom · Apuração fiscal
          </p>
          <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide">
            Declaração de Faturamento
          </h1>
          <p className="mt-2 font-mono text-sm font-semibold">{declaracao.protocolo}</p>
        </header>

        <section className="mt-7 space-y-3 text-[14px] leading-7">
          <p>
            Declaramos, para os devidos fins, que a empresa{" "}
            <strong>{declaracao.razaoSocial}</strong>, inscrita no CNPJ sob nº{" "}
            <strong>{cnpj(declaracao.cnpj)}</strong>, enquadrada no regime{" "}
            <strong>{declaracao.regime.replaceAll("_", " ")}</strong>, apresentou
            o faturamento abaixo no período de <strong>{declaracao.inicio}</strong>{" "}
            a <strong>{declaracao.fim}</strong>.
          </p>
          {declaracao.finalidade && (
            <p>
              <strong>Finalidade:</strong> {declaracao.finalidade}.
            </p>
          )}
        </section>

        <table className="mt-7 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y-2 border-slate-900 text-left uppercase tracking-wide">
              <th className="py-2.5">Competência</th>
              <th className="py-2.5">Origem</th>
              <th className="py-2.5 text-center">Documentos</th>
              <th className="py-2.5 text-right">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {declaracao.linhas.map((linha) => (
              <tr key={linha.competencia} className="border-b border-slate-200">
                <td className="py-2 font-semibold">{linha.label}</td>
                <td className="py-2 text-slate-600">{ORIGEM[linha.origem] ?? linha.origem}</td>
                <td className="py-2 text-center font-mono">{linha.documentos}</td>
                <td className="py-2 text-right font-mono font-semibold">{real(linha.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 text-sm font-bold">
              <td colSpan={3} className="py-3">TOTAL DO PERÍODO</td>
              <td className="py-3 text-right font-mono">{real(declaracao.valorTotal)}</td>
            </tr>
            <tr className="text-xs text-slate-600">
              <td colSpan={3} className="pb-2">Média mensal</td>
              <td className="pb-2 text-right font-mono">{real(declaracao.mediaMensal)}</td>
            </tr>
          </tfoot>
        </table>

        <section className="mt-8 text-[11px] leading-5 text-slate-600">
          <p>
            Os valores acima constituem um snapshot das competências registradas no
            sistema no momento da emissão. Meses de origem “Documentos fiscais” são
            apurados pelos XMLs importados; valores manuais possuem justificativa
            registrada no histórico interno.
          </p>
        </section>

        <section className="mt-16 grid grid-cols-2 gap-12 text-center text-xs">
          <div className="border-t border-slate-700 pt-2">
            Responsável pelo escritório
          </div>
          <div className="border-t border-slate-700 pt-2">
            Responsável pela empresa
          </div>
        </section>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-[9px] leading-4 text-slate-500">
          <div className="flex flex-wrap justify-between gap-2">
            <span>Emitida em {dataLonga(declaracao.createdAt)} por {declaracao.emitidaPorNome}</span>
            <span>Template v{declaracao.versaoTemplate}</span>
          </div>
          <p className="mt-1 break-all font-mono">Integridade SHA-256: {declaracao.conteudoHash}</p>
        </footer>
      </article>
    </div>
  );
}
