/**
 * Vocabulário da tela de Contas de plataforma.
 *
 * NÃO IMPORTA PRISMA NEM `next/server` — mesmo motivo de `src/lib/expedicao.ts` e
 * de `src/lib/papeis.ts`: a tela é `"use client"` e precisa dos rótulos e das
 * cores de situação. Se os tipos morassem no próprio `route.ts`, o componente de
 * cliente importaria de um manipulador de rota, o que funciona por acidente
 * (tipo é apagado na compilação) e quebra no dia em que alguém precisar de uma
 * constante de verdade dali.
 */

export type CanalConta = "ML" | "SP";

export const CANAIS_CONTA: CanalConta[] = ["ML", "SP"];

export const CANAL_CONTA_NOME: Record<CanalConta, string> = {
  ML: "Mercado Livre",
  SP: "Shopee",
};

export const CANAL_CONTA_DESCRICAO: Record<CanalConta, string> = {
  ML: "Vendas, anúncios, estoque Full e expedição.",
  SP: "Vendas, repasses e expedição.",
};

/** Como cada plataforma chama o identificador da conta. */
export const CANAL_CONTA_ID_ROTULO: Record<CanalConta, string> = {
  ML: "ID do vendedor",
  SP: "ID da loja",
};

/**
 * `expirada` e `reconectar` são situações DIFERENTES, e tratá-las como uma só é
 * o que faz alguém refazer o OAuth sem necessidade — ou esperar por uma renovação
 * automática que nunca vai acontecer.
 *
 * - `ativa`: token válido.
 * - `expirada`: o access token venceu, mas o refresh token vale. O próximo sync
 *   renova sozinho, e o botão "Renovar" resolve na hora.
 * - `reconectar`: a plataforma recusou o refresh token. Não há o que renovar; só
 *   passar pelo consentimento de novo.
 */
export type SituacaoConta = "ativa" | "expirada" | "reconectar";

export const SITUACAO_CONTA_ROTULO: Record<SituacaoConta, string> = {
  ativa: "Ativa",
  expirada: "Token expirado",
  reconectar: "Reconectar",
};

/**
 * Verde, âmbar e vermelho seguem SEMÂNTICOS (tudo bem, atenção, ação necessária)
 * e não foram trocados pelo laranja da marca. Âmbar para `expirada` porque o
 * sistema se resolve sozinho no próximo sync: pintar de vermelho pediria uma ação
 * que não é necessária.
 */
export const SITUACAO_CONTA_SELO: Record<SituacaoConta, string> = {
  ativa: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expirada: "border-amber-200 bg-amber-50 text-amber-800",
  reconectar: "border-rose-200 bg-rose-50 text-rose-700",
};

export const SITUACAO_CONTA_EXPLICACAO: Record<SituacaoConta, string> = {
  ativa: "A conexão está válida e o sync funciona normalmente.",
  expirada:
    "O acesso venceu, mas a autorização continua válida. O próximo sync renova sozinho — ou use Renovar agora.",
  reconectar:
    "A plataforma recusou a autorização guardada. Renovar não resolve: é preciso conectar a conta novamente.",
};

export type ContaPlataforma = {
  id: string;
  canal: CanalConta;
  nome: string;
  identificador: string;
  situacao: SituacaoConta;
  tokenExpiraEm: string | null;
  conectadaEm: string | null;
  tokenAtualizadoEm: string | null;
  vendas: number;
  ultimaVenda: string | null;
  ultimoSync: string | null;
};

export type RespostaContas = {
  contas: ContaPlataforma[];
  /** Quantas precisam de reconexão manual. A tela avisa no topo. */
  precisamReconectar: number;
};

/* -------------------------------------------------------------------------- */
/*                                 Formatação                                 */
/* -------------------------------------------------------------------------- */

/** "09/09/2026 16:32" no fuso de São Paulo, ou "—". */
export function dataHoraSP(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "09/09/2026", ou "—". */
export function dataSP(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Quanto falta para o token vencer, em linguagem humana.
 *
 * Data absoluta obrigaria a pessoa a fazer a conta de cabeça para saber se o
 * token está de pé — e essa conta é justamente a que decide se ela clica em
 * Renovar. Quando já venceu, diz há quanto tempo, porque "expirado" sem prazo não
 * distingue "venceu agora" de "venceu em março".
 */
export function validadeToken(iso: string | null): string {
  if (!iso) return "sem validade registrada";
  const alvo = new Date(iso).getTime();
  if (!Number.isFinite(alvo)) return "sem validade registrada";

  const minutos = Math.round((alvo - Date.now()) / 60_000);
  const venceu = minutos < 0;
  const abs = Math.abs(minutos);

  const quanto =
    abs < 60
      ? `${abs} min`
      : abs < 60 * 24
        ? `${Math.floor(abs / 60)} h`
        : `${Math.floor(abs / (60 * 24))} d`;

  return venceu ? `venceu há ${quanto}` : `vence em ${quanto}`;
}
