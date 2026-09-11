/**
 * Etiqueta de envio do Mercado Livre, em PDF ou ZPL.
 *
 * SOMENTE GET, e sem gravar nada: a etiqueta é um documento do ML, e este módulo
 * é só o encanamento que leva os bytes até a impressora de quem está com o pacote
 * na mão. Nenhum estado de despacho é registrado aqui — ver o cabeçalho de
 * `src/lib/expedicao-data.ts`.
 */

import { NextRequest, NextResponse } from "next/server";

import { assertSessionToken } from "@/lib/auth";
import { refreshMeliAccountToken } from "@/lib/meli";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const MELI_API_BASE =
  process.env.MELI_API_BASE?.replace(/\/$/, "") || "https://api.mercadolibre.com";

/**
 * Os dois únicos estados em que o ML entrega etiqueta.
 *
 * `printed` entra na lista porque reimprimir é operação normal do galpão: a
 * primeira via sai torta, acaba o ribbon, o papel encrava. Deixar de fora
 * transformaria um erro de impressora num pacote travado.
 */
const STATUS_IMPRIMIVEL = new Set(["ready_to_ship", "printed"]);

type TipoEtiqueta = "pdf" | "zpl";

/**
 * Teto de envios por pedido em LOTE.
 *
 * O endpoint `shipment_labels` do Mercado Livre aceita vários `shipment_ids` e
 * devolve UM arquivo com todas as etiquetas — é assim que se imprime a fila do dia
 * sem abrir cinquenta abas. O teto existe porque a URL cresce com a lista (cada id
 * tem ~11 dígitos) e porque um PDF de duzentas páginas trava a impressora do galpão
 * antes de trancar o navegador.
 */
const MAX_LOTE = 50;

/** O que o ML devolve no corpo de erro do `shipment_labels`. */
type FalhaEtiqueta = { message?: string };
type RespostaErroEtiqueta = {
  message?: string;
  failed_shipments?: FalhaEtiqueta[];
};

/* -------------------------------------------------------------------------- */
/*                          Mensagens para a tela                             */
/* -------------------------------------------------------------------------- */

/**
 * Status do ML -> frase que diz O QUE FAZER.
 *
 * O texto que o ML devolve é em espanhol/inglês e descreve o estado da máquina
 * ("status is invoice_pending"), não a providência. Quem está na expedição precisa
 * saber que falta emitir a NF-e — sem isso, a pessoa reclica no botão, conclui que
 * o sistema está quebrado e abre chamado por algo que só ela pode resolver.
 */
function mensagemDeStatus(status: string): string {
  switch (status) {
    case "invoice_pending":
      return "Aguardando a nota fiscal. Emita a NF-e deste pedido no Mercado Livre para liberar a etiqueta.";
    case "pending":
    case "handling":
      return "O envio ainda está em preparação no Mercado Livre. A etiqueta libera quando ficar pronto para envio.";
    case "shipped":
      return "Este pedido já foi despachado — a etiqueta não está mais disponível.";
    case "delivered":
      return "Este pedido já foi entregue — a etiqueta não está mais disponível.";
    case "cancelled":
    case "canceled":
      return "Este envio foi cancelado, não há etiqueta para gerar.";
    default:
      return `Este envio não está pronto para gerar etiqueta (status atual: ${status}).`;
  }
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
    const contaId = (url.searchParams.get("contaId") ?? "").trim();
    const tipo: TipoEtiqueta = url.searchParams.get("tipo") === "zpl" ? "zpl" : "pdf";

    /**
     * UM envio (`shippingId`) ou VÁRIOS (`shippingIds`, separados por vírgula).
     *
     * Os dois parâmetros caem no mesmo caminho porque o endpoint do Mercado Livre
     * é o mesmo: ele sempre recebe uma LISTA de `shipment_ids`. Manter
     * `shippingId` é o que preserva o botão por linha, que continua sendo o uso
     * mais comum — imprimir uma etiqueta avulsa.
     *
     * Todos os envios de um pedido têm de ser da MESMA conta, porque o token é da
     * conta. Quem chama em lote agrupa por conta antes; ver `BarraLote`.
     */
    const brutos = (
      url.searchParams.get("shippingIds") ??
      url.searchParams.get("shippingId") ??
      ""
    )
      .split(",")
      .map((s) => s.trim())
      // O ML às vezes devolve o envio com sufixo (`43123456789.1`), que aparece na
      // nossa base como veio. Esse sufixo não é um id válido nos endpoints de
      // shipment: mandado inteiro, dá 404 e o operador vê "envio não encontrado"
      // para um pacote que existe. A parte antes do ponto é o id de verdade.
      .map((s) => s.split(".")[0])
      .filter((s) => s !== "");

    // `Set` para o mesmo envio não entrar duas vezes: um pacote com duas vendas
    // aparece duas vezes na seleção e o ML cobraria duas páginas da mesma etiqueta.
    const ids = Array.from(new Set(brutos));

    if (ids.length === 0 && !contaId) {
      return NextResponse.json(
        { error: "Informe o código de envio e a conta do Mercado Livre." },
        { status: 400 },
      );
    }
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Código de envio não informado." },
        { status: 400 },
      );
    }
    if (!contaId) {
      return NextResponse.json(
        { error: "Conta do Mercado Livre não informada." },
        { status: 400 },
      );
    }
    if (ids.length > MAX_LOTE) {
      return NextResponse.json(
        {
          error: `São ${ids.length} etiquetas de uma vez, e o limite é ${MAX_LOTE}. Imprima em duas tandas.`,
        },
        { status: 400 },
      );
    }

    const emLote = ids.length > 1;

    /**
     * O `userId` no `where` é SEGURANÇA, não formalidade.
     *
     * O `contaId` vem da query string, ou seja, do cliente — nada impede alguém de
     * trocar o cuid por outro qualquer. Sem o `userId` amarrando a conta ao dono da
     * sessão, esta rota imprimiria a etiqueta (com nome, endereço e telefone do
     * comprador) de um inquilino diferente para quem soubesse chutar um id. O filtro
     * é o que faz a resposta ser sempre 404 nesse caso, em vez de vazar dado alheio.
     */
    const conta = await prisma.meliAccount.findFirst({
      where: { id: contaId, userId: session.sub },
    });

    if (!conta) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    let token: string;
    try {
      const atualizada = await refreshMeliAccountToken(conta);
      token = atualizada.access_token;
    } catch (err) {
      console.error("[expedicao/etiqueta] token do Mercado Livre indisponível:", err);
      return NextResponse.json(
        {
          error:
            "Não foi possível autenticar na conta do Mercado Livre. Reconecte a conta em Contas e tente de novo.",
        },
        { status: 502 },
      );
    }

    const sid = ids[0];
    const headers = { Authorization: `Bearer ${token}` };

    /**
     * Revalidação do status na hora, sem cache — SÓ no envio avulso.
     *
     * O status guardado no banco tem a idade da última sincronização, e é exatamente
     * nesta tela que ele fica velho mais rápido (a NF-e sai por fora, no painel do
     * ML). Consultar agora é o que permite responder "emita a NF-e" em vez de
     * devolver um PDF vazio ou um erro cru do ML.
     *
     * EM LOTE ESTA CHECAGEM NÃO ACONTECE, e é deliberado: cinquenta etiquetas
     * seriam cinquenta chamadas extras ao ML antes da que interessa — segundos de
     * espera e cinquenta vezes mais chance de bater no limite de requisições, para
     * melhorar uma mensagem de erro. No lote quem responde é o próprio
     * `shipment_labels`: ele devolve `failed_shipments` com o envio e o motivo de
     * cada um que não pôde sair, e o tratamento abaixo repassa isso.
     */
    let statusAtual: string | null = null;
    if (!emLote) {
      try {
        const envio = await fetch(`${MELI_API_BASE}/shipments/${sid}`, {
          headers,
          cache: "no-store",
        });
        if (envio.ok) {
          const dados = (await envio.json()) as { status?: string };
          statusAtual = typeof dados.status === "string" ? dados.status : null;
        }
      } catch (err) {
        // NÃO bloqueia. Esta checagem existe para dar mensagem melhor, não para dar
        // permissão: se ela falhou por rede ou instabilidade do ML, negar aqui seria
        // impedir a impressão de um pacote que talvez esteja perfeitamente pronto. O
        // pedido da etiqueta, logo abaixo, é a fonte da verdade — se não puder, ele
        // mesmo diz o motivo.
        console.warn(
          "[expedicao/etiqueta] status do envio não pôde ser revalidado:",
          err,
        );
      }

      if (statusAtual && !STATUS_IMPRIMIVEL.has(statusAtual)) {
        return NextResponse.json(
          { error: mensagemDeStatus(statusAtual), statusAtual },
          { status: 409 },
        );
      }
    }

    const responseType = tipo === "zpl" ? "zpl2" : "pdf";

    /**
     * O token vai no header, nunca na query string.
     *
     * O ML aceita `access_token=` na URL, mas URL completa entra em log de proxy, de
     * servidor e no `Referer` — seria espalhar credencial de conta por lugares que
     * ninguém audita.
     */
    const resposta = await fetch(
      `${MELI_API_BASE}/shipment_labels?shipment_ids=${encodeURIComponent(ids.join(","))}&response_type=${responseType}`,
      { headers, cache: "no-store" },
    );

    if (!resposta.ok || !resposta.body) {
      let mensagem = emLote
        ? "Não foi possível gerar as etiquetas no Mercado Livre."
        : "Não foi possível gerar a etiqueta no Mercado Livre.";

      try {
        const corpo = (await resposta.json()) as RespostaErroEtiqueta;
        // O motivo real quase sempre está em `failed_shipments`, por envio; o
        // `message` do topo costuma ser genérico ("error processing request").
        const falhas = corpo.failed_shipments ?? [];
        const bruta = falhas[0]?.message ?? corpo.message ?? "";

        // O ML embute o status na frase de erro ("...status is invoice_pending").
        // Extrair dali é o que permite responder a providência mesmo quando a
        // revalidação acima não conseguiu ler o status.
        const achado = /status is (\w+)/i.exec(bruta);
        if (achado) mensagem = mensagemDeStatus(achado[1].toLowerCase());
        else if (bruta.trim()) mensagem = bruta.trim();

        /**
         * Em lote, a contagem entra na frase.
         *
         * "Aguardando a nota fiscal" sozinho, depois de selecionar trinta pacotes,
         * não diz se o problema é um pacote ou os trinta — e a providência é
         * diferente: um é emitir uma NF-e, trinta é revisar o filtro. O ML recusa o
         * pedido INTEIRO quando qualquer envio falha, então saber quantos falharam
         * é o que permite desmarcar os culpados e imprimir o resto.
         */
        if (emLote && falhas.length > 0) {
          mensagem = `${falhas.length} de ${ids.length} etiqueta(s) não puderam sair, e o Mercado Livre recusa o lote inteiro quando isso acontece. Motivo da primeira: ${mensagem}`;
        }
      } catch {
        // Corpo não-JSON (HTML de erro, resposta vazia): fica a mensagem genérica.
      }

      console.warn(
        `[expedicao/etiqueta] ML recusou ${ids.length} etiqueta(s) (${ids.join(",")}): ${resposta.status}`,
      );
      return NextResponse.json({ error: mensagem, statusAtual }, { status: 409 });
    }

    const tipoConteudo =
      resposta.headers.get("content-type") ??
      (tipo === "zpl" ? "text/plain" : "application/pdf");
    const extensao = tipo === "zpl" ? "txt" : "pdf";
    const nomeArquivo = emLote
      ? `etiquetas-${ids.length}.${extensao}`
      : `etiqueta-${sid}.${extensao}`;

    /**
     * Stream dos bytes, e não `redirect` para a URL do ML.
     *
     * Um redirect levaria o navegador até uma URL que só funciona com o
     * `access_token` dentro dela — e essa URL ficaria visível na barra de endereço,
     * no histórico e em qualquer extensão instalada. Passar os bytes por aqui mantém
     * a credencial no servidor. Como stream, sem `arrayBuffer()`, para não segurar a
     * etiqueta inteira em memória a cada impressão (numa fila de dezenas de pacotes
     * isso se acumula).
     */
    return new NextResponse(resposta.body, {
      headers: {
        "Content-Type": tipoConteudo,
        // `inline`: a etiqueta abre para conferir e imprimir. `attachment` obrigaria
        // a salvar um arquivo que ninguém quer guardar.
        "Content-Disposition": `inline; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Erro ao gerar etiqueta de envio:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
