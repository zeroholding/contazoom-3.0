/**
 * Anexos de tarefa: lista e envio.
 *
 * GET  /api/tarefas/anexos?apuracaoId=... | ?processoId=...
 * POST /api/tarefas/anexos          (multipart/form-data)
 *
 * Guard: `requireInterno`. Anexo é documento de trabalho do escritório, então
 * todo papel interno lê e envia — diferente de `/api/documents`, que é o cofre do
 * cliente e é restrito a administrador. Cliente não alcança esta rota.
 *
 * Sobre a ordem das operações no POST: a linha do banco é gravada DEPOIS do
 * arquivo, e num `$transaction` junto com o log. Se o disco falhar, não sobra
 * linha apontando para arquivo inexistente; se o banco falhar, o arquivo é
 * apagado no `catch`. A sobra possível é um arquivo órfão quando o processo morre
 * entre as duas coisas, o que custa espaço e nada mais — o inverso (linha sem
 * arquivo) apareceria na tela como download quebrado.
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import { ACAO_LOG } from "@/lib/tarefa-etapas";
import {
  ANEXOS_MAXIMO_POR_TAREFA,
  TAMANHO_MAXIMO_BYTES,
  ehImagem,
  iconeDoAnexo,
  nomeParaDisco,
  tamanhoLegivel,
  validarTipo,
} from "@/lib/tarefa-anexo";
import { caminhoDoAnexo, diretorioAnexos } from "@/lib/tarefa-anexo-disco";

export const runtime = "nodejs";

const SELECAO = {
  id: true,
  apuracaoId: true,
  processoId: true,
  nomeOriginal: true,
  arquivo: true,
  tipoMime: true,
  tamanhoBytes: true,
  enviadoPorId: true,
  enviadoPorNome: true,
  descricao: true,
  createdAt: true,
} satisfies Prisma.TarefaAnexoSelect;

type AnexoBruto = Prisma.TarefaAnexoGetPayload<{ select: typeof SELECAO }>;

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    code ? { error: mensagem, code } : { error: mensagem },
    { status }
  );
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length ? limpo : null;
}

/**
 * Campos derivados que a tela consome.
 *
 * `url` é montada aqui e não na tela porque o download passa por rota própria
 * (que confere a sessão) e nunca por caminho de disco: servir `/uploads/x.pdf`
 * como arquivo estático deixaria qualquer pessoa com o nome baixar o contrato
 * social de um cliente.
 */
function comExtras(anexo: AnexoBruto) {
  return {
    ...anexo,
    url: `/api/tarefas/anexos/${anexo.id}`,
    tamanhoLegivel: tamanhoLegivel(anexo.tamanhoBytes),
    ehImagem: ehImagem(anexo.tipoMime),
    icone: iconeDoAnexo(anexo.tipoMime),
  };
}

/**
 * Resolve a tarefa alvo a partir do corpo ou da query.
 *
 * Exatamente uma das duas: as duas juntas apareceriam em duas tarefas, nenhuma
 * ficaria invisível. O banco também impõe isso por CHECK — aqui a checagem existe
 * para o erro ser legível em vez de violação de constraint.
 */
async function resolverAlvo(
  apuracaoId: string | null,
  processoId: string | null
): Promise<
  | { ok: true; apuracaoId: string | null; processoId: string | null }
  | { ok: false; resposta: NextResponse }
> {
  if (!apuracaoId && !processoId) {
    return {
      ok: false,
      resposta: erro(
        "Informe apuracaoId ou processoId.",
        400,
        "TAREFA_OBRIGATORIA"
      ),
    };
  }
  if (apuracaoId && processoId) {
    return {
      ok: false,
      resposta: erro(
        "Informe apenas apuracaoId ou apenas processoId, não os dois.",
        400,
        "TAREFA_AMBIGUA"
      ),
    };
  }

  if (apuracaoId) {
    const existe = await prisma.tarefaApuracao.findUnique({
      where: { id: apuracaoId },
      select: { id: true },
    });
    if (!existe) {
      return {
        ok: false,
        resposta: erro("Competência não encontrada.", 404, "TAREFA_NAO_ENCONTRADA"),
      };
    }
    return { ok: true, apuracaoId, processoId: null };
  }

  const existe = await prisma.processoLegalizacao.findUnique({
    where: { id: processoId as string },
    select: { id: true },
  });
  if (!existe) {
    return {
      ok: false,
      resposta: erro("Processo não encontrado.", 404, "TAREFA_NAO_ENCONTRADA"),
    };
  }
  return { ok: true, apuracaoId: null, processoId };
}

/* -------------------------------------------------------------------------- */
/*                                    GET                                     */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const params = req.nextUrl.searchParams;
  const apuracaoId = texto(params.get("apuracaoId"));
  const processoId = texto(params.get("processoId"));

  if (!apuracaoId && !processoId) {
    return erro("Informe apuracaoId ou processoId.", 400, "TAREFA_OBRIGATORIA");
  }

  try {
    const anexos = await prisma.tarefaAnexo.findMany({
      where: apuracaoId ? { apuracaoId } : { processoId },
      select: SELECAO,
      // Mais recente primeiro: o anexo que acabou de subir é o que se procura.
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      anexos: anexos.map(comExtras),
      total: anexos.length,
      limite: ANEXOS_MAXIMO_POR_TAREFA,
    });
  } catch (e) {
    console.error("[anexos][GET] falha ao listar:", e);
    return erro("Erro ao listar os anexos.", 500);
  }
}

/* -------------------------------------------------------------------------- */
/*                                    POST                                    */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    return erro(
      "Envie o arquivo como multipart/form-data.",
      400,
      "CORPO_INVALIDO"
    );
  }

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) {
    return erro("Nenhum arquivo recebido.", 400, "ARQUIVO_OBRIGATORIO");
  }

  const alvo = await resolverAlvo(
    texto(formulario.get("apuracaoId")),
    texto(formulario.get("processoId"))
  );
  if (!alvo.ok) return alvo.resposta;

  // Arquivo de 0 byte é upload que morreu no meio. Gravar a linha faria a tela
  // oferecer um download vazio, e o CHECK do banco recusaria de todo jeito.
  if (arquivo.size <= 0) {
    return erro(
      "O arquivo está vazio. Tente enviar novamente.",
      400,
      "ARQUIVO_VAZIO"
    );
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return erro(
      `Arquivo muito grande (${tamanhoLegivel(
        arquivo.size
      )}). O limite é ${tamanhoLegivel(TAMANHO_MAXIMO_BYTES)}.`,
      413,
      "ARQUIVO_GRANDE"
    );
  }

  const nomeOriginal = (arquivo.name || "arquivo").slice(0, 255);
  const tipo = validarTipo(arquivo.type, nomeOriginal);
  if (!tipo.ok) return erro(tipo.erro, 415, "TIPO_NAO_ACEITO");

  const descricao = texto(formulario.get("descricao"));

  try {
    // Teto por tarefa: anexo é apoio, não repositório. Sem limite, um card com
    // 400 arquivos deixa a tela de detalhe impraticável.
    const quantos = await prisma.tarefaAnexo.count({
      where: alvo.apuracaoId
        ? { apuracaoId: alvo.apuracaoId }
        : { processoId: alvo.processoId },
    });
    if (quantos >= ANEXOS_MAXIMO_POR_TAREFA) {
      return erro(
        `Esta tarefa já tem ${quantos} anexos, que é o limite. Remova algum antes de enviar outro.`,
        409,
        "LIMITE_DE_ANEXOS"
      );
    }

    const pasta = diretorioAnexos();
    await mkdir(pasta, { recursive: true });

    const nomeDisco = nomeParaDisco(nomeOriginal);
    const destino = caminhoDoAnexo(nomeDisco);
    if (!destino) {
      // Só acontece se `nomeParaDisco` deixar passar separador, o que a
      // higienização impede. A guarda fica porque o custo é uma comparação.
      return erro("Nome de arquivo inválido.", 400, "NOME_INVALIDO");
    }

    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    await writeFile(destino, conteudo);

    try {
      const criado = await prisma.$transaction(async (tx) => {
        const anexo = await tx.tarefaAnexo.create({
          data: {
            apuracaoId: alvo.apuracaoId,
            processoId: alvo.processoId,
            nomeOriginal,
            arquivo: nomeDisco,
            tipoMime: tipo.tipoMime,
            tamanhoBytes: conteudo.byteLength,
            enviadoPorId: sessao.userId,
            enviadoPorNome: sessao.nome || sessao.email,
            descricao,
          },
          select: SELECAO,
        });

        // O log é append-only e o arquivo é apagável: sem esta linha, remover o
        // anexo apagaria o rastro de que ele existiu.
        await tx.tarefaLog.create({
          data: {
            apuracaoId: alvo.apuracaoId,
            processoId: alvo.processoId,
            acao: ACAO_LOG.ANEXO_ADICIONADO,
            para: nomeOriginal,
            detalhe: descricao,
            autorId: sessao.userId,
            autorNome: sessao.nome || sessao.email,
            autorPapel: sessao.papel,
          },
        });

        return anexo;
      });

      return NextResponse.json({ anexo: comExtras(criado) }, { status: 201 });
    } catch (falhaBanco) {
      // Arquivo já está no disco e o banco recusou: apagar o arquivo é o certo,
      // porque sem linha ele é invisível e nunca seria recuperado.
      await unlink(destino).catch(() => {});
      throw falhaBanco;
    }
  } catch (e) {
    console.error("[anexos][POST] falha ao enviar:", e);
    return erro("Erro ao enviar o anexo.", 500);
  }
}
