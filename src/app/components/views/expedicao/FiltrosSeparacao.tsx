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

import { CampoDaFolha, GrupoDePilulas } from "@/components/ui/FiltrosSheet";
import { useCelular } from "@/hooks/useMediaQuery";
import { BotaoPrimario, CaixaBusca, MultiSelecao } from "../comum/shell";
import { BarraFiltros, ChipsFiltro, FiltroRapido, type ChipFiltro } from "../comum/filtros";
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

  const celular = useCelular();

  // Celular: outro desenho, não a mesma barra apertada. A barra de desktop tem doze
  // controles e, em 390px, quebrava em cinco linhas antes de aparecer o primeiro
  // pacote. Aqui ficam à vista só a busca, o prazo e o que está ativo; o resto vai
  // para UMA folha. Ela aplica cada escolha NA HORA (ver `FiltrosCelular`), então
  // `rascunho`, "Aplicar filtros" e o painel avançado não existem neste caminho.
  if (celular) {
    return (
      <FiltrosCelular
        filtros={filtros}
        onMudarBarra={onMudarBarra}
        onLimpar={onLimpar}
        canalFixo={canalFixo}
        contas={contas}
        modalidades={modalidades}
        opcoesSku={opcoesSku}
        opcoesHierarquia1={opcoesHierarquia1}
      />
    );
  }

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
            {/* "Todos" mantém uma saída direta para a fila inteira. Com o padrão
                em "Hoje", ele permite alcançar pedidos futuros ou antigos sem
                abrir o painel avançado. */}
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
          {/* SEM `type`: um <input> sem o atributo é texto do mesmo jeito, mas escapa dos
              seletores `input[type="text"]` do `globals.css` (altura de 44px, borda,
              padding e anel de foco), que desenhavam uma segunda caixa DENTRO desta. */}
          <input
            value={filtros.busca}
            onChange={(e) => onMudarBarra({ busca: e.target.value })}
            placeholder="Pedido, etiqueta, SKU, produto ou comprador"
            aria-label="Buscar na fila"
            className="h-full min-w-0 flex-1 bg-transparent p-0 text-[12.5px] text-[var(--cz-texto)] outline-none placeholder:text-[var(--cz-texto-fraco)]"
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

/* -------------------------------------------------------------------------- */
/*            Celular: busca + prazo + UM botão "Filtros" + chips             */
/* -------------------------------------------------------------------------- */

/** "2026-09-12" -> "12/09". Só para os chips, onde cada caractere conta. */
function diaMes(ymd: string | null): string {
  if (!ymd) return "…";
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

/** Os atalhos da barra mais "Todos", que no desktop é um `Atalho` à parte. */
const ATALHOS_PRAZO_CEL: { chave: PrazoPreset; rotulo: string; perigo?: boolean }[] = [
  ...ATALHOS_PRAZO,
  { chave: "todas", rotulo: "Todos" },
];

/**
 * O que fica à vista no celular, de cima para baixo:
 *
 *   [ 🔍 busca ............ ] [ Filtros (n) ]
 *   Prazo  [Atrasados] [Hoje] [Amanhã] [7 dias] [Todos]   ← rola de lado
 *   [Conta × ] [SKU × ] [Envio × ] ... [Limpar tudo]      ← rola de lado
 *
 * O PRAZO fica fora da folha porque é o que se troca a toda hora ("e os
 * atrasados?"), e os CHIPS são a única forma de saber por que a fila veio curta
 * com os filtros escondidos na folha.
 *
 * Dentro da folha entram, juntos, os filtros da barra e os do painel avançado do
 * desktop. Cada escolha vale na hora (`onMudarBarra` mantém o rascunho em
 * sincronia): a folha cobre a fila, então não há resultado parcial à vista, e
 * exigir um "Aplicar" extra depois do "Ver resultados" faria a pessoa fechar a
 * folha achando que já filtrou.
 */
function FiltrosCelular({
  filtros,
  onMudarBarra,
  onLimpar,
  canalFixo,
  contas,
  modalidades,
  opcoesSku,
  opcoesHierarquia1,
}: {
  filtros: FiltrosExpedicao;
  onMudarBarra: (parcial: Partial<FiltrosExpedicao>) => void;
  onLimpar: () => void;
  canalFixo?: Canal;
  contas: ContaExpedicao[];
  modalidades: string[];
  opcoesSku: string[];
  opcoesHierarquia1: string[];
}) {
  const alternar = (lista: string[], valor: string) =>
    lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];

  const personalizado = filtros.prazoPreset === "personalizado";
  const canalEscolhido = canalFixo ? [] : filtros.canais;
  const temPrazoPersonalizado = personalizado && Boolean(filtros.prazoDe || filtros.prazoAte);
  const temVenda = Boolean(filtros.vendaDe || filtros.vendaAte);
  const janelaAlterada = filtros.janelaDias !== FILTROS_PADRAO.janelaDias;

  const atalhoVendaAceso =
    ATALHOS_VENDA.find(({ chave }) => {
      const faixa = faixaDaVenda(chave);
      return faixa.de === filtros.vendaDe && faixa.ate === filtros.vendaAte;
    })?.chave ?? null;

  /** Prazo personalizado: as duas pontas vazias voltam ao atalho padrão. */
  function mudarPrazo(parcial: { prazoDe?: string | null; prazoAte?: string | null }) {
    const prazoDe = parcial.prazoDe !== undefined ? parcial.prazoDe : filtros.prazoDe;
    const prazoAte = parcial.prazoAte !== undefined ? parcial.prazoAte : filtros.prazoAte;
    onMudarBarra({
      prazoPreset: prazoDe || prazoAte ? "personalizado" : FILTROS_PADRAO.prazoPreset,
      prazoDe,
      prazoAte,
    });
  }

  // Um grupo = um filtro ligado. É o número do botão, e é o que o "Limpar" da folha zera.
  const ativos = [
    filtros.statusVenda !== FILTROS_PADRAO.statusVenda,
    canalEscolhido.length > 0,
    temPrazoPersonalizado,
    temVenda,
    janelaAlterada,
    filtros.modalidades.length > 0,
    filtros.contas.length > 0,
    filtros.skus.length > 0,
    filtros.hierarquias1.length > 0,
  ].filter(Boolean).length;

  function limparDaFolha() {
    onMudarBarra({
      statusVenda: FILTROS_PADRAO.statusVenda,
      canais: canalFixo ? [canalFixo] : [],
      // Volta ao atalho padrão só se o prazo estava personalizado; "Atrasados" ou
      // "Amanhã" escolhidos na faixa de fora não são da folha e ficam como estão.
      prazoPreset: personalizado ? FILTROS_PADRAO.prazoPreset : filtros.prazoPreset,
      prazoDe: null,
      prazoAte: null,
      vendaDe: null,
      vendaAte: null,
      janelaDias: FILTROS_PADRAO.janelaDias,
      modalidades: [],
      contas: [],
      skus: [],
      hierarquias1: [],
    });
  }

  const chips: ChipFiltro[] = [];
  if (filtros.statusVenda !== FILTROS_PADRAO.statusVenda) {
    chips.push({
      chave: "status",
      grupo: "Situação",
      rotulo: STATUS_VENDA.find((s) => s.chave === filtros.statusVenda)?.rotulo ?? filtros.statusVenda,
      remover: () => onMudarBarra({ statusVenda: FILTROS_PADRAO.statusVenda }),
    });
  }
  for (const c of canalEscolhido) {
    chips.push({
      chave: `canal-${c}`,
      grupo: "Canal",
      rotulo: CANAL_ROTULO[c],
      icone: <LogoCanal canal={c} />,
      remover: () => onMudarBarra({ canais: filtros.canais.filter((x) => x !== c) }),
    });
  }
  if (temPrazoPersonalizado) {
    chips.push({
      chave: "prazo",
      grupo: "Prazo",
      rotulo: `${diaMes(filtros.prazoDe)} → ${diaMes(filtros.prazoAte)}`,
      remover: () => mudarPrazo({ prazoDe: null, prazoAte: null }),
    });
  }
  if (temVenda) {
    chips.push({
      chave: "venda",
      grupo: "Venda",
      rotulo: `${diaMes(filtros.vendaDe)} → ${diaMes(filtros.vendaAte)}`,
      remover: () => onMudarBarra({ vendaDe: null, vendaAte: null }),
    });
  }
  if (janelaAlterada) {
    chips.push({
      chave: "janela",
      grupo: "Vendas dos últimos",
      rotulo: `${filtros.janelaDias} dias`,
      remover: () => onMudarBarra({ janelaDias: FILTROS_PADRAO.janelaDias }),
    });
  }
  for (const m of filtros.modalidades) {
    chips.push({
      chave: `mod-${m}`,
      grupo: "Envio",
      rotulo: metaModalidade(m).rotulo,
      remover: () => onMudarBarra({ modalidades: filtros.modalidades.filter((x) => x !== m) }),
    });
  }
  for (const id of filtros.contas) {
    const conta = contas.find((c) => c.accountId === id);
    chips.push({
      chave: `conta-${id}`,
      grupo: "Conta",
      rotulo: conta?.conta ?? id,
      icone: conta ? <LogoCanal canal={conta.canal} /> : undefined,
      remover: () => onMudarBarra({ contas: filtros.contas.filter((x) => x !== id) }),
    });
  }
  for (const s of filtros.skus) {
    chips.push({
      chave: `sku-${s}`,
      grupo: "SKU",
      rotulo: s,
      remover: () => onMudarBarra({ skus: filtros.skus.filter((x) => x !== s) }),
    });
  }
  for (const h of filtros.hierarquias1) {
    chips.push({
      chave: `cat-${h}`,
      grupo: "Categoria",
      rotulo: h,
      remover: () => onMudarBarra({ hierarquias1: filtros.hierarquias1.filter((x) => x !== h) }),
    });
  }

  return (
    <div className="mt-4">
      <BarraFiltros
        busca={
          <CaixaBusca
            valor={filtros.busca}
            onMudar={(v) => onMudarBarra({ busca: v })}
            placeholder="Pedido, SKU, produto…"
            rotuloAcessivel="Buscar na fila"
          />
        }
        ativos={ativos}
        onLimpar={limparDaFolha}
      >
        <CampoDaFolha rotulo="Situação da venda">
          <GrupoDePilulas
            rotulo="Situação da venda"
            opcoes={STATUS_VENDA.map((s) => ({ id: s.chave, rotulo: s.rotulo }))}
            estaAtiva={(id) => filtros.statusVenda === id}
            onEscolher={(id) => onMudarBarra({ statusVenda: id as StatusVenda })}
          />
        </CampoDaFolha>

        {/* Canal some na tela de um canal só, como no desktop. */}
        {!canalFixo && (
          <CampoDaFolha rotulo="Canal">
            <GrupoDePilulas
              rotulo="Canal"
              opcoes={[
                { id: "", rotulo: "Todos" },
                ...CANAIS.map((c) => ({
                  id: c,
                  rotulo: `${CANAL_ROTULO[c]} (${contas
                    .filter((x) => x.canal === c)
                    .reduce((s, x) => s + x.pacotes, 0)})`,
                })),
              ]}
              estaAtiva={(id) => (filtros.canais.length === 1 ? filtros.canais[0] : "") === id}
              onEscolher={(id) => onMudarBarra({ canais: id ? [id as Canal] : [] })}
            />
          </CampoDaFolha>
        )}

        <p className="-mb-2 border-t border-[var(--cz-hairline)] pt-5 text-[14px] font-extrabold text-[var(--cz-texto)]">
          Filtros avançados
        </p>

        <CampoDaFolha rotulo="Período da venda">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px] text-[var(--cz-texto-suave)]">
              De
              <input
                type="date"
                value={filtros.vendaDe ?? ""}
                onChange={(e) => onMudarBarra({ vendaDe: e.target.value || null })}
                aria-label="Venda de"
                className={`${ENTRADA} mt-1`}
              />
            </label>
            <label className="block text-[13px] text-[var(--cz-texto-suave)]">
              Até
              <input
                type="date"
                value={filtros.vendaAte ?? ""}
                onChange={(e) => onMudarBarra({ vendaAte: e.target.value || null })}
                aria-label="Venda até"
                className={`${ENTRADA} mt-1`}
              />
            </label>
          </div>
          <div className="mt-3">
            <GrupoDePilulas
              rotulo="Atalhos do período da venda"
              opcoes={ATALHOS_VENDA.map((a) => ({ id: a.chave, rotulo: a.rotulo }))}
              estaAtiva={(id) => atalhoVendaAceso === id}
              onEscolher={(id) => {
                // Tocar no atalho já aceso desliga o período.
                if (atalhoVendaAceso === id) return onMudarBarra({ vendaDe: null, vendaAte: null });
                const faixa = faixaDaVenda(id as AtalhoVenda);
                onMudarBarra({ vendaDe: faixa.de, vendaAte: faixa.ate });
              }}
            />
          </div>
        </CampoDaFolha>

        <CampoDaFolha rotulo="Prazo para despachar">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px] text-[var(--cz-texto-suave)]">
              De
              <input
                type="date"
                // As datas só valem com o prazo personalizado; com um atalho da faixa
                // de fora ligado, elas não estão em uso e não devem aparecer preenchidas.
                value={personalizado ? (filtros.prazoDe ?? "") : ""}
                onChange={(e) => mudarPrazo({ prazoDe: e.target.value || null })}
                aria-label="Prazo de"
                className={`${ENTRADA} mt-1`}
              />
            </label>
            <label className="block text-[13px] text-[var(--cz-texto-suave)]">
              Até
              <input
                type="date"
                value={personalizado ? (filtros.prazoAte ?? "") : ""}
                onChange={(e) => mudarPrazo({ prazoAte: e.target.value || null })}
                aria-label="Prazo até"
                className={`${ENTRADA} mt-1`}
              />
            </label>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
            Preencher aqui substitui o atalho de prazo escolhido na tela.
          </p>
        </CampoDaFolha>

        <CampoDaFolha rotulo="Buscar vendas dos últimos">
          <GrupoDePilulas
            rotulo="Janela de busca, em dias"
            opcoes={JANELAS.map((d) => ({ id: String(d), rotulo: `${d} dias` }))}
            estaAtiva={(id) => filtros.janelaDias === Number(id)}
            onEscolher={(id) => onMudarBarra({ janelaDias: Number(id) })}
          />
        </CampoDaFolha>

        {modalidades.length > 0 && (
          <CampoDaFolha rotulo="Modalidade de envio">
            <GrupoDePilulas
              rotulo="Modalidade de envio"
              opcoes={modalidades.map((m) => ({ id: m, rotulo: metaModalidade(m).rotulo }))}
              estaAtiva={(id) => filtros.modalidades.includes(id)}
              onEscolher={(id) => onMudarBarra({ modalidades: alternar(filtros.modalidades, id) })}
            />
          </CampoDaFolha>
        )}

        {/* Listas longas (contas, SKUs, categorias) abrem no fluxo, embaixo da linha,
            com busca própria: pastilhas para 300 SKUs não cabem numa folha. */}
        <FiltroRapido
          rotulo="Conta"
          placeholder="Todas"
          vazio="Nenhuma conta com pacote na fila"
          opcoes={contas.map((c) => ({
            valor: c.accountId,
            rotulo: `${c.conta} · ${CANAL_ROTULO[c.canal]}`,
            contagem: c.pacotes,
            icone: <LogoCanal canal={c.canal} />,
          }))}
          selecionados={filtros.contas}
          onMudar={(v) => onMudarBarra({ contas: v })}
        />
        <FiltroRapido
          rotulo="SKU"
          placeholder="Todos"
          buscaPlaceholder="Digite o código do SKU…"
          vazio="Nenhum SKU na fila"
          opcoes={opcoesSku.map((s) => ({ valor: s, rotulo: s }))}
          selecionados={filtros.skus}
          onMudar={(v) => onMudarBarra({ skus: v })}
        />
        <FiltroRapido
          rotulo="Categoria"
          placeholder="Todas"
          vazio="Nenhuma categoria cadastrada"
          opcoes={opcoesHierarquia1.map((h) => ({ valor: h, rotulo: h }))}
          selecionados={filtros.hierarquias1}
          onMudar={(v) => onMudarBarra({ hierarquias1: v })}
        />
      </BarraFiltros>

      {/* PRAZO: fora da folha. `cz-hscroll-sangra` encosta a faixa na borda da tela, que
          é a pista de que há mais chips à direita. */}
      <div className="cz-hscroll cz-hscroll-sangra mt-3 pb-0.5" role="group" aria-label="Prazo de despacho">
        <span className="self-center text-[12px] font-extrabold uppercase tracking-[0.05em] text-[var(--cz-texto-suave)]">
          Prazo
        </span>
        {ATALHOS_PRAZO_CEL.map((a) => {
          const ativo = filtros.prazoPreset === a.chave;
          return (
            <button
              key={a.chave}
              type="button"
              aria-pressed={ativo}
              // Trocar de atalho também solta as datas personalizadas: elas só valem
              // com `prazoPreset: "personalizado"`.
              onClick={() => onMudarBarra({ prazoPreset: a.chave, prazoDe: null, prazoAte: null })}
              className={`inline-flex h-11 items-center rounded-[var(--cz-raio)] border px-4 text-[14px] font-semibold transition-colors ${
                ativo
                  ? a.perigo
                    ? "border-[#dc2626] bg-[#dc2626] text-white"
                    : "border-[var(--cz-laranja)] bg-[var(--cz-laranja)] text-white"
                  : `border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] ${
                      a.perigo ? "text-[#b91c1c]" : "text-[var(--cz-texto)]"
                    }`
              }`}
            >
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {chips.length > 0 && (
        // `ChipsFiltro` quebra linha por padrão; dentro da faixa que rola, a largura
        // do filho é a do conteúdo (`flex-shrink: 0` do `.cz-hscroll`) e nada quebra.
        <div className="cz-hscroll cz-hscroll-sangra mt-2 pb-0.5 [&>div]:mt-0">
          <ChipsFiltro chips={chips} onLimparTudo={onLimpar} />
        </div>
      )}
    </div>
  );
}
