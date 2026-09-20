"use client";

/**
 * Grade dos 12 meses e emissão da declaração.
 *
 * Separada de FaturamentoXmlView porque aqui a unidade de trabalho é o PERÍODO,
 * não uma competência. Misturar os dois estados no mesmo componente foi a origem
 * dos riscos de salvar rascunho do mês anterior no mês novo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessao } from "@/hooks/useSessao";
import {
  Aviso,
  Carregando,
  CartaoKpi,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import { Botao, Entrada } from "@/app/components/views/ui/tarefas/Campos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { Selo } from "@/app/components/views/comum/shell";
import {
  apiGet,
  apiPost,
  mensagemDeErro,
  query,
} from "@/app/components/views/ui/tarefas/api";

type LinhaPeriodo = {
  ano: number;
  mes: number;
  chave: string;
  label: string;
  idMensal: string | null;
  origem: string | null;
  valor: string | null;
  valorApurado: string | null;
  documentos: number;
  observacao: string | null;
  congeladoEm: string | null;
  definidoPorNome: string | null;
  atualizadoEm: string | null;
  pronta: boolean;
};

type Periodo = {
  empresa: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string | null;
    regime: string;
    inicioAtividade: string | null;
  };
  inicio: { chave: string; label: string };
  fim: { chave: string; label: string };
  meses: LinhaPeriodo[];
  completos: number;
  faltantes: string[];
  total: string;
  mediaMensal: string;
};

type Declaracao = {
  id: string;
  protocolo: string;
  inicio: string;
  fim: string;
  valorTotal: string;
  situacao: string;
  createdAt: string;
  emitidaPorNome: string;
};

type Props = {
  empresaId: string;
  competenciaReferencia: string;
  onAbrirMes: (competencia: string) => void;
};

const real = (valor: string | number | null) =>
  Number(valor ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const ORIGEM_LABEL: Record<string, string> = {
  XML: "XML",
  MANUAL: "Manual",
  MISTO: "Misto",
};

function competenciaAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export default function DeclaracaoFaturamentoPanel({
  empresaId,
  competenciaReferencia,
  onAbrirMes,
}: Props) {
  const router = useRouter();
  const { permissoes } = useSessao();
  const podeEmitir = permissoes.alterarRegime;
  const [fim, setFim] = useState(competenciaReferencia || competenciaAtual());
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [declaracoes, setDeclaracoes] = useState<Declaracao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState("");
  const [finalidade, setFinalidade] = useState(
    "Comprovação de faturamento perante instituição financeira",
  );
  const idempotencia = useRef("");

  useEffect(() => {
    if (competenciaReferencia) setFim(competenciaReferencia);
  }, [competenciaReferencia, empresaId]);

  useEffect(() => {
    // Alterar contexto significa outra emissão; a chave anterior não pode ser
    // reaproveitada para uma janela diferente.
    idempotencia.current = "";
  }, [empresaId, fim, finalidade]);

  useEffect(() => {
    if (!empresaId || !fim) return;
    const controlador = new AbortController();
    let vivo = true;
    setCarregando(true);
    setErro("");
    setPeriodo(null);

    Promise.all([
      apiGet<Periodo>(
        `/api/fiscal/faturamento/periodo${query({ empresaId, fim })}`,
        controlador.signal,
      ),
      apiGet<{ declaracoes: Declaracao[] }>(
        `/api/fiscal/declaracao${query({ empresaId })}`,
        controlador.signal,
      ),
    ])
      .then(([periodoCarregado, lista]) => {
        if (!vivo) return;
        setPeriodo(periodoCarregado);
        setDeclaracoes(lista.declaracoes ?? []);
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
  }, [empresaId, fim]);

  const divergencias = useMemo(
    () =>
      periodo?.meses.filter(
        (item) =>
          item.pronta &&
          item.valorApurado !== null &&
          Math.abs(Number(item.valor) - Number(item.valorApurado)) >= 0.01,
      ).length ?? 0,
    [periodo],
  );

  const emitir = async () => {
    if (!podeEmitir) {
      setErro("Somente administrador ou contabilidade pode emitir a declaração.");
      return;
    }
    if (!periodo || periodo.faltantes.length > 0) return;
    setEmitindo(true);
    setErro("");
    if (!idempotencia.current) idempotencia.current = crypto.randomUUID();

    try {
      const resposta = await apiPost<{ declaracao: Declaracao }>(
        "/api/fiscal/declaracao",
        {
          empresaId,
          fim,
          finalidade: finalidade.trim() || null,
          idempotencyKey: idempotencia.current,
        },
      );
      // A página de documento lê o snapshot emitido, nunca os valores vivos.
      router.push(`/admin/tarefas/faturamento/declaracao/${resposta.declaracao.id}`);
    } catch (falha) {
      const mensagem = mensagemDeErro(falha);
      if (mensagem) setErro(mensagem);
      // Mantém a mesma chave: se o servidor concluiu mas a resposta se perdeu, o
      // retry devolve a emissão existente em vez de criar outra.
    } finally {
      setEmitindo(false);
    }
  };

  if (carregando && !periodo) {
    return <Carregando texto="Montando os 12 meses" variante="tabela" />;
  }

  return (
    <div className="min-w-0 space-y-4">
      {erro && <Aviso mensagem={erro} onFechar={() => setErro("")} />}

      <Painel
        titulo="Declaração de faturamento — 12 meses"
        descricao="O mês escolhido é o último da janela. Os onze anteriores entram automaticamente."
      >
        <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[12rem_minmax(0,1fr)_auto] lg:items-end">
          <Entrada
            rotulo="Mês final"
            type="month"
            value={fim}
            onChange={(event) => setFim(event.target.value)}
          />
          <Entrada
            rotulo="Finalidade"
            value={finalidade}
            maxLength={300}
            onChange={(event) => setFinalidade(event.target.value)}
            placeholder="Ex.: financiamento no Banco do Brasil"
          />
          <Botao
            icone="FileText"
            carregando={emitindo}
            disabled={!podeEmitir || !periodo || periodo.faltantes.length > 0}
            title={
              !podeEmitir
                ? "Somente administrador ou contabilidade pode emitir"
                : periodo?.faltantes.length
                ? `Preencha ${periodo.faltantes.length} mês(es) antes de emitir`
                : "Emitir, congelar os 12 valores e abrir o documento"
            }
            onClick={() => void emitir()}
          >
            Emitir declaração
          </Botao>
        </div>
      </Painel>

      {periodo && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoKpi
              titulo="Faturamento no período"
              valor={real(periodo.total)}
              icone="Landmark"
              tom="laranja"
              detalhe={`${periodo.inicio.label} a ${periodo.fim.label}`}
            />
            <CartaoKpi
              titulo="Média mensal"
              valor={real(periodo.mediaMensal)}
              icone="TrendingUp"
              tom="cinza"
              detalhe="total ÷ 12"
            />
            <CartaoKpi
              titulo="Meses prontos"
              valor={`${periodo.completos}/12`}
              icone="CheckCircle2"
              tom={periodo.completos === 12 ? "verde" : "ambar"}
              detalhe={
                periodo.faltantes.length
                  ? `${periodo.faltantes.length} precisam ser preenchidos`
                  : "janela completa"
              }
            />
            <CartaoKpi
              titulo="Divergências XML/manual"
              valor={divergencias}
              icone="AlertTriangle"
              tom={divergencias > 0 ? "vermelho" : "cinza"}
              detalhe="valor que vale × apurado"
            />
          </div>

          {periodo.faltantes.length > 0 && (
            <Aviso
              tom="atencao"
              mensagem={`Faltam ${periodo.faltantes.length} competência(s). Abra cada mês e informe o valor — inclusive R$ 0,00 quando a empresa realmente não faturou.`}
            />
          )}

          <Painel
            titulo="Composição da declaração"
            descricao="Ausente é diferente de zero confirmado. Só os 12 meses preenchidos permitem emitir."
          >
            <div className="cz-rolagem min-w-0 overflow-x-auto">
              <table className="w-full min-w-[54rem] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                    <th className="px-4 py-2.5">Competência</th>
                    <th className="px-4 py-2.5">Origem</th>
                    <th className="px-4 py-2.5 text-right">Apurado XML</th>
                    <th className="px-4 py-2.5 text-right">Valor que vale</th>
                    <th className="px-4 py-2.5 text-right">Divergência</th>
                    <th className="px-4 py-2.5">Situação</th>
                    <th className="px-4 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cz-hairline)]">
                  {periodo.meses.map((item) => {
                    const diferenca =
                      item.valor !== null && item.valorApurado !== null
                        ? Number(item.valor) - Number(item.valorApurado)
                        : null;
                    return (
                      <tr key={item.chave} className="hover:bg-[#FCFCFD]">
                        <td className="px-4 py-2.5">
                          <span className="font-bold text-[var(--cz-texto)]">{item.label}</span>
                          <span className="cz-num mt-0.5 block text-[11px] text-[var(--cz-texto-fraco)]">
                            {item.documentos} documento(s)
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {item.origem ? (
                            <Selo tom={item.origem === "XML" ? "bom" : "info"}>
                              {ORIGEM_LABEL[item.origem] ?? item.origem}
                            </Selo>
                          ) : (
                            <span className="text-[var(--cz-texto-fraco)]">—</span>
                          )}
                        </td>
                        <td className="cz-num px-4 py-2.5 text-right text-[var(--cz-texto-suave)]">
                          {item.valorApurado === null ? "—" : real(item.valorApurado)}
                        </td>
                        <td className="cz-num px-4 py-2.5 text-right font-bold text-[var(--cz-texto)]">
                          {item.valor === null ? "—" : real(item.valor)}
                        </td>
                        <td className={`cz-num px-4 py-2.5 text-right ${
                          diferenca !== null && Math.abs(diferenca) >= 0.01
                            ? "font-bold text-amber-700"
                            : "text-[var(--cz-texto-fraco)]"
                        }`}>
                          {diferenca === null ? "—" : real(diferenca)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Selo tom={!item.pronta ? "critico" : item.congeladoEm ? "alerta" : "bom"}>
                            {!item.pronta ? "Falta preencher" : item.congeladoEm ? "Congelado" : "Pronto"}
                          </Selo>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Botao
                            variante="fantasma"
                            tamanho="sm"
                            icone={item.pronta ? "Pencil" : "Plus"}
                            onClick={() => onAbrirMes(item.chave)}
                          >
                            {item.pronta ? "Revisar" : "Preencher"}
                          </Botao>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] font-bold">
                    <td colSpan={3} className="px-4 py-3">Total dos 12 meses</td>
                    <td className="cz-num px-4 py-3 text-right text-[15px]">{real(periodo.total)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Painel>
        </>
      )}

      <Painel titulo="Declarações emitidas" descricao="Correção gera novo protocolo; o documento anterior fica como substituído.">
        {declaracoes.length === 0 ? (
          <div className="p-4">
            <Vazio
              icone="FileText"
              titulo="Nenhuma declaração emitida"
              descricao="Complete os 12 meses acima e emita a primeira."
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--cz-hairline)]">
            {declaracoes.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]">
                  <Icone nome="FileText" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="cz-num font-bold text-[var(--cz-texto)]">{item.protocolo}</p>
                  <p className="text-[11.5px] text-[var(--cz-texto-suave)]">
                    {item.inicio} a {item.fim} · {real(item.valorTotal)} · {dataHora(item.createdAt)}
                  </p>
                </div>
                <Selo tom={item.situacao === "VIGENTE" ? "bom" : "neutro"}>
                  {item.situacao === "VIGENTE" ? "Vigente" : "Substituída"}
                </Selo>
                <Botao
                  variante="secundario"
                  tamanho="sm"
                  icone="ExternalLink"
                  onClick={() => router.push(`/admin/tarefas/faturamento/declaracao/${item.id}`)}
                >
                  Abrir
                </Botao>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
