/**
 * Diagnóstico: ONDE está o prazo de despacho dentro do payload do Mercado Livre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO EXISTE
 *
 * A fila de Expedição apareceu com "—" na coluna Despachar em TODOS os pacotes de
 * uma conta que despacha por coleta, com "Atrasados" e "Despachar Hoje" zerados. A
 * causa é `prazo_despacho` NULL no banco, e a pergunta que restou não se responde
 * lendo código: EM QUAL CAMPO o Mercado Livre devolve esse limite para os envios
 * DESTA conta?
 *
 * A lista de caminhos em `prazo-despacho.ts` foi montada a partir da documentação
 * e de payloads de envio por agência. Coleta, Flex e envio agendado usam campos
 * diferentes, e ampliar a lista no escuro é o que já falhou uma vez.
 *
 * Este script lê o `raw_data` que JÁ está no banco e reporta, para as vendas sem
 * prazo, quais chaves com cara de data existem no envio e com que frequência.
 * Com isso a lista de caminhos passa a ser escrita a partir do dado real.
 *
 * SOMENTE LEITURA. Nenhum `UPDATE`, nenhum `INSERT`, nenhuma chamada de API.
 * Pode rodar em produção sem risco.
 *
 * Uso:
 *   $env:DATABASE_URL='...'
 *   npx tsx scripts/diagnostico-prazo.ts
 *   npx tsx scripts/diagnostico-prazo.ts 400     # quantas vendas examinar
 * ─────────────────────────────────────────────────────────────────────────────
 */
import prisma from "../src/lib/prisma";

/** Quantas vendas examinar por padrão. */
const AMOSTRA_PADRAO = 200;

/** Profundidade máxima da caminhada no JSON. Evita descer em `rawData` inteiro. */
const PROFUNDIDADE = 5;

/**
 * Uma folha do JSON tem "cara de prazo" quando é data ISO ou epoch plausível.
 *
 * A mesma faixa de `prazo-despacho.ts` (2017–2049): sem o piso, `0` e `1` entram
 * como 1970 e poluem o relatório; sem o teto, epoch em milissegundos entra como
 * ano 57000.
 */
const EPOCH_MINIMO = 1_500_000_000;
const EPOCH_MAXIMO = 2_500_000_000;

function pareceData(valor: unknown): string | null {
  if (typeof valor === "number") {
    if (valor < EPOCH_MINIMO || valor > EPOCH_MAXIMO) return null;
    return new Date(valor * 1000).toISOString();
  }
  if (typeof valor !== "string") return null;

  const t = valor.trim();
  if (t === "") return null;

  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n < EPOCH_MINIMO || n > EPOCH_MAXIMO) return null;
    return new Date(n * 1000).toISOString();
  }

  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Percorre o objeto e devolve `caminho -> valor` de tudo que parece data. */
function folhasComData(
  no: unknown,
  prefixo: string,
  nivel: number,
  saida: Map<string, string>,
): void {
  if (nivel > PROFUNDIDADE || no === null || typeof no !== "object") return;

  for (const [chave, valor] of Object.entries(no as Record<string, unknown>)) {
    // O índice do array vira `[]`: `package_list.0.ship_by_date` e
    // `package_list.1.ship_by_date` são o MESMO campo, e contá-los separado
    // esconderia a frequência real atrás de dezenas de linhas quase iguais.
    const caminho = `${prefixo}${prefixo ? "." : ""}${/^\d+$/.test(chave) ? "[]" : chave}`;

    const data = pareceData(valor);
    if (data) {
      if (!saida.has(caminho)) saida.set(caminho, data);
      continue;
    }
    folhasComData(valor, caminho, nivel + 1, saida);
  }
}

type LinhaCrua = {
  order_id: string;
  logistic_type: string | null;
  envio_mode: string | null;
  shipping_status: string | null;
  prazo_despacho_origem: string | null;
  raw_data: unknown;
};

async function main() {
  const amostra = Math.max(1, Math.min(Number(process.argv[2]) || AMOSTRA_PADRAO, 2000));

  console.log(`\nExaminando até ${amostra} vendas do Mercado Livre SEM prazo.\n`);

  /**
   * `$queryRaw` e não o cliente tipado: o `raw_data` é grande e aqui só interessam
   * as vendas SEM prazo dentro da janela que a Expedição olha. Trazer a tabela
   * pelo cliente puxaria o JSON de tudo.
   */
  const linhas = await prisma.$queryRaw<LinhaCrua[]>`
    SELECT
      v.order_id,
      v.logistic_type,
      v.envio_mode,
      v.shipping_status,
      v.prazo_despacho_origem,
      v.raw_data
    FROM meli_venda v
    WHERE v.prazo_despacho IS NULL
      AND v.data_venda >= ((NOW() - INTERVAL '90 days') AT TIME ZONE 'UTC')
      AND LOWER(COALESCE(v.logistic_type, '')) NOT IN ('fulfillment', 'full')
    ORDER BY v.data_venda DESC
    LIMIT ${amostra}
  `;

  if (linhas.length === 0) {
    console.log("Nenhuma venda sem prazo nos últimos 90 dias. Nada a diagnosticar.");
    return;
  }

  // caminho -> { quantas vezes apareceu, um exemplo de valor }
  const contagem = new Map<string, { vezes: number; exemplo: string }>();
  // modalidade -> quantas vendas sem prazo
  const porModalidade = new Map<string, number>();
  const porOrigem = new Map<string, number>();
  let semEnvioNoJson = 0;

  for (const l of linhas) {
    const mod = (l.logistic_type || l.envio_mode || "(vazio)").toLowerCase();
    porModalidade.set(mod, (porModalidade.get(mod) ?? 0) + 1);

    const org = l.prazo_despacho_origem ?? "(null)";
    porOrigem.set(org, (porOrigem.get(org) ?? 0) + 1);

    const raiz = (l.raw_data ?? {}) as Record<string, unknown>;

    // Os três formatos de `raw_data` que existem na base, na mesma ordem em que o
    // backfill os consulta.
    const envios: Array<[string, unknown]> = [
      ["shipment", raiz.shipment],
      ["order.shipping", (raiz.order as Record<string, unknown> | undefined)?.shipping],
      ["shipping", raiz.shipping],
    ];

    let achouEnvio = false;
    for (const [nome, envio] of envios) {
      if (!envio || typeof envio !== "object") continue;
      achouEnvio = true;

      const folhas = new Map<string, string>();
      folhasComData(envio, nome, 0, folhas);
      for (const [caminho, exemplo] of folhas) {
        const atual = contagem.get(caminho);
        if (atual) atual.vezes++;
        else contagem.set(caminho, { vezes: 1, exemplo });
      }
    }
    if (!achouEnvio) semEnvioNoJson++;
  }

  console.log(`Vendas sem prazo na amostra: ${linhas.length}`);
  console.log(`Sem envio dentro do raw_data: ${semEnvioNoJson}\n`);

  console.log("Modalidade das vendas sem prazo:");
  for (const [mod, n] of [...porModalidade].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${mod}`);
  }

  console.log("\nMarcador de origem atual:");
  for (const [org, n] of [...porOrigem].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${org}`);
  }

  console.log("\nCampos com cara de data dentro do envio (o que importa):");
  console.log("  VEZES  CAMINHO                                             EXEMPLO");
  const ordenado = [...contagem].sort((a, b) => b[1].vezes - a[1].vezes);
  for (const [caminho, { vezes, exemplo }] of ordenado) {
    console.log(`  ${String(vezes).padStart(5)}  ${caminho.padEnd(50)} ${exemplo}`);
  }

  /* ------------------------------------------------------------------------ */
  /*         Despejo COMPLETO de uma amostra, uma por modalidade              */
  /* ------------------------------------------------------------------------ */

  /**
   * A primeira rodada deste script mostrou que NENHUM campo de prazo conhecido
   * existe nos envios desta base — e mostrou também o limite do próprio relatório:
   * ele só lista folhas que PARECEM data. Um prazo guardado como DURAÇÃO
   * (`handling: 86400`, em segundos) ou sob um nome que ainda não conhecemos passa
   * invisível.
   *
   * Por isso este segundo bloco despeja o `shipping_option` INTEIRO e as chaves do
   * envio, uma amostra por modalidade. É o que fecha a pergunta em vez de gerar
   * outra rodada de chute.
   */
  console.log("\n\n══════════ ENVIO COMPLETO, UMA AMOSTRA POR MODALIDADE ══════════");

  const jaMostradas = new Set<string>();

  for (const l of linhas) {
    const mod = (l.logistic_type || l.envio_mode || "(vazio)").toLowerCase();
    if (jaMostradas.has(mod)) continue;

    const raiz = (l.raw_data ?? {}) as Record<string, unknown>;
    const envio = (raiz.shipment ?? {}) as Record<string, unknown>;
    if (Object.keys(envio).length === 0) continue;

    jaMostradas.add(mod);

    console.log(`\n───── ${mod.toUpperCase()}  (pedido ${l.order_id}) ─────`);
    console.log(`status: ${String(envio.status)} / ${String(envio.substatus)}`);

    // As chaves do envio com o TIPO: é aqui que aparece um campo de prazo com
    // nome inesperado, ou um número que seja duração.
    console.log("\nchaves do shipment:");
    for (const [k, v] of Object.entries(envio).sort()) {
      const tipo = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
      const amostra =
        tipo === "object" || tipo === "array"
          ? ""
          : ` = ${String(v).slice(0, 60)}`;
      console.log(`  ${k.padEnd(32)} ${tipo}${amostra}`);
    }

    console.log("\nshipping_option INTEIRO:");
    console.log(JSON.stringify(envio.shipping_option ?? null, null, 2));
  }

  console.log(
    "\nMe mande esta saída inteira. O que procuro: um campo de prazo com nome",
  );
  console.log(
    "diferente, ou uma DURAÇÃO de handling em segundos — com ela o limite sai de",
  );
  console.log("`date_created + handling`, sem depender de mais uma chamada de API.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
