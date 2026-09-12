"use client";

/**
 * O card de filtros da fila, no formato do CyberDock.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS CAMADAS, E A DIVISÃO NÃO É ARBITRÁRIA
 *
 * BARRA (sempre à vista) — o que muda a pergunta do dia:
 *     PRAZO [Atrasados][Hoje][Amanhã][7 dias]   SITUAÇÃO ▾   CANAL ▾
 *                                        ... [Filtros avançados ▾]  [× Limpar]
 *
 * PAINEL (recolhido) — o que se usa quando alguém vem perguntar de um pedido:
 *     Período da Venda (faixa + atalhos)    Prazo para Despachar (faixa)
 *     Modalidade de Envio ▾  Conta ▾  SKU ▾  Categoria ▾
 *                                    [Limpar filtros]  [Aplicar filtros]
 *
 * A BARRA APLICA NA HORA. O PAINEL APLICA NO BOTÃO.
 *
 * É o comportamento do CyberDock e ele tem motivo: escolher "Hoje" é uma decisão
 * completa, então esperar um segundo clique seria trabalho a mais. Já preencher
 * uma faixa de datas são dois campos — recarregar a fila no primeiro deles
 * consulta o banco com um recorte que ninguém pediu (de 01/09 até... nada) e
 * mostra um resultado que vai mudar. Por isso os campos do painel escrevem num
 * RASCUNHO, e "Aplicar filtros" é que promove o rascunho a filtro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from "react";

import { BotaoPrimario, MultiSelecao } from "../comum/shell";
import { ENTRADA } from "../comum/formato";
import { LogoCanal } from "../comum/logos";
import { IconeBusca, IconeFechar, IconeFiltro, IconeSeta } from "../comum/icones";
import { metaModalidade } from "./modalidade";
import {
  CANAIS,
  CANAL_ROTULO,
  FILTROS_PADRAO,
  STATUS_VENDA,
  type Canal,
  type ContaExpedicao,
  type FiltrosExpedicao,
  type PrazoPreset,
  type StatusVenda,
} from "@/lib/expedicao";

/**
 * Os quatro atalhos de prazo da barra, na ordem do CyberDock.
 *
 * "Atrasados" leva `perigo` porque ele é o único que descreve um problema, e não
 * um recorte de tempo: aceso em vermelho, ele diz que a escolha atual é a fila
 * que já falhou.
 */
const ATALHOS_PRAZO: { chave: PrazoPreset; rotulo: string; perigo?: boolean }[] = [
  { chave: "atrasados", rotulo: "Atrasados", perigo: true },
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "amanha", rotulo: "Amanhã" },
  { chave: "proximos7", rotulo: "7 dias" },
];

/** Janelas de busca oferecidas. Ver o comentário no campo, no painel avançado. */
const JANELAS = [15, 30, 60, 90, 180, 365];

/** Atalhos de PERÍODO DA VENDA, dentro do painel avançado. */
const ATALHOS_VENDA = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "7dias", rotulo: "7 dias" },
  { chave: "30dias", rotulo: "30 dias" },
  { chave: "mes", rotulo: "Este mês" },
] as const;

type AtalhoVenda = (typeof ATALHOS_VENDA)[number]["chave"];

/** "2026-09-12" no fuso de São Paulo — o mesmo que os `<input type="date">` usam. */
function ymd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function maisDias(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** A faixa de datas de cada atalho de venda. */
export function faixaDaVenda(atalho: AtalhoVenda): { de: string; ate: string } {
  const hoje = new Date();
  switch (atalho) {
    case "hoje":
      return { de: ymd(hoje), ate: ymd(hoje) };
    case "7dias":
      return { de: ymd(maisDias(hoje, -6)), ate: ymd(hoje) };
    case "30dias":
      return { de: ymd(maisDias(hoje, -29)), ate: ymd(hoje) };
    case "mes":
      return {
        de: ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
        ate: ymd(hoje),
      };
  }
}

/* -------------------------------------------------------------------------- */
/*                          Peças visuais da barra                            */
/* -------------------------------------------------------------------------- */

const ROTULO_BARRA =
  "shrink-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]";

const SELECT_BARRA =
  "h-8 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2 text-[12.5px] font-semibold text-[var(--cz-texto)] outline-none transition-colors focus:border-[var(--cz-laranja)]";

function Atalho({
  ativo,
  perigo,
  onClick,
  children,
}: {
  ativo: boolean;
  perigo?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold leading-none transition-colors ${
        ativo
          ? perigo
            ? "border-[#dc2626] bg-[#dc2626] text-white"
            : "border-[var(--cz-laranja)] bg-[var(--cz-laranja)] text-white"
          : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)] hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-texto)]"
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 O card                                    */
/* -------------------------------------------------------------------------- */

export default function FiltrosSeparacao({
  filtros,
  rascunho,
  onMudarBarra,
  onMudarRascunho,
  onAplicarRascunho,
  onLimpar,
  aberto,
  onAlternarAberto,
  canalFixo,
  contas,
  modalidades,
  opcoesSku,
  opcoesHierarquia1,
  carregando,
}: {
  /** O que está APLICADO e alimenta a consulta. */
  filtros: FiltrosExpedicao;
  /** O que está digitado no painel avançado, ainda não aplicado. */
  rascunho: FiltrosExpedicao;
  onMudarBarra: (parcial: Partial<FiltrosExpedicao>) => void;
  onMudarRascunho: (parcial: Partial<FiltrosExpedicao>) => void;
  onAplicarRascunho: () => void;
  onLimpar: () => void;
  aberto: boolean;
  onAlternarAberto: () => void;
  canalFixo?: Canal;
  contas: ContaExpedicao[];
  modalidades: string[];
  opcoesSku: string[];
  opcoesHierarquia1: string[];
  carregando: boolean;
}) {
  /**
   * Quantos filtros AVANÇADOS estão ligados, contando o APLICADO e não o rascunho.
   *
   * O contador diz o que está cortando a lista agora. Contar o rascunho faria o
   * número subir enquanto a pessoa digita, prometendo um recorte que ainda não
   * aconteceu.
   */
  const avancadosAtivos = useMemo(() => {
    let n = 0;
    if (filtros.vendaDe) n++;
    if (filtros.vendaAte) n++;
    if (filtros.prazoDe || filtros.prazoAte) n++;
    if (filtros.modalidades.length) n++;
    if (filtros.contas.length) n++;
    if (filtros.skus.length) n++;
    if (filtros.hierarquias1.length) n++;
    return n;
  }, [filtros]);

  const temAlgumFiltro =
    avancadosAtivos > 0 ||
    (!canalFixo && filtros.canais.length > 0) ||
    filtros.statusVenda !== FILTROS_PADRAO.statusVenda ||
    filtros.prazoPreset !== FILTROS_PADRAO.prazoPreset ||
    filtros.busca.trim() !== "" ||
    filtros.urgencias.length > 0;

  /**
   * Qual atalho de venda corresponde às datas do rascunho.
   *
   * Derivado das datas em vez de guardado num estado próprio: com um estado
   * separado, digitar uma data à mão deixaria o atalho aceso mentindo sobre o
   * recorte. Aqui, se as datas não batem com nenhum atalho, nenhum acende.
   */
  const atalhoVendaAceso = useMemo<AtalhoVenda | null>(() => {
    if (!rascunho.vendaDe || !rascunho.vendaAte) return null;
    for (const { chave } of ATALHOS_VENDA) {
      const faixa = faixaDaVenda(chave);
      if (faixa.de === rascunho.vendaDe && faixa.ate === rascunho.vendaAte) return chave;
    }
    return null;
  }, [rascunho.vendaDe, rascunho.vendaAte]);

  const contagemModalidade = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contas) m.set(c.conta, c.pacotes);
    return m;
  }, [contas]);

  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
      {/* ─────────────────────────── BARRA ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={ROTULO_BARRA}>Prazo</span>
          <div className="flex flex-wrap gap-1.5">
            {ATALHOS_PRAZO.map((a) => (
              <Atalho
                key={a.chave}
                ativo={filtros.prazoPreset === a.chave}
                perigo={a.perigo}
                onClick={() => onMudarBarra({ prazoPreset: a.chave })}
              >
                {a.rotulo}
              </Atalho>
            ))}
            {/* "Todos" não existe na barra do CyberDock, mas existe aqui porque o
                CONTAZOOM abre em "a despachar hoje" — sem uma saída para a fila
                inteira, quem tem um pedido antigo preso não teria como alcançá-lo
                sem abrir o painel avançado. */}
            <Atalho
              ativo={filtros.prazoPreset === "todas"}
              onClick={() => onMudarBarra({ prazoPreset: "todas" })}
            >
              Todos
            </Atalho>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={ROTULO_BARRA}>Situação</span>
          <select
            value={filtros.statusVenda}
            onChange={(e) => onMudarBarra({ statusVenda: e.target.value as StatusVenda })}
            aria-label="Situação da venda"
            className={SELECT_BARRA}
          >
            {STATUS_VENDA.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>

        {/* CANAL some na tela de um canal só: um select que só pode escolher
            "Shopee" numa tela chamada "Expedição Shopee" é ruído com aparência de
            opção. */}
        {!canalFixo && (
          <div className="flex items-center gap-2">
            <span className={ROTULO_BARRA}>Canal</span>
            <select
              value={filtros.canais.length === 1 ? filtros.canais[0] : ""}
              onChange={(e) =>
                onMudarBarra({
                  canais: e.target.value ? [e.target.value as Canal] : [],
                })
              }
              aria-label="Canal de venda"
              className={SELECT_BARRA}
            >
              <option value="">Todos</option>
              {CANAIS.map((c) => {
                const quantos = contas
                  .filter((x) => x.canal === c)
                  .reduce((s, x) => s + x.pacotes, 0);
                return (
                  <option key={c} value={c}>
                    {CANAL_ROTULO[c]} ({quantos})
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* A busca não existe na barra do CyberDock, e existe aqui: a fila do
            CONTAZOOM é consultada por pedido, etiqueta, SKU, produto e comprador, e
            é o caminho de "o cliente ligou perguntando do pedido X". */}
        <div className="flex h-8 min-w-[13rem] flex-1 items-center gap-1.5 rounded-lg border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2 transition-colors focus-within:border-[var(--cz-laranja)]">
          <IconeBusca className="h-3.5 w-3.5 shrink-0 text-[var(--cz-texto-fraco)]" />
          <input
            type="text"
            value={filtros.busca}
            onChange={(e) => onMudarBarra({ busca: e.target.value })}
            placeholder="Pedido, etiqueta, SKU, produto ou comprador"
            aria-label="Buscar na fila"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--cz-texto)] outline-none placeholder:text-[var(--cz-texto-fraco)]"
          />
        </div>

        <button
          type="button"
          onClick={onAlternarAberto}
          aria-expanded={aberto}
          className={`ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-bold transition-colors ${
            avancadosAtivos > 0
              ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
              : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)] hover:border-[var(--cz-laranja-borda)] hover:bg-[#fffaf6] hover:text-[var(--cz-laranja-forte)]"
          }`}
        >
          <IconeFiltro className="h-3.5 w-3.5" />
          Filtros avançados
          {avancadosAtivos > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--cz-laranja)] px-1.5 text-[10.5px] font-bold tabular-nums text-white">
              {avancadosAtivos}
            </span>
          )}
          <IconeSeta
            className={`h-3.5 w-3.5 transition-transform ${
              aberto ? "-rotate-90" : "rotate-90"
            }`}
          />
        </button>

        {temAlgumFiltro && (
          <button
            type="button"
            onClick={onLimpar}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 px-2 text-[12.5px] font-semibold text-[var(--cz-texto-suave)] transition-colors hover:text-[var(--cz-texto)]"
          >
            <IconeFechar className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>

      {/* ────────────────────── PAINEL AVANÇADO ────────────────────── */}
      {aberto && (
        <div className="border-t border-[#eef2f7] bg-[#fffdfb] px-3.5 py-3.5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-[var(--cz-texto-suave)]">
                Período da Venda
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={rascunho.vendaDe ?? ""}
                  onChange={(e) => onMudarRascunho({ vendaDe: e.target.value || null })}
                  aria-label="Venda de"
                  className={ENTRADA}
                />
                <span className="shrink-0 text-[12.5px] text-[var(--cz-texto-suave)]">
                  até
                </span>
                <input
                  type="date"
                  value={rascunho.vendaAte ?? ""}
                  onChange={(e) => onMudarRascunho({ vendaAte: e.target.value || null })}
                  aria-label="Venda até"
                  className={ENTRADA}
                />
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {ATALHOS_VENDA.map((a) => (
                  <Atalho
                    key={a.chave}
                    ativo={atalhoVendaAceso === a.chave}
                    onClick={() => {
                      const faixa = faixaDaVenda(a.chave);
                      onMudarRascunho({ vendaDe: faixa.de, vendaAte: faixa.ate });
                    }}
                  >
                    {a.rotulo}
                  </Atalho>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-[var(--cz-texto-suave)]">
                Prazo para Despachar
              </span>
              <div className="flex items-center gap-1.5">
                {/* Digitar aqui muda o recorte para "personalizado", senão o atalho
                    aceso na barra contradiria as datas escritas no painel. */}
                <input
                  type="date"
                  value={rascunho.prazoDe ?? ""}
                  onChange={(e) =>
                    onMudarRascunho({
                      prazoPreset: "personalizado",
                      prazoDe: e.target.value || null,
                    })
                  }
                  aria-label="Prazo de"
                  className={ENTRADA}
                />
                <span className="shrink-0 text-[12.5px] text-[var(--cz-texto-suave)]">
                  até
                </span>
                <input
                  type="date"
                  value={rascunho.prazoAte ?? ""}
                  onChange={(e) =>
                    onMudarRascunho({
                      prazoPreset: "personalizado",
                      prazoAte: e.target.value || null,
                    })
                  }
                  aria-label="Prazo até"
                  className={ENTRADA}
                />
              </div>
              <p className="text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                Preencher aqui substitui o atalho de prazo escolhido acima.
              </p>

              {/* A JANELA. Não existe no CyberDock e fica aqui porque protege a
                  consulta: ela limita a busca pela data da venda para o banco não
                  varrer a base inteira (ver `fragmentoJanela` em
                  `expedicao-data.ts`). Aparece na tela, e não escondida no servidor,
                  porque é um filtro que ESCONDE trabalho — quem tem um pedido antigo
                  preso precisa poder alargá-la e enxergá-lo. */}
              <label className="mt-1 flex items-center gap-2 text-[12.5px] text-[var(--cz-texto-suave)]">
                <span className="shrink-0">Buscar vendas dos últimos</span>
                <select
                  value={rascunho.janelaDias}
                  onChange={(e) => onMudarRascunho({ janelaDias: Number(e.target.value) })}
                  aria-label="Janela de busca, em dias"
                  className={SELECT_BARRA}
                >
                  {JANELAS.map((d) => (
                    <option key={d} value={d}>
                      {d} dias
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MultiSelecao
              rotulo="Modalidade de Envio"
              placeholder="Todas"
              vazio="Nenhuma modalidade na fila"
              opcoes={modalidades.map((m) => ({
                valor: m,
                rotulo: metaModalidade(m).rotulo,
                contagem: contagemModalidade.get(m),
              }))}
              selecionados={rascunho.modalidades}
              onMudar={(v) => onMudarRascunho({ modalidades: v })}
            />

            <MultiSelecao
              rotulo="Conta"
              placeholder="Todas as contas"
              vazio="Nenhuma conta com pacote na fila"
              opcoes={contas.map((c) => ({
                valor: c.accountId,
                // O rótulo traz o canal porque a mesma loja costuma usar o mesmo
                // nome no Mercado Livre e na Shopee.
                rotulo: `${c.conta} · ${CANAL_ROTULO[c.canal]}`,
                contagem: c.pacotes,
                icone: <LogoCanal canal={c.canal} />,
              }))}
              selecionados={rascunho.contas}
              onMudar={(v) => onMudarRascunho({ contas: v })}
            />

            {/* O slot do "Usuário" do CyberDock. Lá ele filtra por quem separou; o
                CONTAZOOM não registra isso (a Expedição é leitura da fila, não
                apontamento de produção). Virou SKU, que é o filtro que a separação
                realmente usa: deixa na tela só as vendas de um código. */}
            <MultiSelecao
              rotulo="SKU"
              placeholder="Todos os SKUs"
              buscaPlaceholder="Digite o código do SKU…"
              vazio="Nenhum SKU na fila"
              opcoes={opcoesSku.map((s) => ({ valor: s, rotulo: s }))}
              selecionados={rascunho.skus}
              onMudar={(v) => onMudarRascunho({ skus: v })}
            />

            <MultiSelecao
              rotulo="Categoria"
              placeholder="Todas"
              vazio="Nenhuma categoria cadastrada"
              opcoes={opcoesHierarquia1.map((h) => ({ valor: h, rotulo: h }))}
              selecionados={rascunho.hierarquias1}
              onMudar={(v) => onMudarRascunho({ hierarquias1: v })}
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 border-t border-[var(--cz-hairline)] pt-3.5">
            <button
              type="button"
              onClick={onLimpar}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-[13px] font-semibold text-[var(--cz-texto-suave)] transition-colors hover:text-[var(--cz-texto)]"
            >
              <IconeFechar className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
            <BotaoPrimario onClick={onAplicarRascunho} desabilitado={carregando}>
              <IconeBusca className="h-4 w-4" />
              Aplicar filtros
            </BotaoPrimario>
          </div>
        </div>
      )}
    </div>
  );
}
