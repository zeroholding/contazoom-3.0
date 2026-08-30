"use client";

/**
 * Peças de layout do módulo: KPI, cabeçalho, vazio, carregando, aviso, paginação.
 *
 * Ficam juntas porque são casca — mudam sempre em conjunto e nenhuma tem lógica
 * própria. Espalhar em oito arquivos de vinte linhas só criaria oito imports.
 *
 * Contrato com as telas: nove views importam daqui. Nome de export e nome de
 * prop são API pública; prop nova entra sempre opcional e com default que
 * reproduz o comportamento anterior.
 *
 * LINGUAGEM VISUAL (referência aprovada pelo cliente)
 *
 * O desenho separa por BORDA, não por sombra: superfície branca, filete de 1px
 * em cinza quase branco, raio de 14px no cartão e 10px em botão e pastilha,
 * sombra praticamente ausente. Sombra empilhada em cada bloco é o que fazia o
 * painel parecer datado — a borda delimita sem ruído e sobra contraste para o
 * laranja significar ação.
 *
 * Paleta: laranja, branco, preto e cinza. Verde não entra como acento; a
 * variação boa é LARANJA e vermelho fica reservado para queda e erro. Os
 * valores `tom="verde"` e `tom="ok"` continuam na API porque as telas passam,
 * mas renderizam neutros.
 *
 * Duas convenções que valem para o arquivo inteiro:
 *
 * 1. Padding de conteúdo é responsabilidade de quem usa. O `Painel` só cuida do
 *    próprio cabeçalho e rodapé — as telas passam `px-5 py-4` no filho, e às
 *    vezes no próprio `className` do painel. Padding fixo aqui dobraria o delas.
 * 2. Cor de borda, sombra, tipografia do número e numeral tabular vêm da camada
 *    `.cz-tarefas` em globals.css (`--cz-hairline`, `--cz-elev-*`, `.cz-titulo`,
 *    `.cz-valor`, `.cz-num`). Foco visível é automático lá, então nenhum
 *    componente aqui declara classe `focus:`.
 */

import Link from "next/link";
import { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import Icone from "./Icone";
import {
  EsqueletoCartaoKpi,
  EsqueletoFicha,
  EsqueletoKpi,
  EsqueletoLista,
  EsqueletoPainel,
  EsqueletoTabela,
  Linha,
} from "./Esqueleto";

/* ---------------------------------- KPI ----------------------------------- */

type TomKpi = "laranja" | "cinza" | "verde" | "vermelho" | "ambar" | "azul";

type CartaoKpiProps = {
  titulo: string;
  valor: number | string;
  icone: string;
  /** Cor do ícone do rótulo. Laranja é o padrão da marca. */
  tom?: TomKpi;
  detalhe?: string;
  href?: string;
  /**
   * Tendência na linha de comparação. `valor` é a variação em pontos
   * percentuais (`12` vira "+12%"). `positivoEhBom` inverte a cor para
   * indicador onde subir é ruim — atraso, pendência — sem inverter a seta, que
   * continua apontando para onde o número foi.
   */
  variacao?: { valor: number; positivoEhBom?: boolean };
  /** Rende o próprio cartão em esqueleto, preservando a altura da grade. */
  carregando?: boolean;
  /**
   * Miniatura à direita do cartão: barrinhas, rosca, faísca. A tela injeta o
   * desenho pronto; este arquivo é casca e não sabe desenhar gráfico.
   *
   * Fica numa coluna que cede espaço antes do número e tem teto de altura, para
   * a faísca não empurrar o valor de 30px nem esticar o cartão acima dos irmãos
   * da mesma grade.
   */
  grafico?: ReactNode;
  /** Texto do link no pé quando há `href`. */
  acaoTexto?: string;
};

/**
 * Cor do ícone por tom.
 *
 * Só o ícone, e só a cor: o quadrado colorido de 32px no canto oposto competia
 * com o número, e em grade de seis cartões seis blocos chapados davam o mesmo
 * peso visual a tudo.
 *
 * `verde` e `azul` caem em cinza de propósito. Verde está proibido na paleta, e
 * azul está fora dela (laranja + branco + preto/cinza); o glifo do ícone já
 * distingue "concluído" de "em andamento" sem precisar de matiz própria. Ambos
 * seguem aceitos na união de tipos porque as telas passam.
 */
const TOM_KPI: Record<TomKpi, string> = {
  laranja: "text-[var(--cz-laranja)]",
  cinza: "text-[var(--cz-texto-fraco)]",
  verde: "text-[var(--cz-texto-fraco)]",
  vermelho: "text-[#B42318]",
  ambar: "text-[#B54708]",
  azul: "text-[var(--cz-texto-fraco)]",
};

/**
 * Variação da linha de comparação.
 *
 * Texto colorido, não pastilha: na referência a variação é só o número com a
 * seta, colada no texto cinza que explica contra o quê ("vs. trimestre
 * anterior"). Laranja para o movimento bom — verde está fora da paleta — e
 * vermelho para o ruim, que é o único uso de vermelho permitido aqui.
 */
function Tendencia({
  valor,
  positivoEhBom = true,
}: {
  valor: number;
  positivoEhBom?: boolean;
}) {
  const neutro = valor === 0;
  const bom = valor > 0 ? positivoEhBom : !positivoEhBom;
  const Seta = neutro ? Minus : valor > 0 ? ArrowUpRight : ArrowDownRight;

  const cor = neutro
    ? "text-[var(--cz-texto-fraco)]"
    : bom
      ? "text-[var(--cz-laranja-forte)]"
      : "text-[#B42318]";

  // Formatação à mão em vez de `Intl`: o servidor e o navegador podem resolver
  // locale diferente e a hidratação acusa divergência de texto.
  const absoluto = Math.abs(valor);
  const numero = Number.isInteger(absoluto)
    ? String(absoluto)
    : absoluto.toFixed(1).replace(".", ",");
  const sinal = valor > 0 ? "+" : valor < 0 ? "-" : "";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 text-[12px] font-bold leading-[18px] ${cor}`}
    >
      <Seta className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">variação de </span>
      <span className="cz-num">{`${sinal}${numero}%`}</span>
    </span>
  );
}

/**
 * Cartão de indicador. Três linhas, na ordem da referência.
 *
 * 1. Rótulo cinza de 13px com o ícone pequeno À ESQUERDA do texto, colado nele.
 * 2. O número, protagonista: 30px em peso 800 e tracking apertado, via
 *    `.cz-valor`. Nunca colorido — em grade de seis, seis números coloridos
 *    disputam entre si e nenhum vence.
 * 3. Linha de comparação de 12px: o `detalhe` em cinza seguido da `variacao`
 *    colorida.
 *
 * `mt-auto` na linha de comparação mantém a comparação rente ao rodapé: sem
 * ele, o cartão sem detalhe esticaria e os números da grade ficariam em alturas
 * diferentes. Com `href`, o cartão inteiro continua clicável — o que muda é que
 * o chevron deixou de aparecer solto no hover e virou link de texto no pé, que
 * é visível antes do mouse chegar.
 */
export function CartaoKpi({
  titulo,
  valor,
  icone,
  tom = "laranja",
  detalhe,
  href,
  variacao,
  carregando = false,
  grafico,
  acaoTexto = "Ver detalhes",
}: CartaoKpiProps) {
  // O esqueleto recebe a mesma informação de geometria: cartão com link é mais
  // alto por causa do pé, e ghost mais baixo faria a grade saltar.
  if (carregando) return <EsqueletoCartaoKpi comAcao={Boolean(href)} />;

  const corIcone = TOM_KPI[tom] ?? TOM_KPI.laranja;
  const temComparacao = Boolean(detalhe) || Boolean(variacao);

  const conteudo = (
    <>
      <div className={`flex flex-1 gap-3 px-5 ${href ? "pt-[18px]" : "py-[18px]"}`}>
        {/* `min-w-[6.5rem]` é o piso do número: cabe um valor de cinco dígitos
            em 30px sem quebrar linha nem virar corpo menor. Piso diferente de
            zero não atrapalha o `truncate` do rótulo e do detalhe — o que
            quebraria truncamento em item flex é o `min-width: auto` do default,
            e este continua substituído. */}
        <div className="flex min-w-[6.5rem] flex-1 flex-col">
          <p className="flex items-center gap-1.5 text-[13px] font-medium leading-5 text-[var(--cz-texto-suave)]">
            <Icone
              nome={icone}
              className={`h-[15px] w-[15px] shrink-0 ${corIcone}`}
            />
            <span className="truncate">{titulo}</span>
          </p>

          <p className="cz-valor mt-2 text-[1.875rem] leading-9">{valor}</p>

          {temComparacao && (
            <p className="mt-auto flex items-center gap-1.5 pt-2 text-[12px] leading-[18px] text-[var(--cz-texto-suave)]">
              {detalhe && <span className="truncate">{detalhe}</span>}
              {variacao && <Tendencia {...variacao} />}
            </p>
          )}
        </div>

        {grafico && (
          // A coluna do desenho pede 36% mas encolhe (`min-w-0`, sem
          // `shrink-0`): em cartão estreito quem cede é a faísca, nunca o
          // número. O teto de altura mais `overflow-hidden` garantem que a
          // grade fique com a mesma altura com e sem gráfico — o valor, o
          // rótulo e a linha de comparação continuam sendo o que define quanto
          // o cartão mede.
          <div className="flex max-h-[4.75rem] min-w-0 max-w-[8.5rem] basis-[36%] items-center justify-end overflow-hidden">
            {grafico}
          </div>
        )}
      </div>

      {href && (
        <span className="flex items-center gap-1 px-5 pb-[18px] pt-3 text-[12px] font-semibold leading-[18px] text-[var(--cz-laranja-forte)]">
          {acaoTexto}
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      )}
    </>
  );

  const casca =
    "group relative flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] shadow-[var(--cz-elev-1)]";

  if (href) {
    return (
      <Link
        href={href}
        className={`${casca} transition-colors duration-150 hover:border-[var(--cz-laranja-borda)]`}
      >
        {conteudo}
      </Link>
    );
  }

  return <div className={casca}>{conteudo}</div>;
}

/* ------------------------------- Cabeçalho -------------------------------- */

/**
 * Pílula de voltar + trilha local.
 *
 * Fora do `Cabecalho` porque os dois modos dele — completo e compacto — mostram
 * exatamente este bloco, e duas cópias do mesmo markup divergem na primeira
 * manutenção. Não é export: continua sendo detalhe interno do cabeçalho.
 */
function NavegacaoLocal({
  voltarPara,
  voltarTexto,
  passos,
}: {
  voltarPara?: string;
  voltarTexto: string;
  passos: { texto: string; href?: string }[];
}) {
  const temTrilha = passos.length > 0;
  if (!voltarPara && !temTrilha) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {voltarPara && (
        // Pílula de verdade, não link solto: o alvo de clique fica visível
        // antes do hover, que é o que faltava para as telas de detalhe.
        <Link
          href={voltarPara}
          className="group inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--cz-texto-suave)] transition-colors hover:border-[var(--cz-texto-fraco)] hover:text-[var(--cz-texto)]"
        >
          <ChevronLeft
            className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          {voltarTexto}
        </Link>
      )}

      {voltarPara && temTrilha && (
        <span
          className="h-4 w-px bg-[var(--cz-hairline-forte)]"
          aria-hidden="true"
        />
      )}

      {temTrilha && (
        <nav aria-label="Trilha de navegação">
          <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-[var(--cz-texto-suave)]">
            {passos.map((passo, i) => {
              const ultimo = i === passos.length - 1;
              return (
                <li
                  key={`${passo.texto}-${i}`}
                  className="flex items-center gap-1.5"
                >
                  {i > 0 && (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 text-[var(--cz-texto-fraco)]"
                      aria-hidden="true"
                    />
                  )}
                  {passo.href && !ultimo ? (
                    <Link
                      href={passo.href}
                      className="transition-colors hover:text-[var(--cz-laranja-forte)]"
                    >
                      {passo.texto}
                    </Link>
                  ) : (
                    <span
                      aria-current={ultimo ? "page" : undefined}
                      className={ultimo ? "text-[var(--cz-texto)]" : undefined}
                    >
                      {passo.texto}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </div>
  );
}

/**
 * Cabeçalho da tela.
 *
 * MODO COMPACTO (`compacto`, opcional, default `false`)
 *
 * O cabeçalho do admin já imprime trilha, título grande e subtítulo por rota.
 * Nas telas de LISTA o título da view era o mesmo texto de novo, dois blocos
 * empilhados dizendo a mesma coisa antes do primeiro dado — perto de 90px de
 * altura gastos em repetição. Com `compacto`, a view para de pintar título,
 * descrição e ícone e sobra só a barra de ação, encostada no topo do conteúdo.
 *
 * O `titulo` continua no documento como `<h1 className="sr-only">`. Isso não é
 * zelo decorativo: sem h1 a página perde a raiz da árvore de cabeçalhos, e
 * leitor de tela e navegação por landmarks ficam sem âncora para "onde estou".
 * O texto continua existindo, só não é pintado.
 *
 * A `descricao` sai da tela por inteiro no modo compacto. Quando ela carregava
 * dado — contagem, competência, resumo do filtro — quem chama move o texto para
 * um painel da própria tela; nenhuma das cinco listas perdeu contagem.
 *
 * Telas de DETALHE não usam `compacto`: lá o título é o nome da empresa ou a
 * competência, informação que o cabeçalho do admin não tem.
 */
export function Cabecalho({
  titulo,
  descricao,
  icone,
  acoes,
  voltarPara,
  voltarTexto = "Voltar",
  trilha,
  selos,
  compacto = false,
}: {
  titulo: string;
  descricao?: string;
  icone?: string;
  acoes?: ReactNode;
  voltarPara?: string;
  voltarTexto?: string;
  /** Trilha local da página. O último item é a posição atual, sem link. */
  trilha?: { texto: string; href?: string }[];
  /** Faixa de selos abaixo do título, no lugar de um painel só para isso. */
  selos?: ReactNode;
  /**
   * Esconde título, descrição e ícone, deixando só a barra de ação. O título
   * segue no documento como h1 de leitor de tela. Para tela cujo título já
   * aparece no cabeçalho do admin.
   */
  compacto?: boolean;
}) {
  const passos = trilha ?? [];
  const temTrilha = passos.length > 0;
  const navegacao = (
    <NavegacaoLocal
      voltarPara={voltarPara}
      voltarTexto={voltarTexto}
      passos={passos}
    />
  );

  if (compacto) {
    const temNavegacao = Boolean(voltarPara) || temTrilha;

    // Sem nada visível, devolve só o h1. Um wrapper vazio ainda contaria como
    // irmão no `space-y` da tela e abriria um vão de 24px sem conteúdo dentro.
    if (!temNavegacao && !acoes && !selos) {
      return <h1 className="sr-only">{titulo}</h1>;
    }

    return (
      // Uma linha só: voltar/trilha à esquerda, ações à direita. Sem o bloco de
      // título a barra tem a altura de um botão, então o `-mb-1` encurta o vão
      // até o primeiro painel — senão o respiro de 24px da tela, que existe
      // para separar blocos de conteúdo, sobraria como buraco embaixo dela.
      <div className="-mb-1 space-y-3">
        <h1 className="sr-only">{titulo}</h1>

        {(temNavegacao || acoes) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {navegacao}
            {acoes && (
              // `ml-auto` e não `justify-between`: com ou sem navegação à
              // esquerda, a barra de ação encosta na direita do mesmo jeito.
              <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                {acoes}
              </div>
            )}
          </div>
        )}

        {selos && (
          <div className="flex flex-wrap items-center gap-2">{selos}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {navegacao}

      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {icone && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] text-[var(--cz-laranja)]">
              <Icone nome={icone} className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="cz-titulo truncate text-2xl sm:text-[1.625rem]">
              {titulo}
            </h1>
            {descricao && (
              // Largura de leitura: em monitor largo a linha ia de ponta a
              // ponta e o olho perdia o começo da próxima.
              <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                {descricao}
              </p>
            )}
          </div>
        </div>
        {acoes && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>
        )}
      </div>

      {selos && <div className="flex flex-wrap items-center gap-2">{selos}</div>}
    </div>
  );
}

/* --------------------------------- Estados -------------------------------- */

/**
 * Estado de carregamento.
 *
 * O default continua sendo o que as telas já chamam (`<Carregando texto="…" />`),
 * mas deixou de ser um spinner solto no meio de 40vh de branco: agora é uma
 * linha de status com a forma do conteúdo abaixo. Quando a tela sabe o que vem
 * — grade de KPI, tabela, lista, ficha — `variante` desenha aquele formato e o
 * conteúdo real entra sem empurrar nada.
 */
export function Carregando({
  texto = "Carregando",
  variante = "spinner",
}: {
  texto?: string;
  variante?: "spinner" | "kpi" | "tabela" | "lista" | "ficha";
}) {
  let corpo: ReactNode;

  switch (variante) {
    case "kpi":
      corpo = <EsqueletoKpi />;
      break;
    case "tabela":
      corpo = (
        <EsqueletoPainel>
          <EsqueletoTabela />
        </EsqueletoPainel>
      );
      break;
    case "lista":
      corpo = <EsqueletoLista />;
      break;
    case "ficha":
      corpo = (
        <EsqueletoPainel>
          <EsqueletoFicha />
        </EsqueletoPainel>
      );
      break;
    default:
      // Forma genérica: serve tanto para lista quanto para detalhe, que é o que
      // as nove telas usam sem informar variante.
      corpo = (
        <EsqueletoPainel>
          <div className="divide-y divide-[var(--cz-hairline)]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Linha largura="2rem" altura="2rem" redondo className="shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Linha largura={i % 2 === 0 ? "62%" : "44%"} altura="0.875rem" />
                  <Linha largura="30%" altura="0.6875rem" />
                </div>
                <Linha
                  largura="4.5rem"
                  altura="1.5rem"
                  className="hidden shrink-0 sm:block"
                />
              </div>
            ))}
          </div>
        </EsqueletoPainel>
      );
  }

  return (
    <div className="space-y-4">
      <p
        role="status"
        className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--cz-texto-suave)]"
      >
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-[var(--cz-laranja)]"
          aria-hidden="true"
        />
        {texto}
      </p>
      {/* O esqueleto tem o próprio `role="status"`; escondido aqui para o leitor
          de tela não anunciar o mesmo carregamento duas vezes. */}
      <div aria-hidden="true">{corpo}</div>
    </div>
  );
}

/**
 * Estado vazio.
 *
 * Sempre com uma ação, quando existir uma: tela vazia sem saída faz o operador
 * achar que o sistema quebrou.
 *
 * Sem margem externa de propósito — metade das telas chama isto dentro de um
 * `Painel` que já tem padding, e margem aqui viraria respiro dobrado.
 */
export function Vazio({
  titulo,
  descricao,
  acao,
  icone = "Inbox",
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--cz-hairline-forte)] bg-[#FCFCFD] px-6 py-12 text-center">
      {/* Círculo delimitado por filete, sem sombra nem halo: a borda é o que
          separa nesta linguagem, e o ícone é decoração, não protagonista. */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] text-[var(--cz-texto-fraco)]">
        {icone === "Inbox" ? (
          // `Inbox` não está no mapa do `Icone` e cairia em `Circle`.
          <Inbox className="h-6 w-6" aria-hidden="true" />
        ) : (
          <Icone nome={icone} className="h-6 w-6" />
        )}
      </div>
      <h3 className="cz-titulo text-[15px]">{titulo}</h3>
      {descricao && (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--cz-texto-suave)]">
          {descricao}
        </p>
      )}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

/**
 * Faixa de erro ou aviso, dispensável pelo operador.
 *
 * Ícone diferente por tom, não só cor diferente: quem não distingue vermelho de
 * laranja receberia a faixa sem a informação mais importante dela.
 *
 * `ok` perdeu o verde e virou laranja claro — na linguagem nova o movimento bom
 * é laranja, a mesma regra da variação do KPI. `info` virou cinza: azul está
 * fora da paleta e a faixa de informação não precisa de matiz própria para se
 * distinguir das outras três.
 */
const TOM_AVISO: Record<
  "erro" | "atencao" | "info" | "ok",
  { casca: string; simbolo: typeof AlertCircle }
> = {
  erro: {
    casca: "border-[#FECDCA] border-l-[#D92D20] bg-[#FEF2F2] text-[#B42318]",
    simbolo: AlertCircle,
  },
  atencao: {
    casca: "border-[#FEDF89] border-l-[#DC6803] bg-[#FFFAEB] text-[#B54708]",
    simbolo: AlertTriangle,
  },
  info: {
    casca:
      "border-[var(--cz-hairline-forte)] border-l-[var(--cz-texto-fraco)] bg-[var(--cz-fundo)] text-[var(--cz-texto-suave)]",
    simbolo: Info,
  },
  ok: {
    casca:
      "border-[var(--cz-laranja-borda)] border-l-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]",
    simbolo: CheckCircle2,
  },
};

export function Aviso({
  mensagem,
  tom = "erro",
  onFechar,
}: {
  mensagem: string;
  tom?: "erro" | "atencao" | "info" | "ok";
  onFechar?: () => void;
}) {
  if (!mensagem) return null;

  const t = TOM_AVISO[tom] ?? TOM_AVISO.erro;
  const Simbolo = t.simbolo;

  return (
    <div
      role={tom === "erro" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-[12px] border border-l-[3px] px-4 py-3 text-[13.5px] ${t.casca}`}
    >
      <Simbolo className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="flex-1 font-medium leading-relaxed">{mensagem}</span>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          // Alvo de 32px: o `p-0.5` de antes dava 20px, abaixo do que a mão
          // acerta sem mirar.
          className="-my-1 -mr-1.5 shrink-0 rounded-[10px] p-1.5 opacity-70 transition hover:bg-black/5 hover:opacity-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* -------------------------------- Paginação ------------------------------- */

/**
 * Páginas visíveis, com reticência quando não cabe tudo.
 *
 * Até sete páginas mostra todas. Passando disso, mostra primeira, última e uma
 * janela de cinco em volta da atual — o suficiente para pular de perto sem a
 * régua de números virar uma segunda barra de rolagem.
 */
function paginasVisiveis(atual: number, paginas: number): (number | "…")[] {
  const MAX = 7;
  if (paginas <= MAX) {
    return Array.from({ length: paginas }, (_, i) => i + 1);
  }

  const escolhidas = new Set<number>([1, paginas]);
  const inicio = Math.max(2, Math.min(atual - 2, paginas - 5));
  for (let i = inicio; i < inicio + 5; i++) escolhidas.add(i);

  const ordenadas = [...escolhidas]
    .filter((n) => n >= 1 && n <= paginas)
    .sort((a, b) => a - b);

  const saida: (number | "…")[] = [];
  ordenadas.forEach((n, i) => {
    if (i > 0 && n - ordenadas[i - 1] > 1) saida.push("…");
    saida.push(n);
  });
  return saida;
}

/**
 * Paginação.
 *
 * `totalPaginas` pode chegar 0 de algumas rotas (é `ceil(total/limit)` puro), e
 * 0 renderizaria "Página 1 de 0". Normalizamos para no mínimo 1.
 */
export function Paginacao({
  pagina,
  totalPaginas,
  total,
  onMudar,
  rotulo = "registros",
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  onMudar: (pagina: number) => void;
  rotulo?: string;
}) {
  const paginas = Math.max(1, totalPaginas);
  if (total === 0) return null;

  const lista = paginasVisiveis(pagina, paginas);
  const passo =
    "inline-flex items-center gap-1 rounded-[10px] border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--cz-texto)] transition-colors hover:border-[var(--cz-texto-fraco)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col items-center justify-between gap-3 border-t border-[var(--cz-hairline)] px-4 py-3 sm:flex-row"
    >
      <p className="text-[13px] text-[var(--cz-texto-suave)]">
        <span className="cz-num font-bold text-[var(--cz-texto)]">{total}</span>{" "}
        {rotulo}
        <span aria-hidden="true"> · </span>
        página{" "}
        <span className="cz-num font-medium text-[var(--cz-texto)]">{pagina}</span>{" "}
        de{" "}
        <span className="cz-num font-medium text-[var(--cz-texto)]">{paginas}</span>
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onMudar(pagina - 1)}
          disabled={pagina <= 1}
          className={passo}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </button>

        {/* Régua de números só onde cabe: no celular ela empurraria os passos
            para fora da tela, e com uma página só não informa nada. */}
        <div
          className={`items-center gap-1 px-1 ${
            paginas > 1 ? "hidden sm:flex" : "hidden"
          }`}
        >
          {lista.map((item, i) =>
            item === "…" ? (
              <span
                key={`reticencia-${i}`}
                aria-hidden="true"
                className="px-1 text-[13px] text-[var(--cz-texto-fraco)]"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onMudar(item)}
                aria-label={`Página ${item}`}
                aria-current={item === pagina ? "page" : undefined}
                className={`cz-num inline-flex h-8 min-w-8 items-center justify-center rounded-[10px] px-2 text-[13px] font-medium transition-colors ${
                  item === pagina
                    ? "bg-[var(--cz-texto)] text-white"
                    : "text-[var(--cz-texto-suave)] hover:bg-[var(--cz-fundo)] hover:text-[var(--cz-texto)]"
                }`}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onMudar(pagina + 1)}
          disabled={pagina >= paginas}
          className={passo}
        >
          Próxima
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/* --------------------------------- Blocos --------------------------------- */

export function Painel({
  titulo,
  descricao,
  acoes,
  children,
  className = "",
  denso = false,
  rodape,
  elevacao = 1,
  verTudo,
}: {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Cabeçalho e rodapé com padding menor, para painel de apoio. */
  denso?: boolean;
  rodape?: ReactNode;
  /** 2 destaca o painel do resto da coluna. Sombra vem das vars do tema. */
  elevacao?: 1 | 2;
  /**
   * Link discreto no canto direito do cabeçalho ("Ver tudo >"), do jeito da
   * referência. Fica ao lado de `acoes`, não no lugar dela.
   */
  verTudo?: { href: string; texto?: string };
}) {
  const sombra =
    elevacao === 2 ? "shadow-[var(--cz-elev-2)]" : "shadow-[var(--cz-elev-1)]";
  const respiro = denso ? "px-4 py-3" : "px-5 py-4";

  return (
    <section
      className={`rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] ${sombra} ${className}`}
    >
      {(titulo || acoes || verTudo) && (
        // Coluna no celular, linha no resto: com `flex-wrap` o bloco de ações
        // caía embaixo e desalinhava assim que o título passava de uma linha.
        <div
          className={`flex flex-col gap-3 border-b border-[var(--cz-hairline)] sm:flex-row sm:items-start sm:justify-between ${respiro}`}
        >
          <div className="min-w-0 flex-1">
            {titulo && <h2 className="cz-titulo text-[15px]">{titulo}</h2>}
            {descricao && (
              <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                {descricao}
              </p>
            )}
          </div>
          {(acoes || verTudo) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {acoes}
              {verTudo && (
                <Link
                  href={verTudo.href}
                  className="group inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] transition-colors hover:text-[var(--cz-laranja)]"
                >
                  {verTudo.texto ?? "Ver tudo"}
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
      {children}
      {rodape && (
        <div
          className={`border-t border-[var(--cz-hairline)] ${
            denso ? "px-4 py-2.5" : "px-5 py-3"
          }`}
        >
          {rodape}
        </div>
      )}
    </section>
  );
}

/**
 * Seção de formulário dentro de modal.
 *
 * Existe porque formulário longo sem agrupamento é o que obriga a rolar: onze
 * campos empilhados sem hierarquia não dizem onde uma ideia acaba e a outra
 * começa, então o olho tem de ler todos para achar um. Com quatro blocos
 * ("Identificação", "Endereço", "Pessoas", "Plano e tributação") o cadastro de
 * empresa passou de três telas de rolagem para uma só.
 *
 * O ícone não é decoração: é o que deixa o bloco reconhecível de relance, e é
 * SVG do lucide, nunca emoji. A hairline de topo separa sem gastar sombra nem
 * fundo — mesmo vocabulário do resto do módulo, onde o que separa é borda.
 *
 * O primeiro bloco não leva hairline (`first:border-t-0`): linha logo abaixo do
 * cabeçalho do modal viraria uma segunda borda paralela à dele.
 */
export function BlocoForm({
  icone,
  titulo,
  descricao,
  children,
}: {
  icone: string;
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-[var(--cz-hairline)] pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
          <Icone nome={icone} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="cz-titulo text-[13.5px] leading-5">{titulo}</h3>
          {descricao && (
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-[var(--cz-texto-suave)]">
              {descricao}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * Par rótulo/valor da ficha de detalhe.
 *
 * O rótulo era caixa alta de 11px com tracking aberto; virou cinza de 12.5px em
 * caixa normal, que é como a referência escreve rótulo. Caixa alta pequena
 * custa legibilidade e brigava com o rótulo do KPI, que agora é do mesmo jeito.
 */
export function Dado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] font-medium leading-[18px] text-[var(--cz-texto-suave)]">
        {rotulo}
      </dt>
      <dd className="mt-1 text-[13.5px] font-semibold leading-snug text-[var(--cz-texto)]">
        {children}
      </dd>
    </div>
  );
}

/**
 * Barra de progresso de etapas.
 *
 * Laranja porque é trabalho em curso, e laranja escuro quando fecha — o verde
 * de conclusão saiu da paleta. Quem informa "acabou" é o 100% no texto, não a
 * troca de matiz.
 */
export function Progresso({
  feito,
  total,
  className = "",
  mostrarTexto = false,
}: {
  feito: number;
  total: number;
  className?: string;
  /** Contagem e percentual embaixo da barra. */
  mostrarTexto?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((feito / total) * 100)) : 0;
  const completo = pct >= 100;

  return (
    <div className={className}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--cz-hairline)]"
        role="progressbar"
        aria-valuenow={feito}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${feito} de ${total} etapas`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            completo ? "bg-[var(--cz-laranja-forte)]" : "bg-[var(--cz-laranja)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {mostrarTexto && (
        <div
          className="mt-1.5 flex items-center justify-between text-[11.5px] font-medium text-[var(--cz-texto-suave)]"
          aria-hidden="true"
        >
          <span className="cz-num">{`${feito}/${total}`}</span>
          <span
            className={`cz-num ${
              completo
                ? "text-[var(--cz-laranja-forte)]"
                : "text-[var(--cz-texto-suave)]"
            }`}
          >{`${pct}%`}</span>
        </div>
      )}
    </div>
  );
}
