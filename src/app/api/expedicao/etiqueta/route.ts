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
    const shippingId = (url.searchParams.get("shippingId") ?? "").trim();
    const contaId = (url.searchParams.get("contaId") ?? "").trim();
    const tipo: TipoEtiqueta = url.searchParams.get("tipo") === "zpl" ? "zpl" : "pdf";

    if (!shippingId && !contaId) {
      return NextResponse.json(
        { error: "Informe o código de envio e a conta do Mercado Livre." },
        { status: 400 },
      );
    }
    if (!shippingId) {
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

    /**
     * O ML às vezes devolve o envio com sufixo (`43123456789.1`), que aparece na
     * nossa base como veio. Esse sufixo não é um id válido nos endpoints de
     * shipment: mandado inteiro, dá 404 e o operador vê "envio não encontrado"
     * para um pacote que existe. A parte antes do ponto é o id de verdade.
     */
    const sid = shippingId.split(".")[0];

    const headers = { Authorization: `Bearer ${token}` };

    /**
     * Revalidação do status na hora, sem cache.
     *
     * O status guardado no banco tem a idade da última sincronização, e é exatamente
     * nesta tela que ele fica velho mais rápido (a NF-e sai por fora, no painel do
     * ML). Consultar agora é o que permite responder "emita a NF-e" em vez de
     * devolver um PDF vazio ou um erro cru do ML.
     */
    let statusAtual: string | null = null;
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
      console.warn("[expedicao/etiqueta] status do envio não pôde ser revalidado:", err);
    }

    if (statusAtual && !STATUS_IMPRIMIVEL.has(statusAtual)) {
      return NextResponse.json(
        { error: mensagemDeStatus(statusAtual), statusAtual },
        { status: 409 },
      );
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
      `${MELI_API_BASE}/shipment_labels?shipment_ids=${encodeURIComponent(sid)}&response_type=${responseType}`,
      { headers, cache: "no-store" },
    );

    if (!resposta.ok || !resposta.body) {
      let mensagem = "Não foi possível gerar a etiqueta no Mercado Livre.";

      try {
        const corpo = (await resposta.json()) as RespostaErroEtiqueta;
        // O motivo real quase sempre está em `failed_shipments`, por envio; o
        // `message` do topo costuma ser genérico ("error processing request").
        const bruta = corpo.failed_shipments?.[0]?.message ?? corpo.message ?? "";

        // O ML embute o status na frase de erro ("...status is invoice_pending").
        // Extrair dali é o que permite responder a providência mesmo quando a
        // revalidação acima não conseguiu ler o status.
        const achado = /status is (\w+)/i.exec(bruta);
        if (achado) mensagem = mensagemDeStatus(achado[1].toLowerCase());
        else if (bruta.trim()) mensagem = bruta.trim();
      } catch {
        // Corpo não-JSON (HTML de erro, resposta vazia): fica a mensagem genérica.
      }

      console.warn(
        `[expedicao/etiqueta] ML recusou a etiqueta do envio ${sid}: ${resposta.status}`,
      );
      return NextResponse.json({ error: mensagem, statusAtual }, { status: 409 });
    }

    const tipoConteudo =
      resposta.headers.get("content-type") ??
      (tipo === "zpl" ? "text/plain" : "application/pdf");
    const extensao = tipo === "zpl" ? "txt" : "pdf";

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
        "Content-Disposition": `inline; filename="etiqueta-${sid}.${extensao}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Erro ao gerar etiqueta de envio:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
