/**
 * Recebimento do formulário público de abertura de CNPJ.
 *
 * POST /api/formulario   — PÚBLICA, sem login (multipart/form-data)
 * GET  /api/formulario   — interna, lista para o admin
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O POST É PÚBLICO, e o que isso obriga
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O Google Forms que esta tela substitui avisa que "o nome, a foto e o e-mail
 * associados à sua Conta do Google serão registrados quando você fizer upload de
 * arquivos". Na prática, cliente sem Gmail não conseguia anexar documento nenhum.
 * Exigir login aqui recriaria o mesmo problema com outro nome: o cliente não tem
 * conta no ContaZoom, e criar uma só para enviar um formulário é a barreira que
 * se está removendo.
 *
 * A CONSEQUÊNCIA É QUE ESTE É UM ENDPOINT ANÔNIMO QUE ESCREVE ARQUIVO EM DISCO, e
 * isso está tratado, não ignorado:
 *
 *   - teto por arquivo (20 MB, `TAMANHO_MAXIMO_BYTES`) e lista branca de tipo
 *     (`validarTipo`, que confere MIME **e** extensão);
 *   - teto de arquivos por envio e de bytes somados no envio inteiro;
 *   - throttle por IP em memória, para uma máquina não despejar mil envios;
 *   - REVALIDAÇÃO COMPLETA no servidor com as mesmas funções da tela. Validação de
 *     cliente é conveniência, não controle: quem posta direto no endpoint não
 *     passou por tela nenhuma;
 *   - IP e user-agent gravados, que é o que permite achar abuso depois.
 *
 * O que NÃO está aqui e vale dizer em voz alta: não há CAPTCHA nem verificação de
 * e-mail. Um atacante determinado consegue encher a pasta de uploads com arquivos
 * válidos de 20 MB dentro do limite de throttle. Mitigar isso de verdade pede
 * CAPTCHA ou link por token único por cliente, e as duas coisas são decisão de
 * produto — ficam declaradas como pendência, não silenciosamente ausentes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ORDEM DAS OPERAÇÕES
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Arquivos no disco PRIMEIRO, banco DEPOIS, e o banco todo dentro de uma
 * transação. Mesma escolha de `/api/tarefas/anexos`: se o disco falhar, não sobra
 * linha apontando para arquivo inexistente; se o banco falhar, os arquivos são
 * apagados no `catch`. A sobra possível é arquivo órfão quando o processo morre no
 * meio, o que custa espaço e nada mais — o inverso (linha sem arquivo) apareceria
 * como download quebrado para sempre, e aqui o arquivo é o RG do sócio.
 */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireInterno } from "@/lib/api-guard";
import {
  TAMANHO_MAXIMO_BYTES,
  nomeParaDisco,
  tamanhoLegivel,
  validarTipo,
} from "@/lib/tarefa-anexo";
import { caminhoDoDocumento, diretorioFormulario } from "@/lib/formulario-disco";
import { gerarProtocolo, gerarToken, pareceProtocolo, normalizarProtocolo } from "@/lib/formulario-protocolo";
import {
  MAXIMO_SOCIOS,
  capitalTotal,
  formularioVazio,
  gruposDeDocumentos,
  limparCondicionais,
  nomeDoArquivoComDono,
  payloadDeEnvio,
  validarDocumentos,
  validarEmpresa,
  validarRevisao,
  validarSociedade,
  validarSocios,
  type FormularioAbertura,
} from "@/lib/formulario-abertura";
import { somenteDigitos } from "@/lib/documento";

export const runtime = "nodejs";

/* -------------------------------------------------------------------------- */
/*                                  Limites                                   */
/* -------------------------------------------------------------------------- */

/**
 * Teto de arquivos no envio.
 *
 * Com 10 sócios são 3 obrigatórios por pessoa mais o IPTU, e cada slot aceita
 * mais de um arquivo (RG frente e verso). 60 dá folga confortável e ainda impede
 * que um envio único vire depósito.
 */
const MAXIMO_ARQUIVOS = 60;

/** Teto de bytes do envio inteiro. 60 arquivos de 20 MB seriam 1,2 GB. */
const MAXIMO_BYTES_ENVIO = 120 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/*                             Throttle por IP                                */
/* -------------------------------------------------------------------------- */

/**
 * DOIS limites, e a separação entre eles é a parte que importa.
 *
 * A primeira versão tinha um só: 5 requisições por IP a cada 10 minutos. Parecia
 * razoável e estava errado, e o teste de ponta a ponta mostrou por quê — uma
 * TENTATIVA RECUSADA gastava a cota. Quem preenche quarenta campos, esquece um
 * documento, corrige, erra o CPF, corrige de novo, chegava ao limite consertando
 * o próprio formulário e era barrado por dez minutos. Punir a pessoa por errar de
 * boa-fé é exatamente a hostilidade que esta tela existe para remover.
 *
 * Então:
 *
 *   - `MAXIMO_ENVIOS` (5) conta só ENVIO ACEITO, e é o que impede alguém de
 *     despejar formulários de verdade em série;
 *   - `MAXIMO_TENTATIVAS` (40) conta toda requisição, e é generoso de propósito:
 *     serve contra o flood, não contra a pessoa que está corrigindo. Quarenta
 *     tentativas em dez minutos não é mais alguém preenchendo um formulário.
 *
 * Em memória, e a limitação disso é honesta: com mais de uma instância do app o
 * contador é por instância, e um reinício zera. Serve contra o acidente e o script
 * ingênuo, não contra ataque distribuído — para isso o lugar certo é o proxy
 * (Traefik) ou um Redis, e nenhum dos dois está configurado para isso hoje.
 */
const JANELA_MS = 10 * 60 * 1000;
const MAXIMO_ENVIOS = 5;
const MAXIMO_TENTATIVAS = 40;

type Contagem = { tentativas: number; envios: number; desde: number };
const porIp = new Map<string, Contagem>();

function contagemDoIp(ip: string): Contagem {
  const agora = Date.now();
  const atual = porIp.get(ip);

  if (!atual || agora - atual.desde > JANELA_MS) {
    const nova: Contagem = { tentativas: 0, envios: 0, desde: agora };
    porIp.set(ip, nova);

    // Varredura preguiçosa: sem isso o Map cresce para sempre num processo de vida
    // longa. Feita aqui, e não num `setInterval`, para não manter timer vivo em
    // ambiente serverless.
    if (porIp.size > 5000) {
      for (const [chave, valor] of porIp) {
        if (agora - valor.desde > JANELA_MS) porIp.delete(chave);
      }
    }
    return nova;
  }
  return atual;
}

/** Chamada na entrada. Só o flood é barrado aqui. */
function floodExcedido(ip: string): boolean {
  const c = contagemDoIp(ip);
  c.tentativas += 1;
  return c.tentativas > MAXIMO_TENTATIVAS;
}

/** Chamada antes de gravar. É aqui que o envio de verdade é contado. */
function enviosExcedidos(ip: string): boolean {
  const c = contagemDoIp(ip);
  return c.envios >= MAXIMO_ENVIOS;
}

function registrarEnvio(ip: string): void {
  contagemDoIp(ip).envios += 1;
}

function ipDaRequisicao(req: NextRequest): string {
  // Atrás do Traefik o IP real vem no cabeçalho. O primeiro da lista é o cliente.
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

/* -------------------------------------------------------------------------- */
/*                                  Apoio                                     */
/* -------------------------------------------------------------------------- */

function erro(mensagem: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    code ? { error: mensagem, code } : { error: mensagem },
    { status }
  );
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Protocolo único, com tentativas.
 *
 * 30^6 combinações tornam a colisão improvável, mas "improvável" num `@unique` é
 * um 500 na cara do cliente que acabou de preencher quarenta campos. Cinco
 * tentativas e, se todas colidirem, o erro é explícito em vez de violação de
 * constraint.
 */
async function protocoloLivre(): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const candidato = gerarProtocolo();
    const existe = await prisma.formularioAbertura.findUnique({
      where: { protocolo: candidato },
      select: { id: true },
    });
    if (!existe) return candidato;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                                    POST                                    */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const ip = ipDaRequisicao(req);

  // Só o flood é barrado na entrada. Tentativa recusada por validação NÃO gasta a
  // cota de envios — ver o comentário dos dois limites acima.
  if (floodExcedido(ip)) {
    return erro(
      "Muitas tentativas deste dispositivo. Aguarde alguns minutos e tente novamente.",
      429,
      "MUITAS_TENTATIVAS"
    );
  }

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    return erro(
      "Envio inválido. Recarregue a página e tente novamente.",
      400,
      "CORPO_INVALIDO"
    );
  }

  /* ------------------------------ Os dados ------------------------------- */

  let dados: FormularioAbertura;
  try {
    const cru = texto(formulario.get("dados"));
    if (!cru) return erro("Nenhum dado recebido.", 400, "DADOS_OBRIGATORIOS");

    // Mescla sobre o vazio: campo que o cliente não mandou entra com o padrão em
    // vez de `undefined`, e a validação abaixo reclama dele pelo nome certo.
    const analisado = JSON.parse(cru) as Partial<FormularioAbertura>;
    dados = limparCondicionais({ ...formularioVazio(), ...analisado });
  } catch {
    return erro("Dados em formato inválido.", 400, "DADOS_INVALIDOS");
  }

  if (!Array.isArray(dados.socios) || dados.socios.length < 1) {
    return erro("Informe ao menos um sócio.", 400, "SEM_SOCIOS");
  }
  if (dados.socios.length > MAXIMO_SOCIOS) {
    return erro(
      `O limite é ${MAXIMO_SOCIOS} sócios por formulário.`,
      400,
      "SOCIOS_DEMAIS"
    );
  }

  /* ------------------------------ Os arquivos ---------------------------- */

  /**
   * Os arquivos chegam como campos `arquivo:<slot>`, repetidos.
   *
   * O slot vai no NOME DO CAMPO e não num JSON paralelo de propósito: assim é
   * impossível o arquivo e o slot chegarem dessincronizados, que é exatamente o
   * defeito do formulário antigo — cinco fotos numa caixa comum e ninguém sabendo
   * de quem era cada uma.
   */
  const recebidos: { slot: string; arquivo: File }[] = [];
  for (const [chave, valor] of formulario.entries()) {
    if (!chave.startsWith("arquivo:")) continue;
    if (!(valor instanceof File)) continue;
    const slot = chave.slice("arquivo:".length);
    if (slot) recebidos.push({ slot, arquivo: valor });
  }

  if (recebidos.length > MAXIMO_ARQUIVOS) {
    return erro(
      `Muitos arquivos (${recebidos.length}). O limite é ${MAXIMO_ARQUIVOS} por envio.`,
      413,
      "ARQUIVOS_DEMAIS"
    );
  }

  // Slots que a ÁRVORE DE DADOS admite. Arquivo de slot inexistente é envio
  // manipulado, ou tela desatualizada: nos dois casos não deve ser gravado.
  const grupos = gruposDeDocumentos(dados);
  const slotsValidos = new Map(
    grupos.flatMap((g) =>
      g.slots.map((s) => [s.chave, { rotulo: s.rotulo, dono: g.titulo }] as const)
    )
  );

  let bytesTotais = 0;
  for (const { slot, arquivo } of recebidos) {
    if (!slotsValidos.has(slot)) {
      return erro(
        "Um dos arquivos não corresponde a nenhum documento pedido. Recarregue a página e tente de novo.",
        400,
        "SLOT_DESCONHECIDO"
      );
    }
    if (arquivo.size <= 0) {
      return erro(
        `O arquivo "${arquivo.name}" está vazio. Tente enviar novamente.`,
        400,
        "ARQUIVO_VAZIO"
      );
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      return erro(
        `"${arquivo.name}" tem ${tamanhoLegivel(arquivo.size)}, acima do limite de ${tamanhoLegivel(TAMANHO_MAXIMO_BYTES)}.`,
        413,
        "ARQUIVO_GRANDE"
      );
    }
    const tipo = validarTipo(arquivo.type, arquivo.name || "arquivo");
    if (!tipo.ok) return erro(`"${arquivo.name}": ${tipo.erro}`, 415, "TIPO_NAO_ACEITO");

    bytesTotais += arquivo.size;
    if (bytesTotais > MAXIMO_BYTES_ENVIO) {
      return erro(
        `O envio somado passa de ${tamanhoLegivel(MAXIMO_BYTES_ENVIO)}. Reduza o tamanho dos arquivos.`,
        413,
        "ENVIO_GRANDE"
      );
    }
  }

  /* --------------------------- Revalidação total ------------------------- */

  /**
   * As MESMAS funções que a tela usa.
   *
   * Reaproveitar em vez de reescrever é o que garante que tela e servidor nunca
   * discordem: duas cópias da regra divergem na primeira alteração, e o sintoma é
   * o pior possível — o botão libera e a rota recusa, ou o contrário.
   */
  const chavesComArquivo = new Set(recebidos.map((r) => r.slot));
  const problemas = {
    ...validarSocios(dados),
    ...validarEmpresa(dados),
    ...validarSociedade(dados),
    ...validarDocumentos(dados, chavesComArquivo),
    ...validarRevisao(dados),
  };

  const quantos = Object.keys(problemas).length;
  if (quantos > 0) {
    return NextResponse.json(
      {
        error:
          quantos === 1
            ? "Um campo do formulário precisa de correção."
            : `${quantos} campos do formulário precisam de correção.`,
        code: "VALIDACAO",
        campos: problemas,
      },
      { status: 422 }
    );
  }

  /* ------------------------------- Gravação ------------------------------ */

  // Agora sim: o envio é válido e vai virar uma linha. É este que conta contra a
  // cota, e não a tentativa recusada lá atrás.
  if (enviosExcedidos(ip)) {
    return erro(
      `Já recebemos ${MAXIMO_ENVIOS} formulários deste dispositivo há pouco. Se precisar enviar outro, aguarde alguns minutos.`,
      429,
      "MUITOS_ENVIOS"
    );
  }

  const protocolo = await protocoloLivre();
  if (!protocolo) {
    console.error("[formulario][POST] não consegui gerar protocolo único");
    return erro(
      "Não conseguimos gerar o protocolo. Tente novamente.",
      500,
      "PROTOCOLO"
    );
  }

  const gravados: string[] = [];
  const paraBanco: Prisma.FormularioAberturaDocumentoCreateManyFormularioInput[] =
    [];

  try {
    const pasta = diretorioFormulario();
    await mkdir(pasta, { recursive: true });

    for (const { slot, arquivo } of recebidos) {
      const meta = slotsValidos.get(slot)!;
      const nomeOriginal = (arquivo.name || "arquivo").slice(0, 255);

      // O dono entra no NOME DO ARQUIVO. Mesmo que alguém baixe a pasta solta,
      // `socio-1-maria-silva--rg-cnh--rg.pdf` diz de quem é.
      const comDono = nomeDoArquivoComDono(slot, meta.dono, nomeOriginal);
      const nomeDisco = nomeParaDisco(comDono);
      const destino = caminhoDoDocumento(nomeDisco);
      if (!destino) {
        return erro("Nome de arquivo inválido.", 400, "NOME_INVALIDO");
      }

      const conteudo = Buffer.from(await arquivo.arrayBuffer());
      await writeFile(destino, conteudo);
      gravados.push(destino);

      const tipo = validarTipo(arquivo.type, nomeOriginal);
      paraBanco.push({
        slot,
        dono: meta.dono.slice(0, 255),
        rotulo: meta.rotulo.slice(0, 255),
        nomeOriginal,
        arquivo: nomeDisco,
        tipoMime: tipo.ok ? tipo.tipoMime : "application/octet-stream",
        tamanhoBytes: conteudo.byteLength,
      });
    }

    const socio = dados.socios[0];
    const payload = payloadDeEnvio(dados);

    const criado = await prisma.formularioAbertura.create({
      data: {
        protocolo,
        token: gerarToken(),
        dados: payload as unknown as Prisma.InputJsonValue,

        razaoSocialPretendida: dados.razaoSocialOpcoes[0].trim().slice(0, 255),
        nomeFantasia: dados.nomeFantasia.trim().slice(0, 255),

        socioPrincipalNome: socio.nome.trim().slice(0, 255),
        socioPrincipalCpf: somenteDigitos(socio.cpf),
        socioPrincipalEmail: socio.email.trim().slice(0, 255),
        socioPrincipalTelefone: somenteDigitos(socio.telefone),

        quantidadeSocios: dados.socios.length,
        capitalTotalCentavos: capitalTotal(dados.socios),

        ipOrigem: ip.slice(0, 100),
        navegadorInfo: (req.headers.get("user-agent") || "").slice(0, 255),

        // `create` aninhado, e não `createMany` solto: os documentos entram na
        // MESMA transação implícita do formulário. Sem isso um envio poderia
        // gravar o formulário e perder os anexos.
        documentos: { create: paraBanco },
      },
      select: { protocolo: true, token: true, createdAt: true },
    });

    registrarEnvio(ip);

    return NextResponse.json(
      {
        protocolo: criado.protocolo,
        token: criado.token,
        recebidoEm: criado.createdAt,
        url: `/formulario/recibo/${criado.token}`,
        documentos: paraBanco.length,
      },
      { status: 201 }
    );
  } catch (e) {
    // Arquivos já no disco e o banco recusou: apagar é o certo, porque sem linha
    // eles são invisíveis e nunca seriam recuperados. É o ÚNICO lugar do sistema
    // que apaga um arquivo desta pasta, e apaga só o que acabou de escrever num
    // envio que falhou — nada que já esteja registrado.
    await Promise.all(gravados.map((caminho) => unlink(caminho).catch(() => {})));
    console.error("[formulario][POST] falha ao receber:", e);
    return erro(
      "Não conseguimos registrar o formulário. Tente novamente em alguns instantes.",
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                    GET                                     */
/* -------------------------------------------------------------------------- */

const SELECAO_LISTA = {
  id: true,
  protocolo: true,
  token: true,
  razaoSocialPretendida: true,
  nomeFantasia: true,
  socioPrincipalNome: true,
  socioPrincipalCpf: true,
  socioPrincipalEmail: true,
  socioPrincipalTelefone: true,
  quantidadeSocios: true,
  capitalTotalCentavos: true,
  situacao: true,
  createdAt: true,
  _count: { select: { documentos: true } },
} satisfies Prisma.FormularioAberturaSelect;

const POR_PAGINA = 20;

export async function GET(req: NextRequest) {
  const sessao = await requireInterno(req);
  if (sessao instanceof NextResponse) return sessao;

  const params = req.nextUrl.searchParams;
  const busca = texto(params.get("busca"));
  const situacao = texto(params.get("situacao"));
  const pagina = Math.max(1, Number(params.get("pagina")) || 1);

  const where: Prisma.FormularioAberturaWhereInput = {};
  if (situacao) where.situacao = situacao;

  if (busca) {
    const digitos = somenteDigitos(busca);
    const ou: Prisma.FormularioAberturaWhereInput[] = [
      { socioPrincipalNome: { contains: busca, mode: "insensitive" } },
      { razaoSocialPretendida: { contains: busca, mode: "insensitive" } },
      { nomeFantasia: { contains: busca, mode: "insensitive" } },
      { socioPrincipalEmail: { contains: busca, mode: "insensitive" } },
    ];
    // Protocolo é comparado normalizado: quem digita está lendo de um papel ou de
    // um print, e exigir "CZ-" e a caixa exata transforma a busca em adivinhação.
    if (pareceProtocolo(busca)) {
      ou.push({ protocolo: normalizarProtocolo(busca) });
    }
    if (digitos.length >= 3) {
      ou.push({ socioPrincipalCpf: { contains: digitos } });
      ou.push({ socioPrincipalTelefone: { contains: digitos } });
    }
    where.OR = ou;
  }

  try {
    const [formularios, total] = await Promise.all([
      prisma.formularioAbertura.findMany({
        where,
        select: SELECAO_LISTA,
        // Mais recente primeiro: o que acabou de chegar é o que se procura.
        orderBy: { createdAt: "desc" },
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      prisma.formularioAbertura.count({ where }),
    ]);

    return NextResponse.json({
      formularios,
      total,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    });
  } catch (e) {
    console.error("[formulario][GET] falha ao listar:", e);
    return erro("Erro ao listar os formulários.", 500);
  }
}
