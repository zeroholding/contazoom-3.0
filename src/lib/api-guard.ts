/**
 * Guard de sessão e permissão para rotas de API.
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 14.4 e 14.5.
 *
 * Existe por três motivos:
 *
 * 1. O projeto não tem `middleware.ts`. O bloco de verificação está copiado em
 *    cerca de quinze `route.ts`, e cada cópia é uma chance de a regra divergir.
 *
 * 2. `checkIsAdmin` em `src/lib/auth.ts` faz `new PrismaClient()` e
 *    `$disconnect()` A CADA CHAMADA, ignorando o singleton de `src/lib/prisma.ts`.
 *    Uma conexão nova por request. Aqui a leitura usa o singleton e tem cache
 *    curto em memória.
 *
 * 3. O JWT não carrega `role` (o payload é `{ sub, email, name }`), então o papel
 *    só existe no banco. Sem cache, cada tela do módulo faria várias leituras da
 *    tabela `usuario` só para saber quem está falando.
 *
 * Nada aqui altera o comportamento das rotas que já existem: é adição.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "./prisma";
import { tryVerifySessionToken } from "./auth";
import {
  PAPEL,
  PAPEIS_INTERNOS,
  PAPEIS_VALIDOS,
  PAPEL_DESCRICAO,
  PAPEL_ICONE,
  PAPEL_LABEL,
  PAPEL_RESUMO,
  PAPEL_SELO,
  type Papel,
} from "./papeis";

/* -------------------------------------------------------------------------- */
/*                                   Papéis                                   */
/* -------------------------------------------------------------------------- */

/**
 * A tabela de papéis vive em `src/lib/papeis.ts`, que não importa nada.
 *
 * O motivo é o bundle: este arquivo importa `prisma` e `next/server`, então um
 * componente `"use client"` que lesse `PAPEL_LABEL` daqui arrastaria o Prisma
 * para o navegador. Re-exportamos para que `import { PAPEL } from
 * "@/lib/api-guard"` continue funcionando no servidor sem duplicar dado.
 *
 * Dois papéis não bastavam: o ajudante da contabilidade precisaria ser `ADMIN`
 * para mover etapa, e `ADMIN` também cria usuário e apaga documento de qualquer
 * cliente. Isso é poder demais por falta de granularidade.
 */
export {
  PAPEL,
  PAPEIS_INTERNOS,
  PAPEIS_VALIDOS,
  PAPEL_DESCRICAO,
  PAPEL_ICONE,
  PAPEL_LABEL,
  PAPEL_RESUMO,
  PAPEL_SELO,
};
export type { Papel };

/* -------------------------------------------------------------------------- */
/*                                   Sessão                                   */
/* -------------------------------------------------------------------------- */

export type Sessao = {
  userId: string;
  email: string;
  nome: string;
  papel: string;
};

/**
 * Cache de papel por usuário.
 *
 * Trinta segundos: curto o bastante para uma troca de permissão valer quase
 * imediatamente, longo o bastante para uma tela que dispara quatro requisições
 * não gerar quatro leituras da tabela.
 *
 * Em memória de propósito. O projeto já usa esse padrão em `Sidebar.tsx`
 * (`adminCheckCache`) e em `useAuth.ts` (`authCache`).
 */
type EntradaCache = { papel: string; nome: string; email: string; em: number };
const cachePapel = new Map<string, EntradaCache>();
const CACHE_MS = 30_000;

/** Limpa o papel de um usuário do cache. Chamar ao alterar permissão. */
export function invalidarCachePapel(userId?: string): void {
  if (userId) cachePapel.delete(userId);
  else cachePapel.clear();
}

/**
 * Resolve o papel do usuário.
 *
 * `ADMIN_EMAIL` continua valendo como no `checkIsAdmin` original: o dono é
 * administrador mesmo que a coluna `role` do banco diga outra coisa. Sem isso,
 * um acidente no cadastro trancaria o dono fora do próprio sistema.
 */
async function resolverUsuario(
  userId: string,
  emailDoToken?: string
): Promise<EntradaCache | null> {
  const agora = Date.now();
  const emCache = cachePapel.get(userId);
  if (emCache && agora - emCache.em < CACHE_MS) return emCache;

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, name: true, email: true },
  });
  if (!usuario) return null;

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const email = (usuario.email || emailDoToken || "").toLowerCase();
  const ehDono = Boolean(adminEmail && email && adminEmail === email);

  const entrada: EntradaCache = {
    papel: ehDono ? PAPEL.ADMIN : usuario.role || PAPEL.USER,
    nome: usuario.name || usuario.email || "",
    email: usuario.email || emailDoToken || "",
    em: agora,
  };
  cachePapel.set(userId, entrada);
  return entrada;
}

function erro(mensagem: string, status: number): NextResponse {
  return NextResponse.json({ error: mensagem }, { status });
}

/**
 * Sessão válida, ou a resposta de erro pronta para devolver.
 *
 * Uso:
 *   const sessao = await requireSessao(req);
 *   if (sessao instanceof NextResponse) return sessao;
 */
export async function requireSessao(
  req: NextRequest
): Promise<Sessao | NextResponse> {
  const token = req.cookies.get("session")?.value;
  const payload = await tryVerifySessionToken(token);
  if (!payload?.sub) return erro("Não autenticado.", 401);

  const usuario = await resolverUsuario(payload.sub, payload.email);
  if (!usuario) return erro("Usuário não encontrado.", 401);

  return {
    userId: payload.sub,
    email: usuario.email,
    nome: usuario.nome,
    papel: usuario.papel,
  };
}

/** Sessão com papel em `papeisAceitos`, ou 403. */
export async function requirePapel(
  req: NextRequest,
  papeisAceitos: string[]
): Promise<Sessao | NextResponse> {
  const sessao = await requireSessao(req);
  if (sessao instanceof NextResponse) return sessao;

  if (!papeisAceitos.includes(sessao.papel)) {
    return erro(
      "Seu perfil não tem permissão para esta ação.",
      403
    );
  }
  return sessao;
}

/** Atalho: qualquer papel interno (todos menos cliente). */
export async function requireInterno(
  req: NextRequest
): Promise<Sessao | NextResponse> {
  return requirePapel(req, PAPEIS_INTERNOS);
}

/** Atalho: somente administrador. */
export async function requireAdmin(
  req: NextRequest
): Promise<Sessao | NextResponse> {
  return requirePapel(req, [PAPEL.ADMIN]);
}

/* -------------------------------------------------------------------------- */
/*                        Permissões do módulo de tarefas                     */
/* -------------------------------------------------------------------------- */

/**
 * Testa pertencimento a uma lista de papéis.
 *
 * Existe para não repetir cast em cada predicado: o papel chega como `string`
 * (vem do banco, pode ter valor legado) e a lista é de literais, então
 * comparação direta não passa pelo TypeScript.
 */
function temPapel(papel: string, papeis: readonly string[]): boolean {
  return papeis.includes(papel);
}

/**
 * Quem pode concluir a etapa.
 *
 * A regra que sustenta tudo: **você só conclui etapa que é sua.** É o que impede
 * o comercial marcar apuração como feita e o escritório marcar como recebido um
 * documento que não recebeu. Administrador passa por cima, porque precisa
 * conseguir destravar operação.
 */
export function podeConcluirEtapa(
  papel: string,
  responsavelEtapa: string
): boolean {
  if (papel === PAPEL.ADMIN) return true;
  if (responsavelEtapa === "AMBOS") {
    return temPapel(papel, [
      PAPEL.COMERCIAL,
      PAPEL.CONTABIL,
      PAPEL.CONTABIL_ASSISTENTE,
    ]);
  }
  if (responsavelEtapa === "COMERCIAL_CZ") return papel === PAPEL.COMERCIAL;
  if (responsavelEtapa === "ESCRITORIO") {
    return temPapel(papel, [PAPEL.CONTABIL, PAPEL.CONTABIL_ASSISTENTE]);
  }
  return false;
}

/** Voltar etapa apaga trabalho registrado; assistente não faz isso. */
export function podeRetornarEtapa(papel: string): boolean {
  return temPapel(papel, [PAPEL.ADMIN, PAPEL.CONTABIL]);
}

/** Encerrar competência congela o valor entregue ao cliente. */
export function podeEncerrarTarefa(papel: string): boolean {
  return temPapel(papel, [PAPEL.ADMIN, PAPEL.CONTABIL]);
}

/** Reabrir desfaz um encerramento: só administrador. */
export function podeReabrirTarefa(papel: string): boolean {
  return papel === PAPEL.ADMIN;
}

/** Registrar e resolver pendência é de todo mundo que trabalha no fluxo. */
export function podeGerenciarBloqueio(papel: string): boolean {
  return PAPEIS_INTERNOS.includes(papel);
}

export function podeCriarProcesso(papel: string): boolean {
  return temPapel(papel, [PAPEL.ADMIN, PAPEL.COMERCIAL, PAPEL.CONTABIL]);
}

export function podeGerenciarEmpresa(papel: string): boolean {
  return temPapel(papel, [PAPEL.ADMIN, PAPEL.COMERCIAL]);
}

/** Mudar regime reescreve a linha do tempo fiscal: exige conhecimento contábil. */
export function podeAlterarRegime(papel: string): boolean {
  return temPapel(papel, [PAPEL.ADMIN, PAPEL.CONTABIL]);
}

export function podeGerenciarUsuarios(papel: string): boolean {
  return papel === PAPEL.ADMIN;
}

/** Resposta padrão de permissão negada, com o motivo escrito. */
export function negado(mensagem: string): NextResponse {
  return NextResponse.json({ error: mensagem }, { status: 403 });
}
