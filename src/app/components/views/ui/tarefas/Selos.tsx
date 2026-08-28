"use client";

/**
 * Selos de status, prazo, regime, papel e situação de etapa.
 *
 * Regra que vale para todos: NENHUM estado é comunicado só por cor. Sempre
 * cor + texto + ícone. Quem não distingue vermelho de verde precisa conseguir
 * operar o sistema, e um Kanban que só muda de tonalidade é inútil impresso ou
 * em monitor ruim.
 *
 * A segunda regra é hierarquia. Numa linha de cartão aparecem até quatro selos
 * ao mesmo tempo (status, regime, prazo, bloqueio); se todos tiverem o mesmo
 * peso, viram uma faixa de pílulas onde nada salta e o olho tem de ler as
 * quatro para achar a que importa. Por isso cada selo nasce com um `peso`:
 *
 *   forte  → informação principal. Fundo tingido, texto pesado, ícone maior.
 *   medio  → sinal que precisa ser lido, mas não domina.
 *   fraco  → contexto. Fundo branco, borda e texto na cor do domínio.
 *
 * O default é por TIPO de selo, não global: status nasce forte, regime e
 * responsável nascem fracos. As telas não passam a prop e mesmo assim ganham a
 * hierarquia.
 *
 * As cores continuam vindo das tabelas de domínio (`corDoStatus`, `papelSelo`,
 * `corPrazo`). Onde a cor vem de fora, o `peso` só mexe em forma, peso de fonte
 * e tamanho de ícone — nunca em fundo ou borda, porque duas utilitárias
 * disputando a mesma propriedade se resolvem pela ordem da folha, não pela
 * ordem da string, e o resultado seria loteria.
 */

import type { ReactNode } from "react";
import {
  corDoStatus,
  labelDoStatus,
  STATUS_LABEL_CURTO,
} from "@/lib/tarefa-status";
import {
  BLOQUEIO_RESPONSAVEL_LABEL,
  REGIME_LABEL,
  REGIME_SIGLA,
  RESPONSAVEL_LABEL,
  SITUACAO_EMPRESA_LABEL,
  SITUACAO_ETAPA_LABEL,
} from "@/lib/tarefa-etapas";
import { PAPEL_ICONE, papelLabel, papelSelo } from "@/lib/papeis";
import { corPrazo, iconePrazo, textoPrazo } from "./formato";
import Icone from "./Icone";

/* ---------------------------------- Forma --------------------------------- */

export type PesoSelo = "forte" | "medio" | "fraco";

/**
 * Raio médio (8px) para todo selo, sempre.
 *
 * Antes o raio dependia do comprimento do rótulo: cápsula até 18 caracteres,
 * canto suave acima. Duas formas para a mesma coisa, e uma linha de cartão com
 * quatro selos mostrava as duas ao mesmo tempo. A referência resolve isso com
 * uma curva só — as pastilhas dela são de canto médio, inclusive as sólidas com
 * ícone. Rótulo longo em cápsula era justamente o que fazia o selo parecer
 * comprimido, e ninguém precisa mais decidir nada por contagem de caractere.
 *
 * O rótulo continua nunca abreviado: vem da tabela de domínio e é o contrato com
 * o escritório.
 */
const BASE =
  "inline-flex items-center rounded-lg border align-middle whitespace-nowrap";

/**
 * O que muda entre os pesos é altura, folga, peso de fonte e assentamento — não
 * a cor. Assim o selo forte fica visivelmente mais alto que os vizinhos numa
 * linha com `items-center`, que é o que faz o olho bater nele primeiro, e a cor
 * continua sendo só o sinal do domínio.
 *
 * O forte perdeu a sombra que tinha: com fundo tingido, texto em 700 e ícone
 * maior, ele já se destaca por tamanho e peso. A sombra só empilhava ruído em
 * cima de um elemento de 24px de altura.
 */
const FORMA: Record<PesoSelo, string> = {
  forte: "gap-1.5 px-3 py-1.5 text-xs font-bold",
  medio: "gap-1.5 px-2.5 py-1 text-xs font-semibold",
  fraco: "gap-1 px-2 py-0.5 text-xs font-medium",
};

const TAM_ICONE: Record<PesoSelo, string> = {
  forte: "h-4 w-4 shrink-0",
  medio: "h-3.5 w-3.5 shrink-0",
  fraco: "h-3 w-3 shrink-0",
};

/**
 * Base de todos os selos. `className` do chamador é SEMPRE a última classe da
 * string: há tela que aperta o padding do `SeloPapel` para caber na coluna, e
 * ela precisa vencer o padding do peso.
 */
function Selo({
  cor,
  peso,
  texto,
  icone,
  title,
  numerico = false,
  className = "",
  children,
}: {
  cor: string;
  peso: PesoSelo;
  /** Conteúdo do selo quando não há `children`, e base do `title` curto. */
  texto: string;
  icone?: string;
  title?: string;
  /** Liga numerais tabulares: dia e contagem param de dançar entre linhas. */
  numerico?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`${BASE} ${FORMA[peso]} ${
        numerico ? "cz-num" : ""
      } ${cor} ${className}`}
    >
      {icone && <Icone nome={icone} className={TAM_ICONE[peso]} />}
      {children ?? texto}
    </span>
  );
}

/**
 * Mesma família de cor, com e sem preenchimento.
 *
 * No peso fraco o fundo é branco sólido, não mais branco a 70%: translúcido
 * sobre cartão tingido devolvia uma terceira cor que não estava em lugar nenhum
 * da paleta, e a referência trabalha com superfície branca fechada.
 */
function tom(
  peso: PesoSelo,
  borda: string,
  fundo: string,
  texto: string
): string {
  return peso === "fraco"
    ? `${borda} bg-white ${texto}`
    : `${borda} ${fundo} ${texto}`;
}

/* --------------------------------- Status --------------------------------- */

export function SeloStatus({
  status,
  curto = false,
  className = "",
  peso = "forte",
}: {
  status: string;
  curto?: boolean;
  className?: string;
  /** Status é a informação principal do cartão: nasce forte. */
  peso?: PesoSelo;
}) {
  const cor = corDoStatus(status);
  const texto = curto
    ? STATUS_LABEL_CURTO[status] ?? labelDoStatus(status)
    : labelDoStatus(status);

  return (
    <Selo
      cor={cor.selo}
      peso={peso}
      texto={texto}
      icone={cor.icone}
      title={labelDoStatus(status)}
      className={className}
    />
  );
}

/* ---------------------------------- Prazo --------------------------------- */

export function SeloPrazo({
  situacao,
  dias,
  className = "",
  peso = "medio",
}: {
  situacao: string;
  dias: number | null | undefined;
  className?: string;
  peso?: PesoSelo;
}) {
  // Prazo concluído não é informação em lista: só ocupa espaço no cartão.
  if (situacao === "CONCLUIDO") return null;

  return (
    <Selo
      cor={corPrazo(situacao)}
      peso={peso}
      texto={textoPrazo(situacao, dias)}
      icone={iconePrazo(situacao)}
      numerico
      className={className}
    />
  );
}

/* --------------------------------- Regime --------------------------------- */

/**
 * Sigla (SN/LP) para cartão; nome inteiro fica no `title`.
 *
 * Regime é contexto puro — não muda ao longo do mês e não cobra ação de
 * ninguém. Por isso nasce fraco: borda e texto na cor do regime, sem fundo. Não
 * leva ícone porque a sigla já é o texto; um ícone genérico ao lado de "SN" só
 * ocuparia espaço.
 */
export function SeloRegime({
  regime,
  completo = false,
  className = "",
  peso = "fraco",
}: {
  regime: string;
  completo?: boolean;
  className?: string;
  peso?: PesoSelo;
}) {
  // Regime é NEUTRO nas duas opções. Antes Simples Nacional era verde e Lucro
  // Presumido azul, e nenhuma das duas cores significava nada: regime não é bom
  // nem ruim, não muda no mês e não cobra ação. Eram só dois matizes fora da
  // paleta para distinguir duas coisas que o próprio texto já distingue ("SN" e
  // "LP"). Gastar cor onde o texto resolve tira sinal de onde a cor decide algo.
  const cor = tom(
    peso,
    "border-[var(--cz-hairline-forte)]",
    "bg-[var(--cz-fundo)]",
    "text-[var(--cz-texto-suave)]"
  );

  const texto = completo
    ? REGIME_LABEL[regime] ?? regime
    : REGIME_SIGLA[regime] ?? regime;

  return (
    <Selo
      cor={cor}
      peso={peso}
      texto={texto}
      title={REGIME_LABEL[regime] ?? regime}
      className={className}
    />
  );
}

/* ---------------------------------- Papel --------------------------------- */

export function SeloPapel({
  papel,
  className = "",
  peso = "medio",
}: {
  papel: string | null | undefined;
  className?: string;
  peso?: PesoSelo;
}) {
  const nome = papel ?? "";
  return (
    <Selo
      cor={papelSelo(nome)}
      peso={peso}
      texto={papelLabel(nome)}
      icone={PAPEL_ICONE[nome] ?? "User"}
      className={className}
    />
  );
}

/* ------------------------------ Etapa e afins ----------------------------- */

const ICONE_SITUACAO_ETAPA: Record<string, string> = {
  PENDENTE: "Circle",
  EM_ANDAMENTO: "Loader",
  CONCLUIDA: "CheckCircle2",
  NAO_APLICAVEL: "MinusCircle",
};

function corSituacaoEtapa(situacao: string, peso: PesoSelo): string {
  switch (situacao) {
    case "EM_ANDAMENTO":
      return tom(peso, "border-[#FED7AA]", "bg-[#FFF4EB]", "text-[#C2410C]");
    case "CONCLUIDA":
      return tom(peso, "border-[#ABEFC6]", "bg-[#ECFDF3]", "text-[#027A48]");
    case "NAO_APLICAVEL":
      return tom(peso, "border-gray-200", "bg-gray-50", "text-gray-500");
    default:
      return tom(peso, "border-gray-200", "bg-gray-100", "text-gray-600");
  }
}

export function SeloSituacaoEtapa({
  situacao,
  className = "",
  peso = "medio",
}: {
  situacao: string;
  className?: string;
  peso?: PesoSelo;
}) {
  return (
    <Selo
      cor={corSituacaoEtapa(situacao, peso)}
      peso={peso}
      texto={SITUACAO_ETAPA_LABEL[situacao] ?? situacao}
      icone={ICONE_SITUACAO_ETAPA[situacao] ?? "Circle"}
      className={className}
    />
  );
}

/**
 * Quem é dono da etapa. Cor diferente para não confundir com status, e peso
 * fraco porque na lista de etapas quem manda é a situação — o responsável
 * responde "com quem está", não "como está".
 */
const ICONE_RESPONSAVEL: Record<string, string> = {
  COMERCIAL_CZ: "Handshake",
  ESCRITORIO: "Calculator",
  AMBOS: "Users",
};

export function SeloResponsavelEtapa({
  tipo,
  className = "",
  peso = "fraco",
}: {
  tipo: string;
  className?: string;
  peso?: PesoSelo;
}) {
  // Laranja só no Comercial C.Z, que é a etapa cuja pendência costuma travar o
  // mês e a que a gestão precisa achar na lista. Escritório e Ambos ficam
  // neutros: o "Ambos" era roxo, uma cor que não existe em nenhum outro lugar do
  // painel e que aparecia justamente na etapa menos crítica das três.
  const cor =
    tipo === "COMERCIAL_CZ"
      ? tom(
          peso,
          "border-[var(--cz-laranja-borda)]",
          "bg-[var(--cz-laranja-suave)]",
          "text-[var(--cz-laranja-forte)]"
        )
      : tom(
          peso,
          "border-[var(--cz-hairline-forte)]",
          "bg-[var(--cz-fundo)]",
          "text-[var(--cz-texto-suave)]"
        );

  return (
    <Selo
      cor={cor}
      peso={peso}
      texto={RESPONSAVEL_LABEL[tipo] ?? tipo}
      icone={ICONE_RESPONSAVEL[tipo] ?? "Users"}
      className={className}
    />
  );
}

/* ------------------------------ Empresa e bloqueio ------------------------ */

/**
 * Situação da empresa também ganhou ícone: era o único selo do módulo que
 * comunicava estado só por cor e texto, e "Ativa" verde contra "Encerrada"
 * cinza é justamente o par que se perde em monitor ruim ou impresso.
 */
const ICONE_SITUACAO_EMPRESA: Record<string, string> = {
  ATIVA: "CheckCircle2",
  SUSPENSA: "AlertTriangle",
  ENCERRADA: "Ban",
  EM_ABERTURA: "Hourglass",
};

function corSituacaoEmpresa(situacao: string, peso: PesoSelo): string {
  switch (situacao) {
    case "ATIVA":
      return tom(peso, "border-[#ABEFC6]", "bg-[#ECFDF3]", "text-[#027A48]");
    case "SUSPENSA":
      return tom(peso, "border-[#FEDF89]", "bg-[#FFFAEB]", "text-[#B54708]");
    case "EM_ABERTURA":
      // Era azul. Virou laranja: abertura é trabalho em curso, e no painel novo
      // trabalho em curso é laranja — a mesma regra da barra de progresso.
      return tom(
        peso,
        "border-[var(--cz-laranja-borda)]",
        "bg-[var(--cz-laranja-suave)]",
        "text-[var(--cz-laranja-forte)]"
      );
    default:
      return tom(
        peso,
        "border-[var(--cz-hairline-forte)]",
        "bg-[var(--cz-fundo)]",
        "text-[var(--cz-texto-suave)]"
      );
  }
}

export function SeloSituacaoEmpresa({
  situacao,
  className = "",
  peso = "medio",
}: {
  situacao: string;
  className?: string;
  peso?: PesoSelo;
}) {
  return (
    <Selo
      cor={corSituacaoEmpresa(situacao, peso)}
      peso={peso}
      texto={SITUACAO_EMPRESA_LABEL[situacao] ?? situacao}
      icone={ICONE_SITUACAO_EMPRESA[situacao] ?? "Building2"}
      className={className}
    />
  );
}

/**
 * Pendência aberta, com quem trava e há quantos dias.
 *
 * Os dias são o ponto: "travado há 12 dias esperando o cliente" é o que resolve
 * reunião; "travado" sozinho não cobra ação de ninguém. O número vai em
 * numeral tabular para as linhas empilhadas ficarem comparáveis.
 */
export function SeloBloqueio({
  responsavel,
  dias,
  className = "",
  peso = "medio",
}: {
  responsavel: string | null | undefined;
  dias: number | null | undefined;
  className?: string;
  peso?: PesoSelo;
}) {
  const quem = responsavel
    ? BLOQUEIO_RESPONSAVEL_LABEL[responsavel] ?? responsavel
    : "Pendência";
  const tempo =
    dias === null || dias === undefined
      ? ""
      : dias === 0
      ? " · hoje"
      : dias === 1
      ? " · há 1 dia"
      : ` · há ${dias} dias`;

  return (
    <Selo
      cor={tom(peso, "border-[#FEDF89]", "bg-[#FFFAEB]", "text-[#B54708]")}
      peso={peso}
      texto={`${quem}${tempo}`}
      icone="AlertTriangle"
      className={className}
    >
      <span>
        {quem}
        {tempo && <span className="cz-num">{tempo}</span>}
      </span>
    </Selo>
  );
}
