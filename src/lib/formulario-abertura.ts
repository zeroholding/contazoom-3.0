/**
 * Formulário público de abertura de CNPJ: tipos, opções, moeda e validação.
 *
 * Substitui o Google Forms usado hoje pelo escritório. O defeito central do
 * formulário antigo era pluralizar tudo num campo só ("Nome(s) do(s) sócio(s)",
 * "CPF do(s) sócio(s)"), o que devolvia um blob de texto que alguém
 * desembaralhava à mão para descobrir qual CPF era de quem — e errar o
 * pareamento ali vira erro no contrato social. Aqui o sócio é um registro
 * repetido, com os campos dele dentro.
 *
 * ESTE ARQUIVO NÃO SABE O QUE É REACT. Só tipos, tabelas e funções puras, para a
 * mesma validação poder rodar no servidor quando a rota de recebimento existir.
 * Validação de cliente é conveniência; quem decide é o servidor, e reaproveitar
 * a função é o que garante que os dois não divirjam.
 *
 * A única dependência é `documento.ts`, que também não importa nada. Duplicar
 * `cpfValido` aqui criaria duas cópias do dígito verificador, e cópia divergente
 * é o pior defeito possível numa validação: a tela libera e o servidor recusa.
 *
 * Nesta fase não existe persistência. Nenhum tipo aqui é model de Prisma.
 */

import {
  cepValido,
  cnpjValido,
  cpfValido,
  formatarCnpj,
  somenteDigitos,
  telefoneValido,
} from "@/lib/documento";

/* -------------------------------------------------------------------------- */
/*                                  Domínio                                   */
/* -------------------------------------------------------------------------- */

export const ESTADO_CIVIL = {
  SOLTEIRO: "SOLTEIRO",
  CASADO: "CASADO",
  SEPARADO: "SEPARADO",
  DIVORCIADO: "DIVORCIADO",
  VIUVO: "VIUVO",
} as const;
export type EstadoCivil = (typeof ESTADO_CIVIL)[keyof typeof ESTADO_CIVIL];

/**
 * Cinco opções, sem o regime de bens embutido.
 *
 * O Google Forms tinha oito, fundindo duas perguntas: "Casado [Regime: COMUNHÃO
 * UNIVERSAL DE BENS]", "Casado [Regime: SEPARAÇÃO DE BENS]" e assim por diante.
 * São perguntas diferentes — a segunda só existe se a primeira for "Casado" — e
 * fundidas viravam uma lista longa que a pessoa lê rápido e erra.
 */
export const ESTADO_CIVIL_OPCOES: { valor: string; texto: string }[] = [
  { valor: ESTADO_CIVIL.SOLTEIRO, texto: "Solteiro(a)" },
  { valor: ESTADO_CIVIL.CASADO, texto: "Casado(a)" },
  { valor: ESTADO_CIVIL.SEPARADO, texto: "Separado(a)" },
  { valor: ESTADO_CIVIL.DIVORCIADO, texto: "Divorciado(a)" },
  { valor: ESTADO_CIVIL.VIUVO, texto: "Viúvo(a)" },
];

export const ESTADO_CIVIL_LABEL: Record<string, string> = {
  SOLTEIRO: "Solteiro(a)",
  CASADO: "Casado(a)",
  SEPARADO: "Separado(a)",
  DIVORCIADO: "Divorciado(a)",
  VIUVO: "Viúvo(a)",
};

export const REGIME_BENS = {
  COMUNHAO_UNIVERSAL: "COMUNHAO_UNIVERSAL",
  COMUNHAO_PARCIAL: "COMUNHAO_PARCIAL",
  SEPARACAO_BENS: "SEPARACAO_BENS",
  PARTICIPACAO_FINAL_AQUESTOS: "PARTICIPACAO_FINAL_AQUESTOS",
} as const;
export type RegimeBens = (typeof REGIME_BENS)[keyof typeof REGIME_BENS];

export const REGIME_BENS_OPCOES: { valor: string; texto: string }[] = [
  { valor: REGIME_BENS.COMUNHAO_PARCIAL, texto: "Comunhão parcial de bens" },
  { valor: REGIME_BENS.COMUNHAO_UNIVERSAL, texto: "Comunhão universal de bens" },
  { valor: REGIME_BENS.SEPARACAO_BENS, texto: "Separação de bens" },
  {
    valor: REGIME_BENS.PARTICIPACAO_FINAL_AQUESTOS,
    texto: "Participação final nos aquestos",
  },
];

export const REGIME_BENS_LABEL: Record<string, string> = {
  COMUNHAO_UNIVERSAL: "Comunhão universal de bens",
  COMUNHAO_PARCIAL: "Comunhão parcial de bens",
  SEPARACAO_BENS: "Separação de bens",
  PARTICIPACAO_FINAL_AQUESTOS: "Participação final nos aquestos",
};

export const ENQUADRAMENTO = {
  SIMPLES_NACIONAL: "SIMPLES_NACIONAL",
  LUCRO_PRESUMIDO: "LUCRO_PRESUMIDO",
  LUCRO_REAL: "LUCRO_REAL",
} as const;
export type Enquadramento =
  (typeof ENQUADRAMENTO)[keyof typeof ENQUADRAMENTO];

export const ENQUADRAMENTO_OPCOES: { valor: string; texto: string }[] = [
  { valor: ENQUADRAMENTO.SIMPLES_NACIONAL, texto: "Simples Nacional" },
  { valor: ENQUADRAMENTO.LUCRO_PRESUMIDO, texto: "Lucro Presumido" },
  { valor: ENQUADRAMENTO.LUCRO_REAL, texto: "Lucro Real" },
];

export const ENQUADRAMENTO_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
};

export const UF_OPCOES: { valor: string; texto: string }[] = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
].map((uf) => ({ valor: uf, texto: uf }));

/** Teto de sócios. Acima disso não é mais abertura simples de sociedade. */
export const MAXIMO_SOCIOS = 10;

/* -------------------------------------------------------------------------- */
/*                                   Tipos                                    */
/* -------------------------------------------------------------------------- */

export type Endereco = {
  /** Mascarado na tela. `somenteDigitos` no envio. */
  cep: string;
  logradouro: string;
  numero: string;
  /** Complemento DA PESSOA ("apto 42"), não o do ViaCEP ("lado ímpar"). */
  complemento: string;
  bairro: string;
  /** O ViaCEP chama de `localidade`. */
  cidade: string;
  uf: string;
};

export type Socio = {
  nome: string;
  /** Mascarado. `000.000.000-00`. */
  cpf: string;
  /** Mascarado. `(00) 00000-0000`. */
  telefone: string;
  email: string;
  profissao: string;
  estadoCivil: EstadoCivil | "";
  /** `""` quando não é casado. Ver `limparCondicionais`. */
  regimeBens: RegimeBens | "";
  /** `null` = não respondeu. Fato de cada pessoa, não do grupo. */
  contaGov: boolean | null;
  endereco: Endereco;
  /** Só existe do sócio 2 em diante. */
  mesmoEnderecoDoPrimeiro: boolean;
  temParticipacaoOutraEmpresa: boolean | null;
  /** Mascarado. `""` quando não tem participação. */
  outraEmpresaCnpj: string;
  outraEmpresaEnquadramento: Enquadramento | "";
  /**
   * Inteiro em CENTAVOS.
   *
   * Dinheiro em decimal não soma: `0.1 + 0.2` dá `0.30000000000000004`, e o
   * total de três sócios não fecharia com a soma mostrada na tela. O contrato
   * social sai daqui.
   */
  capitalCentavos: number;
  /**
   * Administrador é campo DO SÓCIO, não uma lista de nomes em paralelo. Remover
   * um sócio remove a marca dele de graça, sem sincronizar duas estruturas — e
   * é impossível informar um administrador que não é sócio, que era o defeito do
   * campo de texto livre "Quem irá exercer a administração da sociedade?".
   */
  administrador: boolean;
};

export type FormularioAbertura = {
  versao: 1;
  socios: Socio[];
  /** Três, todas obrigatórias e distintas. A Junta recusa nome já registrado. */
  razaoSocialOpcoes: [string, string, string];
  nomeFantasia: string;
  atividades: string;
  localEmpresa: "SOCIO" | "OUTRO" | "";
  /** Índice em `socios`. `null` quando `localEmpresa !== "SOCIO"`. */
  socioDoEndereco: number | null;
  enderecoEmpresa: Endereco;
  temIptu: boolean | null;
  /** `true` = em conjunto. `null` com um administrador só. */
  assinaturaConjunta: boolean | null;
  confirmouVeracidade: boolean;
};

/* -------------------------------------------------------------------------- */
/*                                  Vazios                                    */
/* -------------------------------------------------------------------------- */

export function enderecoVazio(): Endereco {
  return {
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  };
}

export function socioVazio(): Socio {
  return {
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    profissao: "",
    estadoCivil: "",
    regimeBens: "",
    contaGov: null,
    endereco: enderecoVazio(),
    mesmoEnderecoDoPrimeiro: false,
    temParticipacaoOutraEmpresa: null,
    outraEmpresaCnpj: "",
    outraEmpresaEnquadramento: "",
    capitalCentavos: 0,
    administrador: false,
  };
}

export function formularioVazio(): FormularioAbertura {
  return {
    versao: 1,
    socios: [socioVazio()],
    razaoSocialOpcoes: ["", "", ""],
    nomeFantasia: "",
    atividades: "",
    localEmpresa: "",
    socioDoEndereco: null,
    enderecoEmpresa: enderecoVazio(),
    temIptu: null,
    assinaturaConjunta: null,
    confirmouVeracidade: false,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Passos                                   */
/* -------------------------------------------------------------------------- */

export const PASSOS = [
  { chave: "socios", titulo: "Sócios", icone: "Users" },
  { chave: "empresa", titulo: "Empresa", icone: "Building2" },
  { chave: "sociedade", titulo: "Sociedade", icone: "Handshake" },
  { chave: "documentos", titulo: "Documentos", icone: "Paperclip" },
  { chave: "revisao", titulo: "Revisão", icone: "ClipboardCheck" },
] as const;

export const TOTAL_PASSOS = PASSOS.length;

/* -------------------------------------------------------------------------- */
/*                                   Moeda                                    */
/* -------------------------------------------------------------------------- */

/**
 * Máscara de moeda dos centavos para a esquerda: digitar `2`, `0`, `0`, `0`
 * produz `0,02` → `0,20` → `2,00` → `20,00`.
 *
 * É o único jeito que não exige a pessoa acertar onde fica a vírgula. Máscara
 * que espera a vírgula digitada transforma "20000" em "20000,00" quando a
 * pessoa queria 200,00 — e em capital social esse erro é de duas ordens de
 * grandeza.
 *
 * Não existe formatação de moeda em `formato.ts`, por isso mora aqui.
 */
export function mascaraMoeda(valor: string): string {
  const d = somenteDigitos(valor).replace(/^0+(?=\d)/, "").slice(0, 12);
  if (!d) return "";
  const cheio = d.padStart(3, "0");
  const inteiro = cheio.slice(0, -2);
  const centavos = cheio.slice(-2);
  return `${agruparMilhar(inteiro)},${centavos}`;
}

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Do texto mascarado para o inteiro que vai no estado. */
export function centavosDeTexto(mascarado: string): number {
  const d = somenteDigitos(mascarado).slice(0, 12);
  return d ? Number.parseInt(d, 10) : 0;
}

/** Do inteiro para o texto do campo. `0` vira `""` para o campo nascer vazio. */
export function textoDeCentavos(centavos: number): string {
  if (!centavos) return "";
  return mascaraMoeda(String(centavos));
}

/** Para leitura: `R$ 20.000,00`. */
export function moedaDeCentavos(centavos: number): string {
  return `R$ ${mascaraMoeda(String(centavos || 0)) || "0,00"}`;
}

export function capitalTotal(socios: Socio[]): number {
  return socios.reduce((soma, s) => soma + (s.capitalCentavos || 0), 0);
}

/**
 * Participação de cada sócio, com uma casa decimal.
 *
 * Derivada, nunca perguntada. É o dado que o contrato social exige e que o
 * formulário antigo não tinha: "Capital Social investido por cada sócio" era um
 * campo de texto, e voltava "uns 10 mil cada".
 */
export function percentualDoSocio(socio: Socio, total: number): string {
  if (!total) return "0,0%";
  const pct = ((socio.capitalCentavos || 0) / total) * 100;
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

/* -------------------------------------------------------------------------- */
/*                            Validações de campo                             */
/* -------------------------------------------------------------------------- */

/** Sem acento, sem caixa, sem espaço dobrado. Para comparar nome de empresa. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nome completo: duas palavras de duas letras ou mais.
 *
 * "João" sozinho não é nome completo, e é exatamente o que vai para a JUCESP no
 * contrato social. Recusar aqui custa uma correção; recusar na Junta custa o
 * processo inteiro.
 */
export function nomeCompletoValido(nome: string): boolean {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length >= 2);
  return partes.length >= 2;
}

/**
 * E-mail com arroba, domínio e ponto no domínio.
 *
 * Deliberadamente frouxo. Regex de RFC completo recusa endereço válido e é onde
 * validação de e-mail costuma dar prejuízo; o que se quer aqui é pegar "joao"
 * e "joao@gmail" antes de o escritório mandar documento para o vazio.
 */
export function emailValido(email: string): boolean {
  const v = email.trim();
  if (/\s/.test(v)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v);
}

export function enderecoCompleto(e: Endereco): boolean {
  return (
    cepValido(e.cep) &&
    !!e.logradouro.trim() &&
    !!e.numero.trim() &&
    !!e.bairro.trim() &&
    !!e.cidade.trim() &&
    !!e.uf.trim()
  );
}

/** Endereço em uma linha, para revisão e para o resumo. */
export function enderecoEmLinha(e: Endereco): string {
  if (!e.logradouro.trim() && !e.cep.trim()) return "—";
  const inicio = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const partes = [
    e.complemento.trim() ? `${inicio} — ${e.complemento.trim()}` : inicio,
    e.bairro,
    [e.cidade, e.uf].filter(Boolean).join("/"),
    e.cep,
  ].filter((p) => p && p.trim());
  return partes.join(" · ");
}

/* -------------------------------------------------------------------------- */
/*                              Condicionais                                  */
/* -------------------------------------------------------------------------- */

/**
 * Zera o que deixou de se aplicar.
 *
 * Chamada a cada mudança de resposta que comanda condicional. Sem isso alguém
 * marca "Casado", escolhe "Separação de bens", volta para "Solteiro" e ENVIA um
 * regime de bens que a tela não mostrava mais — e o contrato social sai errado
 * com um dado que ninguém digitou de propósito.
 *
 * O par disto na tela é não usar `display:none`: campo escondido por CSS
 * continua no DOM, continua validando e recebe foco no Tab. Condicional é
 * renderização condicional, não visibilidade.
 */
export function limparCondicionais(
  dados: FormularioAbertura
): FormularioAbertura {
  const socios = dados.socios.map((s, i) => {
    const limpo: Socio = { ...s };

    if (limpo.estadoCivil !== ESTADO_CIVIL.CASADO) limpo.regimeBens = "";

    if (limpo.temParticipacaoOutraEmpresa !== true) {
      limpo.outraEmpresaCnpj = "";
      limpo.outraEmpresaEnquadramento = "";
    }

    // "Mesmo endereço do sócio 1" não existe para o próprio sócio 1.
    if (i === 0) limpo.mesmoEnderecoDoPrimeiro = false;

    return limpo;
  });

  const umSocio = socios.length === 1;

  // Com um sócio a administração é dele, sem pergunta e sem "como assinam".
  if (umSocio) socios[0] = { ...socios[0], administrador: true };

  const administradores = socios.filter((s) => s.administrador).length;

  return {
    ...dados,
    socios,
    assinaturaConjunta: administradores > 1 ? dados.assinaturaConjunta : null,
    socioDoEndereco:
      dados.localEmpresa === "SOCIO"
        ? // Com um sócio, é dele e não se pergunta.
          umSocio
          ? 0
          : dados.socioDoEndereco !== null &&
            dados.socioDoEndereco < socios.length
          ? dados.socioDoEndereco
          : null
        : null,
    enderecoEmpresa:
      dados.localEmpresa === "SOCIO" ? enderecoVazio() : dados.enderecoEmpresa,
  };
}

/** O endereço que vale para a empresa, já resolvendo "é o do sócio X". */
export function enderecoEfetivoDaEmpresa(
  dados: FormularioAbertura
): Endereco {
  if (dados.localEmpresa === "SOCIO" && dados.socioDoEndereco !== null) {
    return enderecoEfetivoDoSocio(dados, dados.socioDoEndereco);
  }
  return dados.enderecoEmpresa;
}

/** O endereço que vale para o sócio, já resolvendo "mesmo do sócio 1". */
export function enderecoEfetivoDoSocio(
  dados: FormularioAbertura,
  indice: number
): Endereco {
  const socio = dados.socios[indice];
  if (!socio) return enderecoVazio();
  if (indice > 0 && socio.mesmoEnderecoDoPrimeiro) {
    return dados.socios[0]?.endereco ?? enderecoVazio();
  }
  return socio.endereco;
}

/* -------------------------------------------------------------------------- */
/*                                Documentos                                  */
/* -------------------------------------------------------------------------- */

export type SlotDocumento = {
  /** Chave estável do slot. É a chave do `Map` de arquivos na tela. */
  chave: string;
  rotulo: string;
  ajuda?: string;
  obrigatorio: boolean;
};

export type GrupoDocumentos = {
  chave: string;
  /** Nome da pessoa, ou "Da empresa". */
  titulo: string;
  slots: SlotDocumento[];
};

/**
 * Todo arquivo tem dono.
 *
 * O Google Forms pedia "RG ou CNH do(s) Sócio(s) — faça upload de até 5
 * arquivos": chegavam quatro fotos chamadas `IMG_2841.jpg` e ninguém sabia de
 * quem era nenhuma. Aqui cada slot pertence a uma pessoa nomeada, e o slot de
 * contrato social só existe para quem declarou participação em outra empresa.
 */
export function gruposDeDocumentos(
  dados: FormularioAbertura
): GrupoDocumentos[] {
  const grupos: GrupoDocumentos[] = dados.socios.map((socio, i) => {
    const slots: SlotDocumento[] = [
      {
        chave: `socio.${i}.identidade`,
        rotulo: "RG ou CNH",
        ajuda: "Frente e verso, se for RG.",
        obrigatorio: true,
      },
      {
        chave: `socio.${i}.residencia`,
        rotulo: "Comprovante de residência",
        ajuda: "Conta de luz, água ou telefone dos últimos 3 meses.",
        obrigatorio: true,
      },
    ];

    if (socio.temParticipacaoOutraEmpresa === true) {
      const cnpj = somenteDigitos(socio.outraEmpresaCnpj);
      slots.push({
        chave: `socio.${i}.contrato`,
        rotulo: cnpj
          ? `Contrato social de ${formatarCnpj(cnpj)}`
          : "Contrato social da outra empresa",
        ajuda: `Porque ${primeiroNome(socio.nome) || "este sócio"} declarou participação societária em outra empresa.`,
        obrigatorio: true,
      });
    }

    return {
      chave: `socio.${i}`,
      titulo: socio.nome.trim() || `Sócio ${i + 1}`,
      slots,
    };
  });

  const daEmpresa: SlotDocumento[] = [];
  if (dados.temIptu === true) {
    daEmpresa.push({
      chave: "empresa.iptu",
      rotulo: "IPTU do endereço da empresa",
      ajuda: "Opcional. Ajuda no processo de viabilidade.",
      obrigatorio: false,
    });
  }
  if (daEmpresa.length) {
    grupos.push({ chave: "empresa", titulo: "Da empresa", slots: daEmpresa });
  }

  return grupos;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/**
 * Prefixo do arquivo com o dono dentro do nome.
 *
 * Mesmo que alguém baixe os arquivos soltos de uma pasta, `socio-1-maria-silva`
 * diz de quem é. Quem normaliza acento e caractere proibido é `nomeParaDisco`
 * de `tarefa-anexo.ts`, aplicado depois disto.
 */
export function nomeDoArquivoComDono(
  slot: string,
  dono: string,
  nomeOriginal: string
): string {
  const parte = (t: string) =>
    normalizar(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const chave = slot.replace(/\./g, "-");
  return [parte(dono) || chave, parte(chave), nomeOriginal]
    .filter(Boolean)
    .join("--");
}

/* -------------------------------------------------------------------------- */
/*                          Validação por passo                               */
/* -------------------------------------------------------------------------- */

/**
 * Erros por caminho de campo: `socios.0.cpf`, `razaoSocial.1`, `empresa.cep`.
 *
 * Mapa em vez de lista para o campo achar o próprio erro sem varrer nada, e o
 * caminho é o que a barra de erro usa para levar o foco ao primeiro campo
 * errado.
 */
export type Erros = Record<string, string>;

export function chaveSocio(indice: number, campo: string): string {
  return `socios.${indice}.${campo}`;
}

function validarEndereco(
  erros: Erros,
  prefixo: string,
  e: Endereco,
  comoChama: string
): void {
  if (!somenteDigitos(e.cep)) {
    erros[`${prefixo}.cep`] = `Informe o CEP ${comoChama}`;
  } else if (!cepValido(e.cep)) {
    erros[`${prefixo}.cep`] = "CEP inválido";
  }
  if (!e.logradouro.trim()) erros[`${prefixo}.logradouro`] = "Informe a rua";
  if (!e.numero.trim()) erros[`${prefixo}.numero`] = "Informe o número";
  if (!e.bairro.trim()) erros[`${prefixo}.bairro`] = "Informe o bairro";
  if (!e.cidade.trim()) erros[`${prefixo}.cidade`] = "Informe a cidade";
  if (!e.uf.trim()) erros[`${prefixo}.uf`] = "Informe a UF";
}

export function validarSocios(dados: FormularioAbertura): Erros {
  const erros: Erros = {};

  dados.socios.forEach((socio, i) => {
    const k = (campo: string) => chaveSocio(i, campo);

    if (!socio.nome.trim()) {
      erros[k("nome")] = "Informe o nome completo";
    } else if (!nomeCompletoValido(socio.nome)) {
      erros[k("nome")] = "Informe o nome completo, com sobrenome";
    }

    const cpf = somenteDigitos(socio.cpf);
    if (!cpf) {
      erros[k("cpf")] = "Informe o CPF";
    } else if (!cpfValido(cpf)) {
      erros[k("cpf")] =
        cpf.length < 11 ? "CPF incompleto" : "CPF inválido, confira os dígitos";
    } else {
      // CPF repetido entre sócios. O formulário antigo pedia "CPF do(s)
      // sócio(s)" num campo só, então nem existia o conceito de repetido.
      const antes = dados.socios.findIndex(
        (outro, j) => j < i && somenteDigitos(outro.cpf) === cpf
      );
      if (antes >= 0) {
        erros[k("cpf")] = `Este CPF já foi informado no Sócio ${antes + 1}`;
      }
    }

    const tel = somenteDigitos(socio.telefone);
    if (!tel) {
      erros[k("telefone")] = "Informe o telefone";
    } else if (!telefoneValido(tel)) {
      erros[k("telefone")] =
        tel.length < 10 ? "Telefone incompleto" : "Telefone inválido";
    }

    if (!socio.email.trim()) {
      erros[k("email")] = "Informe o e-mail";
    } else if (!emailValido(socio.email)) {
      erros[k("email")] = "E-mail inválido";
    }

    if (!socio.profissao.trim()) erros[k("profissao")] = "Informe a profissão";

    if (!socio.estadoCivil) erros[k("estadoCivil")] = "Selecione o estado civil";

    if (socio.estadoCivil === ESTADO_CIVIL.CASADO && !socio.regimeBens) {
      erros[k("regimeBens")] = "Selecione o regime de bens";
    }

    if (socio.contaGov === null) {
      erros[k("contaGov")] = "Responda se possui conta GOV.BR";
    }

    if (socio.temParticipacaoOutraEmpresa === null) {
      erros[k("temParticipacaoOutraEmpresa")] =
        "Responda se participa de outra empresa";
    }

    if (socio.temParticipacaoOutraEmpresa === true) {
      const cnpj = somenteDigitos(socio.outraEmpresaCnpj);
      if (!cnpj) {
        erros[k("outraEmpresaCnpj")] = "Informe o CNPJ da outra empresa";
      } else if (!cnpjValido(cnpj)) {
        erros[k("outraEmpresaCnpj")] =
          cnpj.length < 14 ? "CNPJ incompleto" : "CNPJ inválido";
      }
      if (!socio.outraEmpresaEnquadramento) {
        erros[k("outraEmpresaEnquadramento")] =
          "Selecione o enquadramento dela";
      }
    }

    // Quem copia o endereço do sócio 1 não tem endereço próprio para validar.
    if (!(i > 0 && socio.mesmoEnderecoDoPrimeiro)) {
      validarEndereco(erros, `socios.${i}.endereco`, socio.endereco, "do sócio");
    }
  });

  return erros;
}

/** Alimenta a escolha de CNAE (etapa 2 do fluxo). "Vendas" não alimenta nada. */
export const MINIMO_ATIVIDADES = 30;

export function validarEmpresa(dados: FormularioAbertura): Erros {
  const erros: Erros = {};

  dados.razaoSocialOpcoes.forEach((nome, i) => {
    if (!nome.trim()) {
      erros[`razaoSocial.${i}`] = `Informe a ${i + 1}ª opção de nome`;
      return;
    }
    // Três opções iguais variando caixa ou acento são uma opção só, e a Junta
    // devolveria o processo. O enunciado do Google implorava "Sim, precisam ser
    // 03" num campo de texto que aceitava qualquer quantidade.
    const igual = dados.razaoSocialOpcoes.findIndex(
      (outro, j) => j < i && normalizar(outro) === normalizar(nome)
    );
    if (igual >= 0) {
      erros[`razaoSocial.${i}`] =
        `Igual à ${igual + 1}ª opção. Informe um nome diferente`;
    }
  });

  if (!dados.nomeFantasia.trim()) {
    erros["nomeFantasia"] = "Informe o nome fantasia";
  }

  const atividades = dados.atividades.trim();
  if (!atividades) {
    erros["atividades"] = "Descreva as atividades da empresa";
  } else if (atividades.length < MINIMO_ATIVIDADES) {
    erros["atividades"] =
      "Descreva com mais detalhe: isso define os CNAEs da empresa";
  }

  if (!dados.localEmpresa) {
    erros["localEmpresa"] = "Informe onde a empresa vai funcionar";
  }

  if (dados.localEmpresa === "SOCIO" && dados.socioDoEndereco === null) {
    erros["socioDoEndereco"] = "Selecione de qual sócio é o endereço";
  }

  if (dados.localEmpresa === "OUTRO") {
    validarEndereco(erros, "empresa", dados.enderecoEmpresa, "da empresa");
  }

  if (dados.temIptu === null) {
    erros["temIptu"] = "Responda se tem o IPTU do endereço";
  }

  return erros;
}

export function validarSociedade(dados: FormularioAbertura): Erros {
  const erros: Erros = {};

  dados.socios.forEach((socio, i) => {
    if (!socio.capitalCentavos) {
      erros[chaveSocio(i, "capitalCentavos")] =
        "Informe o valor investido por este sócio";
    }
  });

  const administradores = dados.socios.filter((s) => s.administrador).length;
  if (!administradores) {
    erros["administradores"] = "Marque quem vai administrar a sociedade";
  }

  if (administradores > 1 && dados.assinaturaConjunta === null) {
    erros["assinaturaConjunta"] = "Informe como os administradores assinam";
  }

  return erros;
}

/**
 * Documentos obrigatórios presentes.
 *
 * Recebe só as chaves que têm arquivo, porque o `File` em si mora na tela: ele
 * não é serializável e não pode entrar no estado que vai para o `localStorage`.
 */
export function validarDocumentos(
  dados: FormularioAbertura,
  chavesComArquivo: Set<string>
): Erros {
  const erros: Erros = {};
  gruposDeDocumentos(dados).forEach((grupo) => {
    grupo.slots.forEach((slot) => {
      if (slot.obrigatorio && !chavesComArquivo.has(slot.chave)) {
        erros[slot.chave] = `Anexe ${slot.rotulo.toLowerCase()}`;
      }
    });
  });
  return erros;
}

export function validarRevisao(dados: FormularioAbertura): Erros {
  const erros: Erros = {};
  if (!dados.confirmouVeracidade) {
    erros["confirmouVeracidade"] = "Confirme que os dados são verdadeiros";
  }
  return erros;
}

/** Validação do passo pelo índice, para a navegação não precisar de `switch`. */
export function validarPasso(
  passo: number,
  dados: FormularioAbertura,
  chavesComArquivo: Set<string>
): Erros {
  switch (passo) {
    case 0:
      return validarSocios(dados);
    case 1:
      return validarEmpresa(dados);
    case 2:
      return validarSociedade(dados);
    case 3:
      return validarDocumentos(dados, chavesComArquivo);
    case 4:
      return validarRevisao(dados);
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Envio                                     */
/* -------------------------------------------------------------------------- */

/**
 * Payload do envio, com documento sem máscara.
 *
 * Existe agora, sem rota que o receba, porque é o contrato: quando a rota for
 * escrita, ela recebe exatamente isto e revalida com as mesmas funções deste
 * arquivo. Definir depois seria redesenhar a tela depois.
 */
export function payloadDeEnvio(dados: FormularioAbertura) {
  const total = capitalTotal(dados.socios);
  return {
    versao: dados.versao,
    socios: dados.socios.map((s, i) => ({
      nome: s.nome.trim(),
      cpf: somenteDigitos(s.cpf),
      telefone: somenteDigitos(s.telefone),
      email: s.email.trim(),
      profissao: s.profissao.trim(),
      estadoCivil: s.estadoCivil,
      regimeBens: s.regimeBens,
      contaGov: s.contaGov,
      endereco: enderecoParaEnvio(enderecoEfetivoDoSocio(dados, i)),
      temParticipacaoOutraEmpresa: s.temParticipacaoOutraEmpresa,
      outraEmpresaCnpj: somenteDigitos(s.outraEmpresaCnpj),
      outraEmpresaEnquadramento: s.outraEmpresaEnquadramento,
      capitalCentavos: s.capitalCentavos,
      participacao: percentualDoSocio(s, total),
      administrador: s.administrador,
    })),
    capitalTotalCentavos: total,
    razaoSocialOpcoes: dados.razaoSocialOpcoes.map((n) => n.trim()),
    nomeFantasia: dados.nomeFantasia.trim(),
    atividades: dados.atividades.trim(),
    enderecoEmpresa: enderecoParaEnvio(enderecoEfetivoDaEmpresa(dados)),
    enderecoEmpresaEhDeSocio: dados.localEmpresa === "SOCIO",
    temIptu: dados.temIptu,
    assinaturaConjunta: dados.assinaturaConjunta,
  };
}

function enderecoParaEnvio(e: Endereco) {
  return { ...e, cep: somenteDigitos(e.cep) };
}
