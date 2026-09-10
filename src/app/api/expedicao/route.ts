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
  ehUrgencia,
  FILTROS_PADRAO,
  hojeSP,
  URGENCIA_ROTULO,
  type Canal,
  type FiltrosExpedicao,
  type OrdemExpedicao,
  type ResultadoExpedicao,
  type Urgencia,
} from "@/lib/expedicao";
import { backfillPrazoAte } from "@/lib/prazo-despacho-backfill";
import { buscarAnuncioInfo, resolverMiniatura } from "@/lib/meli-anuncio-info";

export const runtime = "nodejs";

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

  return {
    canais: lista(p.get("canais"), 2).filter((c): c is Canal => ehCanal(c)),
    contas: lista(p.get("contas"), 50),
    urgencias: lista(p.get("urgencias"), 6).filter((u): u is Urgencia => ehUrgencia(u)),
    modalidades: lista(p.get("modalidades"), 30).map((m) => m.toUpperCase()),
    busca: texto(p.get("busca")),
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
      filtros.busca,
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

    // Backfill do prazo, em fatia curta e best-effort.
    //
    // Sem prazo a fila cai na data da venda, que é a ordenação ERRADA para esta
    // tela — o módulo funcionaria mentindo. Exigir que alguém rode um script à mão
    // para a tela dizer a verdade seria transformar detalhe de implementação em
    // tarefa do usuário. Falhar aqui não derruba a resposta: a tela mostra quantas
    // vendas ainda faltam (`prazoPendente`) e segue com o que já tem.
    try {
      await backfillPrazoAte(4_000, session.sub);
    } catch (err) {
      console.warn("[expedicao] backfill de prazo não rodou:", err);
    }

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
