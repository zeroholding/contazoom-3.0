/**
 * Máscara e validação de CPF, CNPJ, CEP e telefone.
 *
 * ARQUIVO SEM IMPORTS, de propósito.
 *
 * `src/lib/empresa.ts` já tinha o dígito verificador de CNPJ, mas importa
 * `@/lib/prisma` — então qualquer componente `"use client"` que quisesse validar
 * um CNPJ na digitação arrastaria o Prisma para o bundle do navegador. E
 * `EmpresasListaView.tsx` tinha a própria `mascaraCnpj` copiada, sem validação
 * nenhuma. Resultado prático: o formulário aceitava CNPJ inexistente e só
 * descobria no 400 da rota, que o operador lê como defeito do sistema.
 *
 * Aqui vive a regra pura, usada nos dois lados:
 *
 *   - o navegador formata enquanto se digita e avisa antes de enviar
 *   - a rota revalida, porque cliente não é autoridade sobre nada
 *
 * Duplicar a validação entre cliente e servidor é aceitável neste caso
 * específico: o cálculo do dígito verificador de CPF e CNPJ é norma pública
 * fixa, não regra de negócio que muda. O que NÃO se duplica é decisão — quem
 * decide se o CNPJ já existe, se o usuário pode cadastrar e o que vai para o
 * banco continua sendo o servidor.
 *
 * Guardamos SEMPRE só os dígitos. Máscara é assunto de exibição: gravar
 * formatado quebraria a unicidade do CNPJ (o mesmo número com e sem ponto
 * viraria duas empresas) e tornaria a busca por CPF dependente de o operador ter
 * digitado a pontuação do mesmo jeito.
 */

/* -------------------------------------------------------------------------- */
/*                                  Dígitos                                   */
/* -------------------------------------------------------------------------- */

/** Só os dígitos do valor. É o formato que vai para o banco. */
export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Todos os dígitos iguais ("111.111.111-11"). Passa em qualquer checagem de tamanho e não existe. */
function todosIguais(digitos: string): boolean {
  return digitos.length > 0 && /^(\d)\1*$/.test(digitos);
}

/* -------------------------------------------------------------------------- */
/*                                    CNPJ                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pesos do cálculo dos dígitos verificadores, conforme a Receita Federal.
 * O segundo dígito usa 13 posições porque entra o primeiro já calculado.
 */
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function dvPorPesos(base: string, pesos: number[]): number {
  const soma = pesos.reduce(
    (total, peso, indice) => total + Number(base[indice]) * peso,
    0
  );
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ com 14 dígitos e dígito verificador correto. Recebe com ou sem máscara. */
export function cnpjValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return false;
  if (todosIguais(d)) return false;
  return (
    dvPorPesos(d.slice(0, 12), PESOS_CNPJ_1) === Number(d[12]) &&
    dvPorPesos(d.slice(0, 13), PESOS_CNPJ_2) === Number(d[13])
  );
}

/** Máscara progressiva 00.000.000/0000-00. Formata o que já foi digitado. */
export function mascaraCnpj(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(
    8,
    12
  )}-${d.slice(12)}`;
}

/** CNPJ formatado para leitura. Devolve o que entrou se não tiver 14 dígitos. */
export function formatarCnpj(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return valor ?? "";
  return mascaraCnpj(d);
}

/* -------------------------------------------------------------------------- */
/*                                    CPF                                     */
/* -------------------------------------------------------------------------- */

/**
 * CPF com 11 dígitos e os dois verificadores corretos.
 *
 * Os pesos do CPF são decrescentes a partir do tamanho da base (10..2 no
 * primeiro dígito, 11..2 no segundo), diferente do CNPJ, que tem tabela fixa.
 * Por isso o cálculo é próprio em vez de reaproveitar `dvPorPesos`.
 */
export function cpfValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return false;
  if (todosIguais(d)) return false;

  const dv = (base: string): number => {
    const pesoInicial = base.length + 1;
    const soma = base
      .split("")
      .reduce(
        (total, caractere, indice) =>
          total + Number(caractere) * (pesoInicial - indice),
        0
      );
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/** Máscara progressiva 000.000.000-00. */
export function mascaraCpf(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF formatado para leitura. Devolve o que entrou se não tiver 11 dígitos. */
export function formatarCpf(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return valor ?? "";
  return mascaraCpf(d);
}

/**
 * CPF mascarado para exibição: 123.***.**9-00.
 *
 * CPF de sócio é dado pessoal e a tela de listagem não precisa dele inteiro.
 * Quem precisa do número completo abre o cadastro.
 */
export function cpfParcial(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return valor ?? "";
  return `${d.slice(0, 3)}.***.**${d.slice(8, 9)}-${d.slice(9)}`;
}

/* -------------------------------------------------------------------------- */
/*                                    CEP                                     */
/* -------------------------------------------------------------------------- */

/**
 * CEP com 8 dígitos.
 *
 * Não há dígito verificador em CEP, então o que se pode conferir é o tamanho e
 * o "00000-000", que é o valor que aparece quando alguém preenche por hábito.
 */
export function cepValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  return d.length === 8 && !todosIguais(d);
}

/** Máscara progressiva 00000-000. */
export function mascaraCep(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** CEP formatado para leitura. Devolve o que entrou se não tiver 8 dígitos. */
export function formatarCep(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length !== 8) return valor ?? "";
  return mascaraCep(d);
}

/* -------------------------------------------------------------------------- */
/*                                  Telefone                                  */
/* -------------------------------------------------------------------------- */

/**
 * Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular).
 *
 * O DDD válido começa em 11 — não existe DDD 10 nem menor. Conferir isso pega o
 * erro mais comum de digitação, que é começar a digitar pelo número e esquecer o
 * DDD.
 */
export function telefoneValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  // Celular no Brasil sempre começa com 9 depois do DDD.
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

/**
 * Máscara progressiva (00) 0000-0000 e (00) 00000-0000.
 *
 * O ponto de corte é o 11º dígito: até 10, o hífen fica depois do quarto dígito
 * do número (fixo); no 11º, ele desloca para depois do quinto (celular). Fazer
 * isso na digitação evita o efeito de o hífen "pular" e a pessoa achar que
 * apagou algo.
 */
export function mascaraTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone formatado para leitura. Devolve o que entrou se o tamanho não fechar. */
export function formatarTelefone(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length !== 10 && d.length !== 11) return valor ?? "";
  return mascaraTelefone(d);
}

/* -------------------------------------------------------------------------- */
/*                          Inscrições estadual/municipal                     */
/* -------------------------------------------------------------------------- */

/**
 * Inscrição estadual e municipal NÃO são validadas por dígito verificador.
 *
 * Cada estado tem a própria regra (São Paulo tem 12 dígitos com dois
 * verificadores em posições diferentes; Rio tem 8; Minas tem 13), e município é
 * pior ainda: cada prefeitura define o formato, e há cidade que usa letra.
 * Implementar 27 algoritmos estaduais para um campo de cadastro seria trocar um
 * problema pequeno (dado torto) por um grande (recusar dado certo de um estado
 * cuja regra foi escrita errada aqui).
 *
 * O que se faz é limpar: tira espaço em excesso e caractere que não é dígito,
 * ponto, barra, hífen ou letra. E "ISENTO", que é um valor legítimo de inscrição
 * estadual, passa intacto.
 */
export function limparInscricao(valor: string): string {
  return valor
    .replace(/[^0-9A-Za-z./-]/g, "")
    .slice(0, 20)
    .toUpperCase();
}

/* -------------------------------------------------------------------------- */
/*                                  Genérico                                  */
/* -------------------------------------------------------------------------- */

export type TipoDocumento = "cpf" | "cnpj" | "cep" | "telefone";

const MASCARAS: Record<TipoDocumento, (valor: string) => string> = {
  cpf: mascaraCpf,
  cnpj: mascaraCnpj,
  cep: mascaraCep,
  telefone: mascaraTelefone,
};

const VALIDADORES: Record<
  TipoDocumento,
  (valor: string | null | undefined) => boolean
> = {
  cpf: cpfValido,
  cnpj: cnpjValido,
  cep: cepValido,
  telefone: telefoneValido,
};

const DIGITOS_ESPERADOS: Record<TipoDocumento, number[]> = {
  cpf: [11],
  cnpj: [14],
  cep: [8],
  telefone: [10, 11],
};

export const PLACEHOLDER_DOCUMENTO: Record<TipoDocumento, string> = {
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  cep: "00000-000",
  telefone: "(11) 90000-0000",
};

export function aplicarMascara(tipo: TipoDocumento, valor: string): string {
  return MASCARAS[tipo](valor);
}

export function documentoValido(
  tipo: TipoDocumento,
  valor: string | null | undefined
): boolean {
  return VALIDADORES[tipo](valor);
}

/** Quantos dígitos ainda faltam para o campo fechar. 0 quando já fechou. */
export function digitosFaltando(
  tipo: TipoDocumento,
  valor: string | null | undefined
): number {
  const atual = somenteDigitos(valor).length;
  const alvos = DIGITOS_ESPERADOS[tipo];
  const proximo = alvos.find((alvo) => atual <= alvo);
  return proximo === undefined ? 0 : proximo - atual;
}

/**
 * Mensagem de erro pronta, ou `null` quando o valor está bom.
 *
 * Campo vazio e campo incompleto dão mensagens diferentes: "informe o CPF" e
 * "faltam 3 dígitos" resolvem coisas distintas, e a segunda é a que evita a
 * pessoa achar que digitou tudo. Quando o tamanho fecha mas o verificador não
 * confere, a mensagem diz isso — é quase sempre erro de digitação em um dígito,
 * e saber que é digitação (e não "sistema recusando") muda o que a pessoa faz.
 */
export function erroDocumento(
  tipo: TipoDocumento,
  valor: string | null | undefined,
  opcoes: { obrigatorio?: boolean; rotulo?: string } = {}
): string | null {
  const rotulo =
    opcoes.rotulo ??
    { cpf: "CPF", cnpj: "CNPJ", cep: "CEP", telefone: "telefone" }[tipo];
  const digitos = somenteDigitos(valor);

  if (!digitos) {
    return opcoes.obrigatorio ? `Informe o ${rotulo}.` : null;
  }

  const faltam = digitosFaltando(tipo, digitos);
  if (faltam > 0) {
    return `${rotulo} incompleto: ${
      faltam === 1 ? "falta 1 dígito" : `faltam ${faltam} dígitos`
    }.`;
  }

  if (!documentoValido(tipo, digitos)) {
    if (tipo === "cpf" || tipo === "cnpj") {
      return `${rotulo} inválido: o dígito verificador não confere. Confira a digitação.`;
    }
    if (tipo === "telefone") {
      return "Telefone inválido. Informe DDD e número (celular começa com 9).";
    }
    return `${rotulo} inválido.`;
  }

  return null;
}
