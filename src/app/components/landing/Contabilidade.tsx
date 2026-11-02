"use client";

import { useState } from "react";
import {
  BookCheck,
  Calculator,
  ChevronDown,
  FileCheck2,
  FileCode2,
  FolderOpen,
  Headphones,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";
import FluxoApuracao from "./FluxoApuracao";

/**
 * 05 · O que a contabilidade inclui — Entregas e atendimento
 *
 * Foco comercial no que o cliente GANHA (tranquilidade fiscal, guias em dia,
 * sem bitributação, atendimento rápido e documentos prontos).
 * As etapas internas (10 do Simples e 14 do Presumido) ficam em uma área expansível
 * como prova de organização técnica, sem roubar o espaço comercial.
 */

const ENTREGAS = [
  {
    Icone: Calculator,
    titulo: "Apuração e guias com antecedência",
    texto:
      "No Simples Nacional, seu DAS sai apurado no PGDAS-D com conferência rigorosa. No Lucro Presumido, guias DARF (IRPJ, CSLL, PIS, COFINS), ICMS e ISS entregues sem correria antes do vencimento.",
  },
  {
    Icone: FileCode2,
    titulo: "Faturamento apurado diretamente pelos XMLs",
    texto:
      "Análise lote a lote das notas fiscais. Segregação técnica entre vendas faturadas, devoluções e remessas para centros de distribuição (Full), evitando pagar tributos sobre o que não é receita.",
  },
  {
    Icone: FolderOpen,
    titulo: "Documentos e guias centralizados no painel",
    texto:
      "Chega de procurar comprovantes no histórico de e-mails. Suas guias, notas e demonstrativos ficam organizados por ano e mês no painel web, além de notificações diretas no seu e-mail.",
  },
  {
    Icone: FileCheck2,
    titulo: "Declaração de faturamento de 12 meses",
    texto:
      "O documento oficial assinado que bancos, marketplaces e fornecedores exigem para liberação de crédito, linhas de capital de giro e aumento de limites.",
  },
  {
    Icone: BookCheck,
    titulo: "Balancetes e SPED no Lucro Presumido",
    texto:
      "Escrituração contábil completa, conciliação bancária, entrega tempestiva de todas as obrigações acessórias (SPED, EFD, DCTF) e relatórios contábeis para tomada de decisão.",
  },
  {
    Icone: Headphones,
    titulo: "Suporte dedicado com contadores de e-commerce",
    texto:
      "Canal direto via WhatsApp com especialistas que entendem a rotina dos marketplaces, dúvidas sobre NFe, alíquotas estaduais (DIFAL) e regras fiscais.",
  },
];

export default function Contabilidade() {
  const [mostrarFluxo, setMostrarFluxo] = useState(false);

  return (
    <section id="contabilidade" className="relative scroll-mt-16 overflow-hidden bg-[#0E1014] py-20 text-white sm:py-28">
      <div aria-hidden="true" className="czl-papel-escuro pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-[radial-gradient(circle,rgba(242,98,18,0.28),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-56 -left-40 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(242,98,18,0.14),transparent_65%)]"
      />

      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[48rem]">
          <Rotulo numero="05" texto="O que a contabilidade inclui" escuro />
          <Titulo escuro>Tudo o que a sua empresa precisa para operar 100% regularizada e sem surpresas.</Titulo>
          <Texto escuro>
            Cuidamos de toda a rotina fiscal, contábil e de departamento pessoal da sua empresa. Você se dedica
            a vender, precificar e escalar o seu e-commerce enquanto nosso time garante segurança tributária.
          </Texto>
        </div>

        {/* Grade de entregas de valor */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ENTREGAS.map(({ Icone, titulo, texto }, i) => (
            <div
              key={titulo}
              data-revelar=""
              style={atraso(60 + i * 70)}
              className="flex flex-col rounded-[22px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <span className="grid size-11 place-items-center rounded-[12px] bg-[#F26212]/15 text-[#FF9A5C]">
                <Icone className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[17px] font-bold tracking-[-0.025em] text-white">{titulo}</h3>
              <p className="mt-2 text-[14px] leading-[1.65] text-white/65">{texto}</p>
            </div>
          ))}
        </div>

        {/* Área secundária/expansível para as 10 e 14 etapas internas */}
        <div data-revelar="" className="mt-12 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <button
            type="button"
            onClick={() => setMostrarFluxo((v) => !v)}
            aria-expanded={mostrarFluxo}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[12px] bg-white/10 text-white">
                <ListChecks className="h-5 w-5 text-[#FF9A5C]" />
              </span>
              <div>
                <p className="text-[16px] font-bold text-white">
                  Prova de organização interna: conheça nossas etapas de apuração
                </p>
                <p className="text-[13px] text-white/60">
                  10 etapas no Simples Nacional e 14 no Lucro Presumido com responsáveis e prazos rigorosos no escritório.
                </p>
              </div>
            </div>
            <span className={`grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-white transition-transform duration-200 ${mostrarFluxo ? "rotate-180" : ""}`}>
              <ChevronDown className="h-4 w-4" />
            </span>
          </button>

          {mostrarFluxo && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="mb-4 text-[13.5px] text-white/70">
                Nosso time executa cada etapa em sequência para garantir que nenhum detalhe passe despercebido:
              </p>
              <FluxoApuracao />
            </div>
          )}
        </div>

        {/* Bloco de fechamento da seção */}
        <div data-revelar="" className="mt-12 flex flex-col items-start gap-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-[18px] font-bold tracking-[-0.025em] text-white">
              Quer saber como fica a contabilidade para a sua faixa de faturamento?
            </p>
            <p className="mt-1 text-[14.5px] text-white/65">
              Conte o seu regime tributário e onde vende. Enviamos uma proposta com escopo detalhado.
            </p>
          </div>
          <BotaoWhatsapp mensagem="contabilidade" className="w-full shrink-0 sm:w-auto">
            Quero uma proposta de contabilidade
          </BotaoWhatsapp>
        </div>
      </div>
    </section>
  );
}
