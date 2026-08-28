"use client";

/**
 * Gráficos do painel de tarefas.
 *
 * O painel era uma pilha de números e barrinhas de CSS: correto e sem vida. Aqui
 * ficam as quatro formas que o painel usa para mostrar a mesma verdade de um
 * jeito que se lê de longe — rosca de status, barras de regime, área de evolução
 * e faísca de cartão.
 *
 * Três regras valem para o arquivo inteiro:
 *
 * 1. NENHUM dado nasce aqui. Todo componente recebe número pronto da API. Não
 *    existe valor de exemplo, mock nem preenchimento "só para o gráfico não
 *    ficar vazio" — se está zero, entra o estado vazio.
 *
 * 2. Zero não vira desenho. Rosca de total zero é uma circunferência cinza,
 *    barra de zero é um retângulo vazio e faísca de zero é uma linha reta: três
 *    formas que ocupam espaço sem informar nada e fazem a tela parecer quebrada.
 *    Quando a soma é zero, cada componente devolve uma mensagem curta no lugar
 *    do gráfico.
 *
 * 3. Cor vem de tabela de domínio, nunca de invenção. Os seis status usam
 *    `corDoStatus().solida`, que é escala aprovada; o resto do arquivo é laranja
 *    da marca (#F26212 / #D9500A), cinza de eixo e o vermelho que o módulo já
 *    reserva para atraso. Verde, azul e roxo não entram.
 *
 * Dois cuidados de recharts que custaram tempo e ficam registrados:
 *
 *   - `ResponsiveContainer` mede o pai. Pai sem altura resolvida devolve 0 e o
 *     gráfico simplesmente não aparece. Por isso todo componente daqui embrulha
 *     o container numa div com altura explícita, e a altura é prop.
 *   - o tooltip herda a fonte de quem está por cima e em algumas rotas isso cai
 *     no serifado do `body`. A casca do tooltip declara família e tamanho na mão.
 */

import { useId } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { STATUS_ORDEM, corDoStatus, labelDoStatus } from "@/lib/tarefa-status";
import { REGIME, REGIME_LABEL } from "@/lib/tarefa-etapas";
import Icone from "./Icone";
import { SeloStatus } from "./Selos";
import { plural } from "./formato";

/* --------------------------------- Paleta --------------------------------- */

/** `--cz-laranja`. Fixo em hex porque SVG não resolve variável CSS em `fill`. */
const LARANJA = "#F26212";
/** `--cz-laranja-forte`. */
const LARANJA_ESCURO = "#D9500A";
/** Único vermelho do módulo, reservado para atraso e erro. */
const VERMELHO = "#B42318";
const CINZA_EIXO = "#9AA1AC";
const CINZA_GRADE = "#EDEFF3";

/**
 * A mesma pilha de `.cz-tarefas` em globals.css. O tooltip do recharts é
 * posicionado por transform dentro do wrapper do gráfico e, dependendo da rota,
 * herda o `font-family: Arial` do `body` em vez da fonte do painel.
 */
const FONTE =
  'var(--font-jakarta), var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const TICK = { fill: CINZA_EIXO, fontSize: 11.5, fontFamily: FONTE };

/* -------------------------------- Contratos ------------------------------- */

/** Um mês da série de evolução. Contagem de competência, nunca dinheiro. */
export type PontoEvolucao = {
  /** Rótulo curto do eixo: "Jan/26". */
  rotulo: string;
  abertas: number;
  concluidas: number;
  atrasadas: number;
};

type FatiaStatus = {
  status: string;
  nome: string;
  valor: number;
  cor: string;
};

type BarraRegime = {
  regime: string;
  nome: string;
  valor: number;
  cor: string;
};

/* ------------------------------- Casca comum ------------------------------- */

/**
 * Estado vazio do gráfico.
 *
 * Mesma linguagem do `Vazio` do kit — borda tracejada, superfície quase branca,
 * ícone discreto — mas em versão baixa, porque aqui ele ocupa o lugar de um
 * gráfico dentro de um painel que já tem título e descrição explicando o mês.
 */
function SemDado({
  icone,
  titulo,
  descricao,
  altura,
}: {
  icone: string;
  titulo: string;
  descricao?: string;
  altura: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--cz-hairline-forte)] bg-[#FCFCFD] px-5 py-6 text-center"
      style={{ minHeight: altura }}
    >
      <Icone nome={icone} className="h-5 w-5 text-[var(--cz-texto-fraco)]" />
      <p className="text-[13px] font-semibold text-[var(--cz-texto)]">{titulo}</p>
      {descricao && (
        <p className="max-w-sm text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
          {descricao}
        </p>
      )}
    </div>
  );
}

function CascaTooltip({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ fontFamily: FONTE, fontSize: "12.5px" }}
      className="pointer-events-none rounded-[10px] border border-[var(--cz-hairline-forte)] bg-white px-3 py-2 text-left shadow-[var(--cz-elev-2)]"
    >
      <p className="font-semibold leading-5 text-[var(--cz-texto)]">{titulo}</p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

/** Linha do tooltip: marcador da cor da série, rótulo em português, contagem. */
function LinhaTooltip({
  cor,
  rotulo,
  valor,
}: {
  cor: string;
  rotulo: string;
  valor: number;
}) {
  return (
    <p className="flex items-center gap-2 leading-5 text-[var(--cz-texto-suave)]">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: cor }}
      />
      <span className="flex-1">{rotulo}</span>
      <span className="cz-num font-bold text-[var(--cz-texto)]">{valor}</span>
    </p>
  );
}

/**
 * Primeiro dado do payload do tooltip.
 *
 * `payload[i].payload` é o objeto original da série, e o tipo do recharts o
 * declara como `any`. O cast fica isolado aqui em vez de espalhado nos três
 * tooltips.
 */
function dadoDoTooltip<T>(payload: TooltipProps<number, string>["payload"]): T | null {
  const item = payload?.[0];
  if (!item || item.payload === undefined || item.payload === null) return null;
  return item.payload as T;
}

/** Percentual inteiro, para o tooltip da rosca. */
function fatiaPercentual(valor: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((valor / total) * 100);
}

/* ------------------------------ Rosca de status --------------------------- */

function TooltipRosca({
  payload,
  total,
}: TooltipProps<number, string> & { total?: number }) {
  const fatia = dadoDoTooltip<FatiaStatus>(payload);
  if (!fatia) return null;
  const soma = total ?? 0;

  return (
    <CascaTooltip titulo={fatia.nome}>
      <LinhaTooltip cor={fatia.cor} rotulo="Apurações" valor={fatia.valor} />
      {soma > 0 && (
        <p className="cz-num leading-5 text-[var(--cz-texto-suave)]">
          {`${fatiaPercentual(fatia.valor, soma)}% da competência`}
        </p>
      )}
    </CascaTooltip>
  );
}

/**
 * Rosca dos seis status de entrega.
 *
 * Fatia só para status com contagem: fatia de zero não desenha nada e ainda
 * consome uma cor da legenda do recharts. A legenda, por outro lado, mostra os
 * SEIS sempre — com o zero apagado. É a mesma razão pela qual a API devolve todas
 * as chaves com zero: lista que muda de tamanho a cada competência obriga a
 * reler tudo para descobrir o que saiu.
 *
 * A legenda é o selo do próprio módulo, não a do recharts: a do recharts entrega
 * bolinha mais texto em fonte de biblioteca, sem o ícone que faz o status ser
 * legível para quem não distingue as cores.
 */
export function RoscaStatus({
  porStatus,
  altura = 248,
  rotulo,
  linkDoStatus,
}: {
  porStatus: Record<string, number>;
  altura?: number;
  /** Competência, só para a mensagem de vazio nomear o mês. */
  rotulo?: string;
  /** Quando informado, cada item da legenda vira link para a lista filtrada. */
  linkDoStatus?: (status: string) => string;
}) {
  const linhas: FatiaStatus[] = STATUS_ORDEM.map((status) => ({
    status,
    nome: labelDoStatus(status),
    valor: porStatus[status] ?? 0,
    cor: corDoStatus(status).solida,
  }));

  const total = linhas.reduce((soma, linha) => soma + linha.valor, 0);
  const fatias = linhas.filter((linha) => linha.valor > 0);

  if (total === 0) {
    return (
      <SemDado
        icone="ClipboardList"
        titulo="Nada para distribuir ainda"
        descricao={
          rotulo
            ? `Não existe apuração registrada em ${rotulo}. A rosca acende quando a competência for aberta.`
            : "A rosca acende quando existir apuração nesta competência."
        }
        altura={altura}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row">
      <div
        className="relative w-full max-w-[15rem] shrink-0"
        style={{ height: altura }}
        role="img"
        aria-label={`Distribuição por status: ${plural(
          total,
          "apuração",
          "apurações",
        )} no total.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius="64%"
              outerRadius="90%"
              // Respiro entre fatias só quando há mais de uma: com uma fatia só,
              // o recharts abre uma fenda no anel fechado.
              paddingAngle={fatias.length > 1 ? 2 : 0}
              stroke="#FFFFFF"
              strokeWidth={2}
            >
              {fatias.map((fatia) => (
                <Cell key={fatia.status} fill={fatia.cor} />
              ))}
            </Pie>
            <Tooltip content={<TooltipRosca total={total} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* `pointer-events-none` para o número no centro não roubar o hover das
            fatias que passam por baixo dele. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="cz-valor text-[1.875rem] leading-9">{total}</span>
          <span className="text-[11.5px] font-medium text-[var(--cz-texto-suave)]">
            {total === 1 ? "apuração" : "apurações"}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-1">
        {linhas.map((linha) => {
          const href = linkDoStatus?.(linha.status);
          const conteudo = (
            <>
              <SeloStatus status={linha.status} curto peso="fraco" />
              <span className="cz-num text-[13px] font-bold text-[var(--cz-texto)]">
                {linha.valor}
              </span>
            </>
          );

          // Zero fica apagado, não escondido: a lista precisa manter a forma
          // entre competências para o olho comparar sempre no mesmo lugar.
          const apagado = linha.valor === 0 ? "opacity-50" : "";

          return (
            <li key={linha.status}>
              {href ? (
                <Link
                  href={href}
                  aria-label={`${linha.nome}: ${plural(
                    linha.valor,
                    "apuração",
                    "apurações",
                  )}`}
                  className={`flex items-center justify-between gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[var(--cz-laranja-suave)] ${apagado}`}
                >
                  {conteudo}
                </Link>
              ) : (
                <span
                  className={`flex items-center justify-between gap-3 px-2 py-1.5 ${apagado}`}
                >
                  {conteudo}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------ Barras de regime -------------------------- */

function TooltipRegime({ payload }: TooltipProps<number, string>) {
  const barra = dadoDoTooltip<BarraRegime>(payload);
  if (!barra) return null;

  return (
    <CascaTooltip titulo={barra.nome}>
      <LinhaTooltip cor={barra.cor} rotulo="Apurações" valor={barra.valor} />
    </CascaTooltip>
  );
}

/**
 * Como a carteira se divide entre os dois regimes.
 *
 * Barras horizontais porque os rótulos são "Simples Nacional" e "Lucro
 * Presumido": na vertical eles viram texto girado ou abreviação. Dois tons do
 * mesmo laranja, e não duas matizes: regime não é bom nem ruim, então a cor aqui
 * só separa as duas barras.
 */
export function BarrasRegime({
  porRegime,
  altura = 168,
  rotulo,
  linkDoRegime,
}: {
  porRegime: Record<string, number>;
  altura?: number;
  rotulo?: string;
  linkDoRegime?: (regime: string) => string;
}) {
  const dados: BarraRegime[] = [
    {
      regime: REGIME.SIMPLES_NACIONAL,
      nome: REGIME_LABEL[REGIME.SIMPLES_NACIONAL],
      valor: porRegime[REGIME.SIMPLES_NACIONAL] ?? 0,
      cor: LARANJA,
    },
    {
      regime: REGIME.LUCRO_PRESUMIDO,
      nome: REGIME_LABEL[REGIME.LUCRO_PRESUMIDO],
      valor: porRegime[REGIME.LUCRO_PRESUMIDO] ?? 0,
      cor: LARANJA_ESCURO,
    },
  ];

  const total = dados.reduce((soma, barra) => soma + barra.valor, 0);

  if (total === 0) {
    return (
      <SemDado
        icone="Building2"
        titulo="Sem apuração por regime"
        descricao={
          rotulo
            ? `Nenhuma empresa tem competência aberta em ${rotulo}.`
            : "As barras aparecem quando houver competência aberta."
        }
        altura={altura}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        style={{ height: altura }}
        role="img"
        aria-label={dados
          .map((barra) => `${barra.nome}: ${barra.valor}`)
          .join("; ")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: 4, right: 36, bottom: 4, left: 4 }}
            barCategoryGap="28%"
          >
            <CartesianGrid horizontal={false} stroke={CINZA_GRADE} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="nome"
              width={118}
              tick={{ ...TICK, fill: "#6B7280", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<TooltipRegime />}
              cursor={{ fill: "rgba(242, 98, 18, 0.06)" }}
            />
            <Bar dataKey="valor" radius={[0, 6, 6, 0]} maxBarSize={26}>
              {dados.map((barra) => (
                <Cell key={barra.regime} fill={barra.cor} />
              ))}
              <LabelList
                dataKey="valor"
                position="right"
                fill="#14161B"
                fontSize={12}
                fontWeight={700}
                fontFamily={FONTE}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {linkDoRegime && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {dados.map((barra) => (
            <Link
              key={barra.regime}
              href={linkDoRegime(barra.regime)}
              className="group inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:text-[var(--cz-laranja)]"
            >
              {barra.nome}
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Área de evolução -------------------------- */

const SERIES_EVOLUCAO = [
  { chave: "abertas", rotulo: "Abertas", cor: LARANJA },
  { chave: "concluidas", rotulo: "Concluídas", cor: LARANJA_ESCURO },
  { chave: "atrasadas", rotulo: "Atrasadas", cor: VERMELHO },
] as const;

function TooltipEvolucao({ payload }: TooltipProps<number, string>) {
  const ponto = dadoDoTooltip<PontoEvolucao>(payload);
  if (!ponto) return null;

  return (
    <CascaTooltip titulo={ponto.rotulo}>
      {SERIES_EVOLUCAO.map((serie) => (
        <LinhaTooltip
          key={serie.chave}
          cor={serie.cor}
          rotulo={serie.rotulo}
          valor={ponto[serie.chave]}
        />
      ))}
    </CascaTooltip>
  );
}

/**
 * Evolução mês a mês.
 *
 * Área com gradiente para "abertas", que é o volume, e linha para "concluídas" e
 * "atrasadas", que são leitura de qualidade. Três áreas empilhadas com
 * transparência viram um borrão onde nenhuma das três se lê.
 *
 * O gradiente tem id gerado por `useId`: dois gráficos com gradiente de mesmo id
 * na mesma página fazem o segundo usar o `defs` do primeiro, e o `:` que o React
 * coloca no id sai fora para o `url(#...)` do SVG não engasgar.
 *
 * Eixo Y sem casa decimal: é contagem de competência. "2,5 apurações" não existe.
 */
export function AreaEvolucao({
  dados,
  altura = 260,
}: {
  dados: PontoEvolucao[];
  altura?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradiente = `cz-evolucao-${id}`;

  const total = dados.reduce(
    (soma, ponto) => soma + ponto.abertas + ponto.concluidas + ponto.atrasadas,
    0,
  );

  if (dados.length === 0 || total === 0) {
    return (
      <SemDado
        icone="TrendingUp"
        titulo="Sem histórico para desenhar"
        descricao="Nenhum dos meses consultados tem competência registrada. A curva começa a aparecer no primeiro mês aberto."
        altura={altura}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        style={{ height: altura }}
        role="img"
        aria-label={`Evolução de ${dados[0].rotulo} a ${
          dados[dados.length - 1].rotulo
        }: competências abertas, concluídas e atrasadas por mês.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={dados}
            margin={{ top: 8, right: 12, bottom: 4, left: -12 }}
          >
            <defs>
              <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LARANJA} stopOpacity={0.32} />
                <stop offset="100%" stopColor={LARANJA} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CINZA_GRADE} />
            <XAxis
              dataKey="rotulo"
              tick={TICK}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              allowDecimals={false}
              tick={TICK}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              content={<TooltipEvolucao />}
              cursor={{ stroke: CINZA_EIXO, strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="abertas"
              name="Abertas"
              stroke={LARANJA}
              strokeWidth={2.5}
              fill={`url(#${gradiente})`}
              // Ponto visível porque a série pode ter um mês só quando as outras
              // consultas falham, e área de um ponto não desenha linha nenhuma.
              dot={{ r: 3, fill: LARANJA, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="concluidas"
              name="Concluídas"
              stroke={LARANJA_ESCURO}
              strokeWidth={2}
              dot={{ r: 2.5, fill: LARANJA_ESCURO, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="atrasadas"
              name="Atrasadas"
              stroke={VERMELHO}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 2.5, fill: VERMELHO, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda própria pelo mesmo motivo da rosca: a do recharts vem em fonte
          de biblioteca e não acompanha a tipografia do painel. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        {SERIES_EVOLUCAO.map((serie) => (
          <li
            key={serie.chave}
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--cz-texto-suave)]"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: serie.cor }}
            />
            {serie.rotulo}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------- Faísca -------------------------------- */

/**
 * Sparkline de cartão de KPI. Sem eixo, sem grade, sem tooltip.
 *
 * O cartão já diz o número e a variação; a faísca só mostra o caminho até ali,
 * então ela é decorativa de propósito (`aria-hidden`) e não repete em leitor de
 * tela o que o texto do cartão já informa.
 *
 * Devolve `null` com menos de dois pontos ou soma zero: um ponto não tem
 * caminho, e uma sequência de zeros desenha uma reta que passaria por tendência
 * estável quando na verdade não existe dado nenhum.
 */
export function Faisca({
  valores,
  cor = LARANJA,
  altura = 44,
}: {
  valores: number[];
  cor?: string;
  altura?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradiente = `cz-faisca-${id}`;

  const soma = valores.reduce((acumulado, valor) => acumulado + valor, 0);
  if (valores.length < 2 || soma === 0) return null;

  const dados = valores.map((valor, indice) => ({ indice, valor }));

  return (
    <div className="w-full" style={{ height: altura }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={dados}
          margin={{ top: 4, right: 2, bottom: 2, left: 2 }}
        >
          <defs>
            <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={cor} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Eixo escondido só para fixar a base em zero: sem ele o recharts
              escala pelo mínimo da série e uma variação de 1 vira montanha. */}
          <YAxis hide domain={[0, "dataMax"]} />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={cor}
            strokeWidth={2}
            fill={`url(#${gradiente})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
