/**
 * Busca de endereço por CEP no ViaCEP.
 *
 * O formulário antigo pedia "Endereço Completo com CEP" num campo de texto só, e
 * voltava sem número, sem bairro ou com o CEP do bairro em vez do da rua — e é
 * o dado que vai para a JUCESP.
 *
 * TRÊS COISAS DA API QUE QUEBRAM A IMPLEMENTAÇÃO INGÊNUA, verificadas chamando
 * o serviço de verdade:
 *
 *  1. CEP inexistente responde HTTP **200** com `{"erro":"true"}`. Não é 404,
 *     então `if (!resposta.ok)` não detecta nada.
 *  2. O `erro` é a **string** `"true"`, não o booleano. `if (dados.erro === true)`
 *     nunca entra. O teste correto é a presença da chave.
 *  3. O campo da cidade é `localidade`, e `complemento` é informação DO CEP
 *     ("lado ímpar"), não o complemento da pessoa. Copiar um no outro põe "lado
 *     ímpar" onde deveria estar "apto 42".
 *
 * Chamada direta do navegador, sem rota intermediária no Next: não há segredo
 * envolvido, e um proxy só somaria latência e um ponto de falha nosso.
 */

const URL_BASE = "https://viacep.com.br/ws";

/** Acima disso a pessoa já desistiu de esperar e vai digitar à mão. */
const TIMEOUT_MS = 8000;

export type EnderecoCep = {
  cep: string;
  logradouro: string;
  bairro: string;
  /** Já traduzido de `localidade`. */
  cidade: string;
  uf: string;
};

export type ResultadoCep =
  | { ok: true; endereco: EnderecoCep }
  | { ok: false; motivo: "formato" | "nao-encontrado" | "rede"; mensagem: string };

/** Resposta bruta do ViaCEP. `erro` é string quando o CEP não existe. */
type RespostaViaCep = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: string | boolean;
};

/**
 * Cache por CEP, na memória da aba.
 *
 * Dois sócios que moram juntos fazem uma requisição, não duas. E voltar um passo
 * e voltar a entrar no campo não bate na API de novo.
 */
const cache = new Map<string, EnderecoCep>();

export function cepEmCache(cep: string): EnderecoCep | undefined {
  return cache.get(soDigitos(cep));
}

function soDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * Busca o CEP. Nunca lança: o erro volta no retorno.
 *
 * `sinal` vem de um `AbortController` de quem chama. Sem abortar a busca
 * anterior, digitar um CEP, apagar e digitar outro dispara duas requisições, e a
 * primeira pode responder DEPOIS da segunda e sobrescrever o endereço certo com
 * o errado. É silencioso e é o bug clássico de autocomplete.
 */
export async function buscarCep(
  cep: string,
  sinal?: AbortSignal
): Promise<ResultadoCep> {
  const digitos = soDigitos(cep);

  if (digitos.length !== 8) {
    return {
      ok: false,
      motivo: "formato",
      mensagem: "CEP incompleto",
    };
  }

  const guardado = cache.get(digitos);
  if (guardado) return { ok: true, endereco: guardado };

  // Timeout próprio, encadeado ao sinal de quem chamou: `fetch` sem isto espera
  // o tempo do sistema operacional, que em rede ruim passa de meio minuto.
  const relogio = new AbortController();
  const prazo = setTimeout(() => relogio.abort(), TIMEOUT_MS);
  const cancelar = () => relogio.abort();
  sinal?.addEventListener("abort", cancelar);

  try {
    const resposta = await fetch(`${URL_BASE}/${digitos}/json/`, {
      signal: relogio.signal,
      headers: { Accept: "application/json" },
    });

    // CEP com formato recusado pela própria API devolve 400.
    if (!resposta.ok) {
      return {
        ok: false,
        motivo: "nao-encontrado",
        mensagem: "CEP não encontrado. Confira o número.",
      };
    }

    const dados = (await resposta.json()) as RespostaViaCep;

    // A checagem que importa: presença da chave, não o valor dela.
    if ("erro" in dados) {
      return {
        ok: false,
        motivo: "nao-encontrado",
        mensagem:
          "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
      };
    }

    const endereco: EnderecoCep = {
      cep: dados.cep ?? "",
      logradouro: dados.logradouro ?? "",
      bairro: dados.bairro ?? "",
      // `localidade`, não `cidade`.
      cidade: dados.localidade ?? "",
      uf: dados.uf ?? "",
    };

    cache.set(digitos, endereco);
    return { ok: true, endereco };
  } catch (erro) {
    // Abortado de propósito não é falha para mostrar: quem abortou já sabe.
    if (erro instanceof DOMException && erro.name === "AbortError") {
      return { ok: false, motivo: "rede", mensagem: "" };
    }
    return {
      ok: false,
      motivo: "rede",
      mensagem:
        "Não conseguimos buscar o CEP agora. Você pode preencher o endereço manualmente.",
    };
  } finally {
    clearTimeout(prazo);
    sinal?.removeEventListener("abort", cancelar);
  }
}
