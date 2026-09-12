/**
 * Fila de Expedição: pacotes a despachar, ML e Shopee juntos.
 *
 * SOMENTE GET. O módulo é de leitura — ver o cabeçalho de
 * `src/lib/expedicao-data.ts` para o porquê de não existir aqui nenhuma ação que
 * grave estado de despacho.
 */

import { NextRequest, NextResponse } from "next/server";

import { assertSessionToken } from "@/lib/auth";
import { cache, createCacheKey } from "@/lib/cache";
import { buscarExpedicao } from "@/lib/expedicao-data";
import {
  ehCanal,
  ehOrdem,
  ehPrazoPreset,
  ehStatusVenda,
  ehTemPrazo,
  ehUrgencia,
  FILTROS_PADRAO,
  hojeSP,
  resolverPrazo,
  URGENCIA_ROTULO,
  type Canal,
  type FiltrosExpedicao,
  type OrdemExpedicao,
  type PrazoPreset,
  type ResultadoExpedicao,
  type StatusVenda,
  type TemPrazo,
  type Urgencia,
} from "@/lib/expedicao";
import { buscarAnuncioInfo, resolverMiniatura } from "@/lib/meli-anuncio-info";
import { backfillPrazoChunk } from "@/lib/prazo-despacho-backfill";

export const runtime = "nodejs";

/**
 * Quantas vendas o backfill de prazo examina por visita à tela, POR TABELA.
 *
 * O número não é sobre a velocidade do backfill: é sobre o tamanho da escrita que
 * o banco recebe de uma vez. O lote anterior era de 5000 linhas por tabela por
 * rodada, em laço — uma tela aberta em duas abas sujava dezenas de milhares de
 * linhas, e o Postgres registrou o resultado: 120 MB de WAL e um checkpoint de 269
 * segundos escrevendo 46% dos buffers. Checkpoint longo trava TODAS as consultas do
 * banco, não só esta tela.
 *
 * 300 é escrita que passa despercebida, e converge em algumas visitas porque cada
 * linha examinada fica resolvida para sempre (ou ganha prazo, ou recebe o marcador
 * de ausente). Como o backfill saiu do caminho da resposta, precisar de mais
 * rodadas não custa nada a quem olha a tela.
 */
const LOTE_BACKFILL_PRAZO = 300;

/**
 * Vinte segundos.
 *
 * Curto porque esta tela é operada com o pacote na mão: um minuto de cache faria
 * alguém despachar e continuar vendo o item na lista, e concluir que o sistema
 * não registrou. Longo o bastante para o carregamento inicial (que dispara a
 * consulta da página, o resumo e as facetas) não repetir a cada rolagem ou troca
 * de aba.
 */
const TTL_MS = 20_000;

/* -------------------------------------------------------------------------- */
/*                          Leitura dos parâmetros                            */
/* -------------------------------------------------------------------------- */

function inteiro(v: string | null, padrao: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(n, min), max);
}

function texto(v: string | null, max = 120): string {
  return (v ?? "").trim().slice(0, max);
}

function lista(v: string | null, max = 50): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Data `YYYY-MM-DD`, ou `null`.
 *
 * Valida o FORMATO e o calendário, e não só o formato: `2026-02-31` casa com a
 * expressão regular, e mandado ao Postgres como `::date` levanta erro e derruba a
 * consulta inteira com 500. Remontar a data e comparar com a entrada é o que pega
 * o dia que não existe, e a resposta a isso é ignorar o parâmetro — o mesmo
 * critério do resto de `lerFiltros`.
 */
function data(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const [a, m, d] = s.split("-").map(Number);
  const teste = new Date(Date.UTC(a, m - 1, d));
  if (
    teste.getUTCFullYear() !== a ||
    teste.getUTCMonth() !== m - 1 ||
    teste.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

/**
 * Query string -> filtros, com tudo saneado.
 *
 * Valor inválido cai no padrão em SILÊNCIO, sem 400. É deliberado: os parâmetros
 * daqui vêm de link compartilhado e de botão de tela, e devolver erro porque
 * `urgencias=atrazado` está escrito errado transformaria um link velho numa tela
 * quebrada em vez de numa tela com o filtro padrão. Os únicos valores que chegam
 * ao SQL como texto (a ordenação) passam por mapa fechado em `expedicao-data.ts`.
 */
function lerFiltros(url: URL): FiltrosExpedicao {
  const p = url.searchParams;

  const ordemBruta = texto(p.get("ordem"), 20);
  const direcaoBruta = texto(p.get("direcao"), 4);

  const presetBruto = texto(p.get("prazoPreset"), 20);
  const prazoPreset: PrazoPreset = ehPrazoPreset(presetBruto)
    ? presetBruto
    : FILTROS_PADRAO.prazoPreset;

  // O atalho é RESOLVIDO aqui, e não no SQL: a camada de dados recebe só duas
  // datas e não precisa saber que "hoje" existe. Isso também mantém a chave de
  // cache honesta — ela guarda as datas concretas, então a resposta de "vencem
  // hoje" calculada ontem não é reaproveitada hoje.
  const { de: prazoDe, ate: prazoAte } = resolverPrazo(
    prazoPreset,
    data(p.get("prazoDe")),
    data(p.get("prazoAte")),
  );

  const statusBruto = texto(p.get("statusVenda"), 20);
  const temPrazoBruto = texto(p.get("temPrazo"), 20);

  // Datas de venda invertidas trocam de lugar, mesmo critério do `personalizado`
  // em `resolverPrazo`: é erro de digitação, não pedido de lista vazia.
  let vendaDe = data(p.get("vendaDe"));
  let vendaAte = data(p.get("vendaAte"));
  if (vendaDe && vendaAte && vendaDe > vendaAte) [vendaDe, vendaAte] = [vendaAte, vendaDe];

  return {
    canais: lista(p.get("canais"), 2).filter((c): c is Canal => ehCanal(c)),
    contas: lista(p.get("contas"), 50),
    urgencias: lista(p.get("urgencias"), 6).filter((u): u is Urgencia => ehUrgencia(u)),
    modalidades: lista(p.get("modalidades"), 30).map((m) => m.toUpperCase()),
    // Hierarquia NÃO é passada para maiúsculas: ela é comparada com o valor
    // gravado no cadastro de SKU, e o SQL compara texto exato. Normalizar aqui
    // faria todo filtro de categoria devolver vazio.
    hierarquias1: lista(p.get("hierarquias1"), 50),
    hierarquias2: lista(p.get("hierarquias2"), 50),
    // Teto de 200 SKUs: é um filtro de lote, e alguém colando uma planilha inteira
    // na URL viraria um `IN (...)` de milhares de itens. O corte é silencioso pelo
    // mesmo critério do resto daqui, e 200 cobre qualquer separação real de um dia.
    skus: lista(p.get("skus"), 200),
    busca: texto(p.get("busca")),
    prazoPreset,
    prazoDe,
    prazoAte,
    vendaDe,
    vendaAte,
    statusVenda: (ehStatusVenda(statusBruto)
      ? statusBruto
      : FILTROS_PADRAO.statusVenda) as StatusVenda,
    temPrazo: (ehTemPrazo(temPrazoBruto)
      ? temPrazoBruto
      : FILTROS_PADRAO.temPrazo) as TemPrazo,
    janelaDias: inteiro(p.get("janelaDias"), FILTROS_PADRAO.janelaDias, 1, 365),
    ordem: (ehOrdem(ordemBruta) ? ordemBruta : FILTROS_PADRAO.ordem) as OrdemExpedicao,
    direcao: direcaoBruta === "desc" ? "desc" : "asc",
    pagina: inteiro(p.get("pagina"), 1, 1, 100_000),
    // Teto de 500 e não lista fechada: o botão de exportar precisa de uma página
    // grande, e um link com `porPagina=30` deve abrir com 30 em vez de ser trocado
    // por 50 em silêncio. O teto é a proteção que importa.
    porPagina: inteiro(p.get("porPagina"), FILTROS_PADRAO.porPagina, 1, 500),
  };
}

/* -------------------------------------------------------------------------- */
/*                          Foto e link do anúncio                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a foto da variação e o link do anúncio, item por item.
 *
 * FICA NA ROTA, E NÃO NO SQL, de propósito: a camada de dados não fala com API
 * externa. Assim a fila continua sendo uma consulta pura — testável, e imune a
 * uma indisponibilidade do Mercado Livre.
 *
 * BEST-EFFORT DE VERDADE: se o ML não responder, cada item fica com
 * `thumbnailUrl: null` e a tela mostra o quadro de imagem ausente. A fila é
 * informação operacional — atrasar ou derrubar a lista inteira porque uma foto
 * não veio seria trocar o essencial pelo acessório.
 *
 * Só Mercado Livre. A Shopee não expõe a imagem do anúncio pelos endpoints que
 * este projeto usa, então aqueles itens ficam sem foto por ora.
 */
async function preencherFotos(
  userId: string,
  resultado: ResultadoExpedicao,
): Promise<void> {
  // Uma referência por (anúncio, conta): o multiget precisa do token do DONO do
  // anúncio, e é o que `buscarAnuncioInfo` usa para agrupar as chamadas.
  const refs = new Map<string, { itemId: string; meliAccountId: string }>();
  for (const pacote of resultado.pacotes) {
    if (pacote.canal !== "ML") continue;
    for (const item of pacote.itens) {
      if (!item.itemId) continue;
      refs.set(`${item.itemId}:${pacote.accountId}`, {
        itemId: item.itemId,
        meliAccountId: pacote.accountId,
      });
    }
  }

  if (refs.size === 0) return;

  try {
    const infos = await buscarAnuncioInfo(userId, [...refs.values()]);

    for (const pacote of resultado.pacotes) {
      if (pacote.canal !== "ML") continue;
      for (const item of pacote.itens) {
        if (!item.itemId) continue;
        const info = infos.get(item.itemId);
        if (!info) continue;
        item.thumbnailUrl = resolverMiniatura(info, item.variationId, item.sku);
        item.permalink = info.permalink ?? null;
      }
    }
  } catch (err) {
    // Sem `throw`: a fila já está montada e é o que a pessoa precisa ver.
    console.warn("[expedicao] fotos do Mercado Livre não vieram:", err);
  }
}

/* -------------------------------------------------------------------------- */
/*                                    CSV                                     */
/* -------------------------------------------------------------------------- */

/**
 * Uma linha por ITEM, não por pacote.
 *
 * A tela conta pacotes porque é isso que o galpão tem na mão, mas a lista
 * IMPRESSA é de separação: quem vai buscar produto na prateleira precisa de uma
 * linha por SKU. A coluna `Pacote` é o que permite reagrupar depois — sem ela, um
 * pacote de três itens vira três pacotes na conferência.
 */
function montarCsv(resultado: ResultadoExpedicao): string {
  const cabecalho = [
    "Pacote",
    "Canal",
    "Conta",
    "Pedido",
    "SKU",
    "Produto",
    // Categoria e subcategoria vêm ANTES da quantidade de propósito: quem imprime
    // esta lista costuma ordenar a planilha por elas para andar o galpão uma
    // prateleira por vez, e coluna de agrupamento à esquerda é a convenção que
    // todo mundo já espera numa planilha.
    "Categoria",
    "Subcategoria",
    "Qtd",
    "Valor",
    "Comprador",
    "Modalidade",
    "Envio",
    "Prazo",
    "Situacao",
  ];

  // `;` como separador e vírgula decimal: é o que o Excel em português abre com
  // duplo clique. Com `,` e ponto decimal, a planilha inteira cai numa coluna só
  // e alguém tem de refazer a importação à mão.
  const linhas = [cabecalho.join(";")];

  const escapar = (valor: string | number | null): string => {
    const s = valor === null || valor === undefined ? "" : String(valor);
    // Além das aspas e do separador, a quebra de linha: título de anúncio do ML
    // vem com `\n` com frequência, e sem isto ele parte a linha do CSV em duas.
    const limpo = s.replace(/"/g, '""').replace(/[\r\n]+/g, " ");
    return /[;"\n]/.test(s) ? `"${limpo}"` : limpo;
  };

  const dinheiro = (v: number) => v.toFixed(2).replace(".", ",");

  /**
   * Identificador do pacote para a planilha.
   *
   * Usa a etiqueta quando existe. Sem etiqueta, cai na chave interna SEM o
   * prefixo (`ML:order:123` vira `123`): o prefixo é detalhe de implementação e
   * não deveria aparecer numa lista impressa, mas o valor precisa continuar
   * ÚNICO. Trocar por um texto fixo tipo "sem etiqueta" faria todos os pacotes
   * sem etiqueta se fundirem num só ao agrupar a planilha, o que é justamente o
   * que a coluna existe para evitar.
   */
  const identificador = (chave: string, etiqueta: string | null) =>
    etiqueta ?? chave.replace(/^(?:ML|SP):(?:order:)?/, "");

  for (const pacote of resultado.pacotes) {
    const prazo = pacote.prazoDespacho
      ? new Date(pacote.prazoDespacho).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })
      : "";

    for (const item of pacote.itens) {
      linhas.push(
        [
          escapar(identificador(pacote.chave, pacote.shippingId)),
          escapar(pacote.canal),
          escapar(pacote.conta),
          escapar(item.orderId),
          escapar(item.sku ?? ""),
          escapar(item.titulo),
          // Do ITEM e não do pacote: o pacote carrega a categoria do primeiro
          // item (ver o SQL), e num pacote misto isso mandaria quem separa para a
          // prateleira errada nas outras linhas.
          escapar(item.hierarquia1 ?? ""),
          escapar(item.hierarquia2 ?? ""),
          escapar(item.quantidade),
          escapar(dinheiro(item.valorTotal)),
          escapar(pacote.comprador),
          escapar(pacote.modalidade),
          escapar(pacote.shippingStatus ?? ""),
          escapar(prazo),
          escapar(URGENCIA_ROTULO[pacote.urgencia]),
        ].join(";"),
      );
    }
  }

  // BOM de UTF-8. Sem ele o Excel no Windows lê o arquivo como Latin-1 e todo
  // acento vira caractere estranho — o nome do produto fica ilegível.
  return `\uFEFF${linhas.join("\r\n")}\r\n`;
}

/* -------------------------------------------------------------------------- */
/*                                    GET                                     */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let session;
  try {
    session = await assertSessionToken(sessionCookie);
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const filtros = lerFiltros(url);
    const csv = url.searchParams.get("formato") === "csv";

    const chave = createCacheKey(
      "expedicao",
      session.sub,
      // A DATA entra na chave. Sem ela, uma resposta calculada às 23h59 seguiria
      // sendo servida às 00h05 dizendo "vence hoje" sobre o dia que passou — e é
      // exatamente na virada do dia que a fila mais muda de sentido.
      hojeSP(),
      filtros.canais.join("|"),
      filtros.contas.join("|"),
      filtros.urgencias.join("|"),
      filtros.modalidades.join("|"),
      filtros.hierarquias1.join("|"),
      filtros.hierarquias2.join("|"),
      filtros.skus.join("|"),
      filtros.busca,
      // As datas JÁ RESOLVIDAS, não o nome do atalho: dois pedidos com o mesmo
      // `prazoPreset` em dias diferentes descrevem faixas diferentes, e guardar só
      // "hoje" na chave serviria a resposta de ontem. O `hojeSP()` acima já cobre
      // isso, mas depender de dois mecanismos para a mesma garantia é o tipo de
      // acoplamento que quebra quando um deles muda.
      filtros.prazoDe ?? "",
      filtros.prazoAte ?? "",
      filtros.vendaDe ?? "",
      filtros.vendaAte ?? "",
      filtros.statusVenda,
      filtros.temPrazo,
      String(filtros.janelaDias),
      filtros.ordem,
      filtros.direcao,
      String(filtros.pagina),
      String(filtros.porPagina),
      csv ? "csv" : "json",
    );

    const semCache = url.searchParams.get("atualizar") === "1";
    if (!semCache && !csv) {
      const emCache = cache.get<ResultadoExpedicao & { filtros: FiltrosExpedicao }>(
        chave,
        TTL_MS,
      );
      if (emCache) return NextResponse.json(emCache);
    }

    // Backfill do prazo: fatia CURTA, e sem bloquear a resposta.
    //
    // Sem prazo a fila cai na data da venda, que é a ordenação ERRADA para esta
    // tela — o módulo funcionaria mentindo. Exigir que alguém rode um script à mão
    // para a tela dizer a verdade seria transformar detalhe de implementação em
    // tarefa do usuário.
    //
    // ERA `await backfillPrazoAte(4_000)`, E ISSO TRAVOU A TELA POR MINUTOS.
    //
    // Duas coisas somadas. O `await` punha o backfill no caminho crítico da
    // resposta: a tela só desenhava depois de o banco terminar de escrever. E a
    // subida da versão do marcador ("ausente" -> "ausente:3") fez o conjunto
    // pendente voltar a ser o histórico INTEIRO em vez de algumas centenas.
    //
    // Cuidado com o nome da função antiga: o `4_000` era teto de TEMPO, não de
    // linhas. `backfillPrazoAte` roda LOTES DE 5000 até o cronômetro estourar, e
    // testa o cronômetro ANTES da primeira volta — ou seja, sempre entregava no
    // mínimo um lote de 5000 linhas por tabela, por requisição. Baixar o número ali
    // teria reduzido o tempo e mantido a escrita gigante.
    //
    // Por isso aqui é `backfillPrazoChunk`, que recebe o LIMITE DE LINHAS: uma
    // rodada, curta e previsível. E `void` em vez de `await` para desacoplar da
    // resposta — a fila aparece na hora, com o prazo que já existe, e o resto
    // preenche em segundo plano. O container é um processo Node de vida longa (não é
    // função serverless que morre no `return`), então a promessa termina sozinha.
    //
    // O `.catch` é OBRIGATÓRIO aqui: promessa solta que rejeita derruba o
    // processo com `unhandledRejection`, e aí o backfill deixaria a aplicação de pé
    // trocar por uma que caiu.
    void backfillPrazoChunk(LOTE_BACKFILL_PRAZO, session.sub).catch((err) => {
      console.warn("[expedicao] backfill de prazo não rodou:", err);
    });

    const resultado = await buscarExpedicao(session.sub, filtros);
    await preencherFotos(session.sub, resultado);

    if (csv) {
      const hoje = hojeSP();
      return new NextResponse(montarCsv(resultado), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="expedicao-${hoje}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const payload = { ...resultado, filtros };
    cache.set(chave, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Erro ao buscar fila de expedição:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
