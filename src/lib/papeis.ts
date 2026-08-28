/**
 * Papéis de acesso — versão segura para o navegador.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seção 6.
 *
 * Este arquivo existe separado de `api-guard.ts` por um motivo prático: o guard
 * importa `prisma` e `next/server`, então qualquer componente com "use client"
 * que tentasse ler `PAPEL_LABEL` de lá arrastaria o Prisma para o bundle do
 * navegador e o build quebraria. Aqui não há import nenhum — é só dado.
 *
 * `api-guard.ts` re-exporta tudo o que está aqui, então continua valendo
 * `import { PAPEL } from "@/lib/api-guard"` no servidor.
 */

/**
 * `USER` e `ADMIN` já existem no banco (`usuario.role`, String, sem enum) e são
 * mantidos com o mesmo significado. Os três do meio são novos.
 */
export const PAPEL = {
  ADMIN: "ADMIN",
  COMERCIAL: "COMERCIAL",
  CONTABIL: "CONTABIL",
  CONTABIL_ASSISTENTE: "CONTABIL_ASSISTENTE",
  USER: "USER",
} as const;
export type Papel = (typeof PAPEL)[keyof typeof PAPEL];

export const PAPEL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  COMERCIAL: "Comercial",
  CONTABIL: "Contabilidade",
  CONTABIL_ASSISTENTE: "Assistente contábil",
  USER: "Cliente",
};

/** Descrição do que o papel permite, para a tela de cadastro não mentir. */
export const PAPEL_DESCRICAO: Record<string, string> = {
  ADMIN:
    "Acesso total: cadastra usuários e empresas, configura fluxos e prazos, reabre competência encerrada.",
  COMERCIAL:
    "Vê toda a carteira, executa as etapas do Comercial C.Z, registra pendências e abre processos de legalização. Não cadastra usuários.",
  CONTABIL:
    "Vê toda a carteira, executa as etapas do Escritório, encerra competência e retorna etapa.",
  CONTABIL_ASSISTENTE:
    "Vê a carteira e executa as etapas do Escritório. Não encerra competência nem retorna etapa.",
  USER: "Acesso de cliente ao próprio painel. Sem acesso ao módulo de tarefas.",
};

/**
 * Resumo em uma linha, para caber na coluna da tabela sem empurrar o layout.
 * A descrição longa fica no `title` e no painel lateral.
 */
export const PAPEL_RESUMO: Record<string, string> = {
  ADMIN: "Acesso total ao sistema",
  COMERCIAL: "Etapas do Comercial C.Z",
  CONTABIL: "Etapas do Escritório, encerra competência",
  CONTABIL_ASSISTENTE: "Etapas do Escritório, sem encerrar",
  USER: "Somente o próprio painel",
};

export const PAPEIS_VALIDOS = Object.values(PAPEL) as string[];

/** Quem trabalha no módulo. `USER` não entra nesta fase. */
export const PAPEIS_INTERNOS: string[] = [
  PAPEL.ADMIN,
  PAPEL.COMERCIAL,
  PAPEL.CONTABIL,
  PAPEL.CONTABIL_ASSISTENTE,
];

export const PAPEL_SELO: Record<string, string> = {
  ADMIN: "bg-gray-900 text-white border-gray-900",
  COMERCIAL: "bg-[#FFF4EB] text-[#C2410C] border-[#FED7AA]",
  CONTABIL: "bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]",
  CONTABIL_ASSISTENTE: "bg-[#F4F3FF] text-[#5925DC] border-[#D9D6FE]",
  USER: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Ícone lucide de cada papel. Nunca emoji. */
export const PAPEL_ICONE: Record<string, string> = {
  ADMIN: "ShieldCheck",
  COMERCIAL: "Handshake",
  CONTABIL: "Calculator",
  CONTABIL_ASSISTENTE: "ClipboardList",
  USER: "User",
};

const SELO_PADRAO = "bg-gray-100 text-gray-600 border-gray-200";

export function papelLabel(papel: string | null | undefined): string {
  if (!papel) return "Sem papel";
  return PAPEL_LABEL[papel] ?? papel;
}

export function papelSelo(papel: string | null | undefined): string {
  if (!papel) return SELO_PADRAO;
  return PAPEL_SELO[papel] ?? SELO_PADRAO;
}

export function ehInterno(papel: string | null | undefined): boolean {
  return !!papel && PAPEIS_INTERNOS.includes(papel);
}
