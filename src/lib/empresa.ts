/**
 * Camada de domínio da empresa (CNPJ).
 *
 * Especificação: NOVIDADES/MODULO_TAREFAS_CONTABEIS.md, seções 16.1 e 16.6.
 *
 * O módulo não usa zod: a validação é manual e em português, no estilo de
 * `src/lib/aliquota-imposto.ts`. O valor de concentrar tudo aqui é que as três
 * rotas de empresa (`/api/empresas`, `/api/empresas/[id]` e
 * `/api/empresas/[id]/regime`) aplicam exatamente a mesma regra: se a regra de
 * CNPJ ou de UF mudar, muda em um lugar só.
 *
 * Duas decisões que valem explicação:
 *
 * 1. O CNPJ é guardado SÓ COM DÍGITOS (`@db.VarChar(14)` no schema) e a máscara
 *    é aplicada na saída. Guardar formatado quebraria a unicidade — o mesmo CNPJ
 *    digitado com e sem ponto viraria duas empresas.
 *
 * 2. Datas de vigência e de início de atividade são normalizadas para
 *    meia-noite UTC. Vigência é DIA, não instante: sem isso, "01/03/2026"
 *    enviado de um fuso negativo é gravado como 28/02 e a linha do tempo fiscal
 *    fica um dia deslocada.
 */

import prisma from "@/lib/prisma";
import {
  REGIMES_VALIDOS,
  SITUACAO_EMPRESA,
  SITUACOES_EMPRESA_VALIDAS,
  TRIBUTO_LOCAL,
  TRIBUTOS_LOCAIS_VALIDOS,
} from "@/lib/tarefa-etapas";

/* -------------------------------------------------------------------------- */
/*                                    CNPJ                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoCnpj =
  | { ok: true; digitos: string }
  | { ok: false; erro: string };

/**
 * Pesos do cálculo dos dígitos verificadores, conforme a Receita Federal.
 * O segundo dígito usa 13 posições porque entra o primeiro dígito já calculado.
 */
const PESOS_PRIMEIRO_DV = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_SEGUNDO_DV = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = pesos.reduce(
    (total, peso, indice) => total + Number(base[indice]) * peso,
    0
  );
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida o CNPJ e devolve apenas os dígitos.
 *
 * Conferir o dígito verificador, e não só o tamanho, é o que impede erro de
 * digitação virar cadastro duplicado: "11.111.111/1111-11" tem 14 dígitos e
 * passaria em qualquer checagem de comprimento, mas não existe.
 */
export function normalizarCnpj(valor: unknown): ResultadoCnpj {
  if (typeof valor !== "string" && typeof valor !== "number") {
    return { ok: false, erro: "Informe o CNPJ da empresa." };
  }

  // Número em JSON perde o zero à esquerda (`"01234..."` chega como 1234...).
  // Como CNPJ tem tamanho fixo, recompor o zero é seguro; se o valor for lixo,
  // o dígito verificador reprova adiante.
  const bruto =
    typeof valor === "number" ? String(valor).padStart(14, "0") : valor;
  const digitos = bruto.replace(/\D/g, "");

  if (!digitos) return { ok: false, erro: "Informe o CNPJ da empresa." };
  if (digitos.length !== 14) {
    return { ok: false, erro: "O CNPJ deve ter 14 dígitos." };
  }
  if (/^(\d)\1{13}$/.test(digitos)) {
    return { ok: false, erro: "CNPJ inválido." };
  }
  if (
    digitoVerificador(digitos.slice(0, 12), PESOS_PRIMEIRO_DV) !==
      Number(digitos[12]) ||
    digitoVerificador(digitos.slice(0, 13), PESOS_SEGUNDO_DV) !==
      Number(digitos[13])
  ) {
    return {
      ok: false,
      erro: "CNPJ inválido: o dígito verificador não confere.",
    };
  }

  return { ok: true, digitos };
}

/** Aplica a máscara 00.000.000/0000-00. Devolve a entrada se não der 14 dígitos. */
export function formatarCnpj(digitos: string): string {
  const limpo = digitos.replace(/\D/g, "");
  if (limpo.length !== 14) return digitos;
  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(
    5,
    8
  )}/${limpo.slice(8, 12)}-${limpo.slice(12)}`;
}

/* -------------------------------------------------------------------------- */
/*                                   Datas                                    */
/* -------------------------------------------------------------------------- */

/**
 * Interpreta uma data de dia e zera a hora em UTC. Ver nota 2 do topo.
 * Devolve `null` quando o valor não é uma data utilizável.
 */
export function normalizarData(valor: unknown): Date | null {
  const data =
    valor instanceof Date
      ? valor
      : typeof valor === "string" && valor.trim()
        ? new Date(valor.trim())
        : null;
  if (!data || Number.isNaN(data.getTime())) return null;
  return new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())
  );
}

/** Hoje à meia-noite UTC, no mesmo padrão de `normalizarData`. */
export function hojeUtc(): Date {
  const agora = new Date();
  return new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  );
}

/** Data no formato brasileiro, para compor mensagem de erro legível. */
export function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/* -------------------------------------------------------------------------- */
/*                                  Payload                                   */
/* -------------------------------------------------------------------------- */

export type DadosEmpresa = {
  razaoSocial: string;
  nomeFantasia: string | null;
  regime: string;
  situacao: string;
  tributoLocal: string;
  uf: string | null;
  municipio: string | null;
  inicioAtividade: Date | null;
  userId: string | null;
  responsavelId: string | null;
  observacoes: string | null;
};

/** Campos editáveis pelo PATCH. `cnpj` e `regime` ficam de fora de propósito. */
export type AtualizacaoEmpresa = Partial<
  Omit<DadosEmpresa, "regime" | "inicioAtividade">
>;

export type ResultadoValidacao<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; campo: string };

/** Corpo JSON como mapa, ou `null` se não for objeto (array e escalar caem aqui). */
export function lerCorpo(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

/** Texto aparado; vazio vira `null`, porque coluna opcional guarda null, não "". */
function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

function validarRazaoSocial(
  valor: unknown
): ResultadoValidacao<string> {
  const razao = texto(valor);
  if (!razao) {
    return { ok: false, erro: "Informe a razão social.", campo: "razaoSocial" };
  }
  if (razao.length < 2) {
    return {
      ok: false,
      erro: "A razão social deve ter pelo menos 2 caracteres.",
      campo: "razaoSocial",
    };
  }
  return { ok: true, dados: razao };
}

/**
 * UF em duas letras. A entrada é normalizada para maiúsculas antes de conferir:
 * quem digita "sp" está certo do ponto de vista do usuário, e recusar isso só
 * gera suporte.
 */
function validarUf(valor: unknown): ResultadoValidacao<string | null> {
  const uf = texto(valor);
  if (!uf) return { ok: true, dados: null };
  const maiuscula = uf.toUpperCase();
  if (!/^[A-Z]{2}$/.test(maiuscula)) {
    return {
      ok: false,
      erro: "A UF deve ter exatamente 2 letras (exemplo: SP).",
      campo: "uf",
    };
  }
  return { ok: true, dados: maiuscula };
}

function validarSituacao(valor: unknown): ResultadoValidacao<string> {
  const situacao = texto(valor);
  if (!situacao) return { ok: true, dados: SITUACAO_EMPRESA.ATIVA };
  if (!SITUACOES_EMPRESA_VALIDAS.includes(situacao)) {
    return {
      ok: false,
      erro: `Situação inválida. Use uma destas: ${SITUACOES_EMPRESA_VALIDAS.join(
        ", "
      )}.`,
      campo: "situacao",
    };
  }
  return { ok: true, dados: situacao };
}

function validarTributoLocal(valor: unknown): ResultadoValidacao<string> {
  const tributo = texto(valor);
  if (!tributo) return { ok: true, dados: TRIBUTO_LOCAL.AMBOS };
  if (!TRIBUTOS_LOCAIS_VALIDOS.includes(tributo)) {
    return {
      ok: false,
      erro: `Tributo local inválido. Use uma destas opções: ${TRIBUTOS_LOCAIS_VALIDOS.join(
        ", "
      )}.`,
      campo: "tributoLocal",
    };
  }
  return { ok: true, dados: tributo };
}

/** Regime é obrigatório e fechado: é ele que escolhe o fluxo de etapas. */
export function validarRegime(valor: unknown): ResultadoValidacao<string> {
  const regime = texto(valor);
  if (!regime) {
    return {
      ok: false,
      erro: "Informe o regime tributário da empresa.",
      campo: "regime",
    };
  }
  if (!REGIMES_VALIDOS.includes(regime)) {
    return {
      ok: false,
      erro: `Regime inválido. Use uma destas opções: ${REGIMES_VALIDOS.join(
        ", "
      )}.`,
      campo: "regime",
    };
  }
  return { ok: true, dados: regime };
}

/**
 * Valida o corpo de criação de empresa. Não valida CNPJ: isso é `normalizarCnpj`,
 * porque o CNPJ tem tratamento próprio (duplicidade, máscara) na rota.
 */
export function validarPayloadEmpresa(
  body: unknown
): ResultadoValidacao<DadosEmpresa> {
  const corpo = lerCorpo(body);
  if (!corpo) {
    return {
      ok: false,
      erro: "Corpo da requisição inválido.",
      campo: "body",
    };
  }

  const razaoSocial = validarRazaoSocial(corpo.razaoSocial);
  if (!razaoSocial.ok) return razaoSocial;

  const regime = validarRegime(corpo.regime);
  if (!regime.ok) return regime;

  const situacao = validarSituacao(corpo.situacao);
  if (!situacao.ok) return situacao;

  const tributoLocal = validarTributoLocal(corpo.tributoLocal);
  if (!tributoLocal.ok) return tributoLocal;

  const uf = validarUf(corpo.uf);
  if (!uf.ok) return uf;

  // Data ausente é legítima (nem todo cadastro sabe a data de abertura); data
  // presente e ilegível não é, porque viraria início de vigência errado.
  let inicioAtividade: Date | null = null;
  if (corpo.inicioAtividade !== undefined && corpo.inicioAtividade !== null) {
    inicioAtividade = normalizarData(corpo.inicioAtividade);
    if (!inicioAtividade) {
      return {
        ok: false,
        erro: "Data de início de atividade inválida.",
        campo: "inicioAtividade",
      };
    }
  }

  return {
    ok: true,
    dados: {
      razaoSocial: razaoSocial.dados,
      nomeFantasia: texto(corpo.nomeFantasia),
      regime: regime.dados,
      situacao: situacao.dados,
      tributoLocal: tributoLocal.dados,
      uf: uf.dados,
      municipio: texto(corpo.municipio),
      inicioAtividade,
      userId: texto(corpo.userId),
      responsavelId: texto(corpo.responsavelId),
      observacoes: texto(corpo.observacoes),
    },
  };
}

/**
 * Valida o corpo do PATCH.
 *
 * Só entra no resultado a chave que veio no corpo — é o que diferencia "não
 * mexer neste campo" de "limpar este campo". `userId: null` desvincula o login;
 * `userId` ausente mantém o que está gravado.
 */
export function validarAtualizacaoEmpresa(
  body: unknown
): ResultadoValidacao<AtualizacaoEmpresa> {
  const corpo = lerCorpo(body);
  if (!corpo) {
    return { ok: false, erro: "Corpo da requisição inválido.", campo: "body" };
  }

  const dados: AtualizacaoEmpresa = {};

  if ("razaoSocial" in corpo) {
    const razaoSocial = validarRazaoSocial(corpo.razaoSocial);
    if (!razaoSocial.ok) return razaoSocial;
    dados.razaoSocial = razaoSocial.dados;
  }

  if ("situacao" in corpo) {
    // No PATCH, situação em branco não pode cair no default silenciosamente:
    // quem manda o campo está afirmando um valor.
    const situacao = validarSituacao(corpo.situacao);
    if (!situacao.ok) return situacao;
    dados.situacao = situacao.dados;
  }

  if ("tributoLocal" in corpo) {
    const tributoLocal = validarTributoLocal(corpo.tributoLocal);
    if (!tributoLocal.ok) return tributoLocal;
    dados.tributoLocal = tributoLocal.dados;
  }

  if ("uf" in corpo) {
    const uf = validarUf(corpo.uf);
    if (!uf.ok) return uf;
    dados.uf = uf.dados;
  }

  if ("nomeFantasia" in corpo) dados.nomeFantasia = texto(corpo.nomeFantasia);
  if ("municipio" in corpo) dados.municipio = texto(corpo.municipio);
  if ("userId" in corpo) dados.userId = texto(corpo.userId);
  if ("responsavelId" in corpo) {
    dados.responsavelId = texto(corpo.responsavelId);
  }
  if ("observacoes" in corpo) dados.observacoes = texto(corpo.observacoes);

  return { ok: true, dados };
}

/* -------------------------------------------------------------------------- */
/*                                  Vínculos                                  */
/* -------------------------------------------------------------------------- */

/**
 * Devolve os ids que não existem na tabela de usuários.
 *
 * `userId` e `responsavelId` são chaves estrangeiras. Sem esta conferência, um
 * id errado só estoura no banco e chega ao operador como 500, sem dizer qual
 * campo está errado.
 */
export async function usuariosInexistentes(
  ids: (string | null | undefined)[]
): Promise<string[]> {
  const alvos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (alvos.length === 0) return [];

  const encontrados = await prisma.user.findMany({
    where: { id: { in: alvos } },
    select: { id: true },
  });
  const existentes = new Set(encontrados.map((usuario) => usuario.id));
  return alvos.filter((id) => !existentes.has(id));
}
