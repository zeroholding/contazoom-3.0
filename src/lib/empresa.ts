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
  cepValido,
  cnpjValido,
  cpfValido,
  formatarCnpj,
  limparInscricao,
  somenteDigitos,
} from "@/lib/documento";
import {
  PLANO_INTERNO,
  PLANOS_INTERNOS_VALIDOS,
  REGIMES_VALIDOS,
  SITUACAO_EMPRESA,
  SITUACOES_EMPRESA_VALIDAS,
  TRIBUTO_LOCAL,
  TRIBUTOS_LOCAIS_VALIDOS,
  situacaoDoPlano,
} from "@/lib/tarefa-etapas";

/**
 * `formatarCnpj` continua sendo importado daqui por três rotas. O cálculo mudou
 * de casa para `src/lib/documento.ts` (que não importa nada e por isso serve ao
 * navegador também); o reexport evita mexer nos chamadores só por causa disso.
 */
export { formatarCnpj };

/* -------------------------------------------------------------------------- */
/*                                    CNPJ                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoCnpj =
  | { ok: true; digitos: string }
  | { ok: false; erro: string };

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
  const digitos = somenteDigitos(bruto);

  if (!digitos) return { ok: false, erro: "Informe o CNPJ da empresa." };
  if (digitos.length !== 14) {
    return { ok: false, erro: "O CNPJ deve ter 14 dígitos." };
  }
  if (!cnpjValido(digitos)) {
    return {
      ok: false,
      erro: "CNPJ inválido: o dígito verificador não confere.",
    };
  }

  return { ok: true, digitos };
}

/**
 * CNPJ OPCIONAL.
 *
 * Empresa em abertura não tem CNPJ, e a regra nova do módulo é que todo processo
 * de legalização nasce atrelado a uma empresa já cadastrada — inclusive a
 * abertura. Então o cadastro tem de aceitar empresa sem CNPJ, e a coluna virou
 * `String?` com `@unique` (no Postgres, `unique` permite vários NULL, então
 * várias empresas em abertura convivem sem conflito).
 *
 * Ausente devolve `null`; presente e torto devolve erro. Ausente e torto são
 * coisas diferentes: a primeira é cadastro legítimo, a segunda é digitação.
 */
export function normalizarCnpjOpcional(
  valor: unknown
): { ok: true; digitos: string | null } | { ok: false; erro: string } {
  if (valor === undefined || valor === null) return { ok: true, digitos: null };
  if (typeof valor === "string" && !valor.trim()) {
    return { ok: true, digitos: null };
  }
  const resultado = normalizarCnpj(valor);
  if (!resultado.ok) return resultado;
  return { ok: true, digitos: resultado.digitos };
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
  grupo: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  regime: string;
  planoInterno: string;
  situacao: string;
  tributoLocal: string;
  inscricaoMunicipal: string | null;
  inscricaoEstadual: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  uf: string | null;
  municipio: string | null;
  responsavelOperacional: string | null;
  socioAdmNome: string | null;
  socioAdmCpf: string | null;
  inicioAtividade: Date | null;
  userId: string | null;
  responsavelId: string | null;
  observacoes: string | null;
};

/**
 * Campos editáveis pelo PATCH.
 *
 * `regime` fica de fora porque mudar regime tem rota própria
 * (`POST /empresas/[id]/regime`), que fecha a vigência anterior e abre a nova —
 * um UPDATE direto reescreveria o passado fiscal.
 *
 * `cnpj` entra agora, e é mudança de comportamento: antes era imutável porque era
 * a identidade da empresa. Com empresa em abertura sendo cadastrada SEM CNPJ, o
 * momento em que o CNPJ sai da Junta é justamente quando ele precisa ser
 * gravado. A rota só permite preencher um CNPJ vazio, nunca trocar um existente.
 */
export type AtualizacaoEmpresa = Partial<
  Omit<DadosEmpresa, "regime" | "inicioAtividade">
> & { cnpj?: string | null };

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

/**
 * Plano interno ContaZoom.
 *
 * Fechado como o regime, e com default: o cadastro tem de aceitar quem esqueceu
 * de escolher, e "Plano Simples" é o plano da maior parte da carteira. Recusar o
 * cadastro por causa disso trocaria um dado corrigível por um cadastro perdido.
 */
export function validarPlanoInterno(valor: unknown): ResultadoValidacao<string> {
  const plano = texto(valor);
  if (!plano) return { ok: true, dados: PLANO_INTERNO.PLANO_SIMPLES };
  if (!PLANOS_INTERNOS_VALIDOS.includes(plano)) {
    return {
      ok: false,
      erro: `Plano interno inválido. Use uma destas opções: ${PLANOS_INTERNOS_VALIDOS.join(
        ", "
      )}.`,
      campo: "planoInterno",
    };
  }
  return { ok: true, dados: plano };
}

/**
 * CEP: guardado só com dígitos, como CNPJ e CPF.
 *
 * Vazio é legítimo — muito cliente é cadastrado antes de o endereço fechar. Já
 * CEP presente e torto não passa: endereço é o que vai para a Junta e para a
 * Prefeitura, e CEP errado volta como exigência semanas depois.
 */
function validarCep(valor: unknown): ResultadoValidacao<string | null> {
  const bruto = texto(valor);
  if (!bruto) return { ok: true, dados: null };
  const digitos = somenteDigitos(bruto);
  if (!cepValido(digitos)) {
    return {
      ok: false,
      erro: "CEP inválido. Informe os 8 dígitos.",
      campo: "cep",
    };
  }
  return { ok: true, dados: digitos };
}

/** CPF do sócio administrador. Opcional, mas se vier tem de ter DV correto. */
function validarSocioAdmCpf(valor: unknown): ResultadoValidacao<string | null> {
  const bruto = texto(valor);
  if (!bruto) return { ok: true, dados: null };
  const digitos = somenteDigitos(bruto);
  if (digitos.length !== 11) {
    return {
      ok: false,
      erro: "O CPF do sócio administrador deve ter 11 dígitos.",
      campo: "socioAdmCpf",
    };
  }
  if (!cpfValido(digitos)) {
    return {
      ok: false,
      erro: "CPF do sócio administrador inválido: o dígito verificador não confere.",
      campo: "socioAdmCpf",
    };
  }
  return { ok: true, dados: digitos };
}

/**
 * Inscrição estadual e municipal: só higienizadas, nunca validadas por DV.
 *
 * Cada estado tem regra própria (SP tem 12 dígitos, RJ tem 8, MG tem 13) e cada
 * prefeitura define o formato da municipal. Implementar 27 algoritmos para um
 * campo de cadastro trocaria um problema pequeno — dado torto — por um grande:
 * recusar dado certo de um estado cuja regra foi transcrita errada aqui.
 * "ISENTO" passa intacto, porque é valor legítimo de inscrição estadual.
 */
function inscricao(valor: unknown): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  const limpo = limparInscricao(bruto);
  return limpo ? limpo : null;
}

/*
 * Telefone NÃO tem campo no cadastro de empresa.
 *
 * O escritório listou dez campos e escreveu "ter somente estes campos para
 * inserir". Telefone do responsável operacional seria útil, mas acrescentar
 * campo que ninguém pediu é o que faz formulário virar formulário longo. A
 * máscara e a validação de telefone existem em `src/lib/documento.ts` e estão
 * testadas; quando o campo for pedido, é uma linha aqui e um `EntradaDocumento`
 * na tela.
 */

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

  const planoInterno = validarPlanoInterno(corpo.planoInterno);
  if (!planoInterno.ok) return planoInterno;

  const tributoLocal = validarTributoLocal(corpo.tributoLocal);
  if (!tributoLocal.ok) return tributoLocal;

  const uf = validarUf(corpo.uf);
  if (!uf.ok) return uf;

  const cep = validarCep(corpo.cep);
  if (!cep.ok) return cep;

  const socioAdmCpf = validarSocioAdmCpf(corpo.socioAdmCpf);
  if (!socioAdmCpf.ok) return socioAdmCpf;

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

  /**
   * Situação DERIVADA, não digitada.
   *
   * O cadastro deixou de ter campo "Situação": quem responde por isso agora é o
   * plano interno, e empresa sem CNPJ é "em abertura" por definição. `situacao`
   * continua gravada porque `abrir-mes`, o painel e a tela de detalhe leem essa
   * coluna, e porque ENCERRADA guarda algo que plano nenhum carrega.
   *
   * Um `situacao` explícito no corpo ainda vence: é como a rota de encerramento e
   * um script de correção afirmam ENCERRADA, que não é derivável de plano.
   */
  const temCnpj = Boolean(somenteDigitos(String(corpo.cnpj ?? "")).length === 14);
  let situacao = situacaoDoPlano(planoInterno.dados, temCnpj);
  if (corpo.situacao !== undefined && corpo.situacao !== null && corpo.situacao !== "") {
    const informada = validarSituacao(corpo.situacao);
    if (!informada.ok) return informada;
    situacao = informada.dados;
  }

  return {
    ok: true,
    dados: {
      grupo: texto(corpo.grupo),
      razaoSocial: razaoSocial.dados,
      nomeFantasia: texto(corpo.nomeFantasia),
      regime: regime.dados,
      planoInterno: planoInterno.dados,
      situacao,
      tributoLocal: tributoLocal.dados,
      inscricaoMunicipal: inscricao(corpo.inscricaoMunicipal),
      inscricaoEstadual: inscricao(corpo.inscricaoEstadual),
      cep: cep.dados,
      logradouro: texto(corpo.logradouro),
      numero: texto(corpo.numero)?.slice(0, 20) ?? null,
      complemento: texto(corpo.complemento),
      bairro: texto(corpo.bairro),
      uf: uf.dados,
      municipio: texto(corpo.municipio),
      responsavelOperacional: texto(corpo.responsavelOperacional),
      socioAdmNome: texto(corpo.socioAdmNome),
      socioAdmCpf: socioAdmCpf.dados,
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
  body: unknown,
  /**
   * CNPJ gravado hoje. A rota passa porque só ela leu a empresa, e sem isso o
   * recálculo de `situacao` não sabe distinguir empresa em abertura de empresa
   * com CNPJ — e marcaria uma empresa sem CNPJ como ATIVA ao mudar o plano.
   */
  contexto: { cnpjAtual?: string | null; planoAtual?: string | null } = {}
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

  if ("planoInterno" in corpo) {
    const planoInterno = validarPlanoInterno(corpo.planoInterno);
    if (!planoInterno.ok) return planoInterno;
    dados.planoInterno = planoInterno.dados;
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

  if ("cep" in corpo) {
    const cep = validarCep(corpo.cep);
    if (!cep.ok) return cep;
    dados.cep = cep.dados;
  }

  if ("socioAdmCpf" in corpo) {
    const cpf = validarSocioAdmCpf(corpo.socioAdmCpf);
    if (!cpf.ok) return cpf;
    dados.socioAdmCpf = cpf.dados;
  }

  if ("cnpj" in corpo) {
    const cnpj = normalizarCnpjOpcional(corpo.cnpj);
    if (!cnpj.ok) return { ok: false, erro: cnpj.erro, campo: "cnpj" };
    dados.cnpj = cnpj.digitos;
  }

  if ("grupo" in corpo) dados.grupo = texto(corpo.grupo);
  if ("nomeFantasia" in corpo) dados.nomeFantasia = texto(corpo.nomeFantasia);
  if ("inscricaoMunicipal" in corpo) {
    dados.inscricaoMunicipal = inscricao(corpo.inscricaoMunicipal);
  }
  if ("inscricaoEstadual" in corpo) {
    dados.inscricaoEstadual = inscricao(corpo.inscricaoEstadual);
  }
  if ("logradouro" in corpo) dados.logradouro = texto(corpo.logradouro);
  if ("numero" in corpo) {
    dados.numero = texto(corpo.numero)?.slice(0, 20) ?? null;
  }
  if ("complemento" in corpo) dados.complemento = texto(corpo.complemento);
  if ("bairro" in corpo) dados.bairro = texto(corpo.bairro);
  if ("municipio" in corpo) dados.municipio = texto(corpo.municipio);
  if ("responsavelOperacional" in corpo) {
    dados.responsavelOperacional = texto(corpo.responsavelOperacional);
  }
  if ("socioAdmNome" in corpo) dados.socioAdmNome = texto(corpo.socioAdmNome);
  if ("userId" in corpo) dados.userId = texto(corpo.userId);
  if ("responsavelId" in corpo) {
    dados.responsavelId = texto(corpo.responsavelId);
  }
  if ("observacoes" in corpo) dados.observacoes = texto(corpo.observacoes);

  /**
   * Plano mudou e situação não veio no corpo: a situação é recalculada.
   *
   * É o que mantém as duas colunas coerentes sem obrigar cada chamador a saber
   * da regra. Quem manda `situacao` explicitamente está afirmando um valor
   * (ENCERRADA, tipicamente) e não é sobrescrito — a linha acima já gravou.
   *
   * O `temCnpj` sai do CNPJ que o próprio PATCH está gravando; se ele não mexe
   * em CNPJ, vale o que já está no banco, que a rota informa em `contexto`.
   */
  const situacaoDerivavel =
    dados.planoInterno !== undefined && dados.situacao === undefined;

  if (situacaoDerivavel) {
    const temCnpj =
      dados.cnpj !== undefined
        ? Boolean(dados.cnpj)
        : Boolean(contexto.cnpjAtual);
    dados.situacao = situacaoDoPlano(dados.planoInterno, temCnpj);
  }

  // Mesma coisa no sentido inverso: preencher o CNPJ de uma empresa em abertura
  // tira ela de EM_ABERTURA. É o momento em que o processo de abertura terminou,
  // e deixar a empresa marcada como "em abertura" depois de ter CNPJ a manteria
  // fora da geração mensal de competência para sempre.
  if (
    !situacaoDerivavel &&
    dados.situacao === undefined &&
    dados.cnpj &&
    !contexto.cnpjAtual
  ) {
    dados.situacao = situacaoDoPlano(contexto.planoAtual ?? null, true);
  }

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
