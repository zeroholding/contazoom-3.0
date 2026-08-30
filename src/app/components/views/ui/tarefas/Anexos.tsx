"use client";

/**
 * Anexos de tarefa: documento e imagem no card.
 *
 * O componente tem DOIS MODOS, e a distinção é o ponto do arquivo:
 *
 *   - `EM ESPERA` (`tarefaId` ausente): usado no modal de CRIAÇÃO. A tarefa ainda
 *     não existe, então não há id para pendurar o arquivo. Os arquivos ficam em
 *     memória e a tela que cria chama `enviarAnexosPendentes` logo depois do
 *     POST, com o id que acabou de nascer.
 *
 *   - `AO VIVO` (`tarefaId` presente): usado no modal de EDIÇÃO e no detalhe.
 *     Cada arquivo sobe na hora, a lista vem da API, e remover apaga de verdade.
 *
 * Por que não gravar o arquivo antes e ligar depois: precisaria de uma área
 * temporária, de um id de rascunho e de uma rotina para varrer o que ninguém
 * confirmou. Segurar em memória e subir depois de criar resolve o mesmo problema
 * sem inventar estado no servidor — e se a criação falhar, não sobrou nada.
 *
 * O que a tela mostra é decidido pelo tipo do arquivo: ícone de imagem, de PDF,
 * de planilha. Sempre SVG do lucide, nunca emoji.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ErroApi, apiDelete, apiGet, apiUpload, mensagemDeErro } from "./api";
import { Botao } from "./Campos";
import { Aviso } from "./Base";
import Icone from "./Icone";
import { dataHora } from "./formato";
import {
  ACCEPT_ANEXO,
  ANEXOS_MAXIMO_POR_TAREFA,
  EXTENSOES_ACEITAS,
  TAMANHO_MAXIMO_BYTES,
  ehImagem,
  iconeDoAnexo,
  tamanhoLegivel,
  validarTipo,
} from "@/lib/tarefa-anexo";

/* -------------------------------------------------------------------------- */
/*                                   Tipos                                    */
/* -------------------------------------------------------------------------- */

export type AnexoTarefa = {
  id: string;
  nomeOriginal: string;
  tipoMime: string;
  tamanhoBytes: number;
  enviadoPorId: string;
  enviadoPorNome: string;
  descricao: string | null;
  createdAt: string;
  url: string;
  tamanhoLegivel: string;
  ehImagem: boolean;
  icone: string;
};

type RespostaLista = {
  anexos: AnexoTarefa[];
  total: number;
  limite: number;
};

/** Qual tarefa recebe o anexo. Exatamente uma das duas. */
export type AlvoAnexo =
  | { apuracaoId: string; processoId?: undefined }
  | { processoId: string; apuracaoId?: undefined };

/* -------------------------------------------------------------------------- */
/*                        Envio dos arquivos em espera                        */
/* -------------------------------------------------------------------------- */

export type ResultadoEnvio = {
  enviados: number;
  falhas: { nome: string; erro: string }[];
};

/**
 * Sobe os arquivos que ficaram em espera, depois de a tarefa existir.
 *
 * EM SÉRIE, não `Promise.all`. Três motivos, em ordem de peso: dez uploads
 * simultâneos de 20 MB saturam a conexão de quem está no escritório e nenhum
 * termina; a rota confere o teto de anexos por tarefa a cada chamada, e em
 * paralelo todas leriam a mesma contagem antiga; e falha parcial fica legível —
 * dá para dizer qual arquivo não subiu.
 *
 * Falha de um arquivo NÃO aborta os outros, e a tarefa continua criada. Perder a
 * tarefa porque o quarto anexo era grande demais seria trocar um problema
 * pequeno por um grande. A tela avisa o que faltou e a pessoa reenvia na edição.
 */
export async function enviarAnexosPendentes(
  alvo: AlvoAnexo,
  arquivos: File[]
): Promise<ResultadoEnvio> {
  const falhas: { nome: string; erro: string }[] = [];
  let enviados = 0;

  for (const arquivo of arquivos) {
    const formulario = new FormData();
    formulario.append("arquivo", arquivo);
    if (alvo.apuracaoId) formulario.append("apuracaoId", alvo.apuracaoId);
    if (alvo.processoId) formulario.append("processoId", alvo.processoId);

    try {
      await apiUpload("/api/tarefas/anexos", formulario);
      enviados += 1;
    } catch (falha) {
      falhas.push({
        nome: arquivo.name,
        erro: mensagemDeErro(falha) || "Falha no envio.",
      });
    }
  }

  return { enviados, falhas };
}

/* -------------------------------------------------------------------------- */
/*                            Validação no cliente                            */
/* -------------------------------------------------------------------------- */

/**
 * Confere tipo e tamanho antes de gastar a rede.
 *
 * A mesma regra vale no servidor, e é lá que ela decide — este bloco existe para
 * a pessoa saber que o arquivo não serve ANTES de esperar o upload de 40 MB
 * terminar para receber 413.
 */
function conferirArquivo(arquivo: File): string | null {
  if (arquivo.size <= 0) {
    return `"${arquivo.name}" está vazio.`;
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return `"${arquivo.name}" tem ${tamanhoLegivel(
      arquivo.size
    )} e o limite é ${tamanhoLegivel(TAMANHO_MAXIMO_BYTES)}.`;
  }
  const tipo = validarTipo(arquivo.type, arquivo.name);
  if (!tipo.ok) return `"${arquivo.name}": ${tipo.erro}`;
  return null;
}

/* -------------------------------------------------------------------------- */
/*                              Linha de arquivo                              */
/* -------------------------------------------------------------------------- */

function LinhaArquivo({
  icone,
  nome,
  detalhe,
  acao,
  href,
}: {
  icone: string;
  nome: string;
  detalhe: string;
  acao: React.ReactNode;
  href?: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-[10px] border border-[#EDEFF3] bg-white px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EDEFF3] bg-[#F8F9FB] text-[#6B7280]">
        <Icone nome={icone} className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <div className="min-w-0 flex-1">
        {href ? (
          // `target="_blank"` com `rel="noreferrer"`: abre o PDF ou a imagem sem
          // sair do formulário aberto, e sem dar à aba nova acesso a esta.
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[0.8125rem] font-semibold leading-5 text-[#14161B] transition-colors hover:text-[#C2410C]"
            title={nome}
          >
            {nome}
          </a>
        ) : (
          <p
            className="truncate text-[0.8125rem] font-semibold leading-5 text-[#14161B]"
            title={nome}
          >
            {nome}
          </p>
        )}
        <p className="truncate text-xs leading-5 text-[#6B7280]">{detalhe}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">{acao}</div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Área de seleção                               */
/* -------------------------------------------------------------------------- */

function AreaSelecao({
  onArquivos,
  desabilitado,
  ocupado,
  ajuda,
}: {
  onArquivos: (arquivos: File[]) => void;
  desabilitado: boolean;
  ocupado: boolean;
  ajuda: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  const receber = useCallback(
    (lista: FileList | null) => {
      if (!lista || lista.length === 0) return;
      onArquivos(Array.from(lista));
    },
    [onArquivos]
  );

  return (
    <div
      onDragOver={(evento) => {
        if (desabilitado) return;
        // `preventDefault` nos dois: sem ele o navegador ABRE o arquivo na aba,
        // descartando o formulário preenchido.
        evento.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(evento) => {
        evento.preventDefault();
        setArrastando(false);
        if (desabilitado) return;
        receber(evento.dataTransfer.files);
      }}
      className={`rounded-[10px] border border-dashed px-4 py-5 text-center transition-colors ${
        arrastando
          ? "border-[#F26212] bg-[#FFF7F2]"
          : "border-[#DCE0E7] bg-[#F8F9FB]"
      } ${desabilitado ? "opacity-60" : ""}`}
    >
      {/* O input fica escondido e o botão o aciona: o `<input type="file">`
          nativo não aceita estilo e mostra o texto do sistema operacional, em
          inglês em máquina configurada em inglês. */}
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACCEPT_ANEXO}
        className="hidden"
        disabled={desabilitado}
        onChange={(evento) => {
          receber(evento.target.files);
          // Zera o valor para escolher o MESMO arquivo de novo disparar
          // `change`. Sem isto, remover e reescolher o mesmo arquivo não faz
          // nada, e parece que a tela travou.
          evento.target.value = "";
        }}
      />

      <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
        <Icone nome="Paperclip" className="h-5 w-5" />
      </span>

      <Botao
        variante="secundario"
        icone="Upload"
        onClick={() => entrada.current?.click()}
        disabled={desabilitado}
        carregando={ocupado}
        textoCarregando="Enviando"
      >
        Escolher arquivos
      </Botao>

      <p className="mt-2 text-xs leading-5 text-[#6B7280]">
        Ou arraste os arquivos para cá. {ajuda}
      </p>
      <p className="mt-1 text-xs leading-5 text-[#9AA1AC]">
        Até {tamanhoLegivel(TAMANHO_MAXIMO_BYTES)} por arquivo ·{" "}
        {EXTENSOES_ACEITAS.join(" ")}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Anexos em espera (criação)                        */
/* -------------------------------------------------------------------------- */

export function AnexosEmEspera({
  arquivos,
  onMudar,
  desabilitado = false,
}: {
  arquivos: File[];
  onMudar: (arquivos: File[]) => void;
  desabilitado?: boolean;
}) {
  const [erro, setErro] = useState("");

  const acrescentar = useCallback(
    (novos: File[]) => {
      setErro("");

      const problemas: string[] = [];
      const aceitos: File[] = [];

      for (const arquivo of novos) {
        const problema = conferirArquivo(arquivo);
        if (problema) {
          problemas.push(problema);
          continue;
        }
        // Mesmo nome e mesmo tamanho = mesmo arquivo escolhido duas vezes. Não é
        // garantia absoluta, mas resolve o caso real (clicar duas vezes) sem ler
        // o conteúdo de cada arquivo para comparar.
        const repetido = arquivos.some(
          (atual) =>
            atual.name === arquivo.name && atual.size === arquivo.size
        );
        if (repetido) {
          problemas.push(`"${arquivo.name}" já está na lista.`);
          continue;
        }
        aceitos.push(arquivo);
      }

      const total = arquivos.length + aceitos.length;
      if (total > ANEXOS_MAXIMO_POR_TAREFA) {
        problemas.push(
          `O limite é ${ANEXOS_MAXIMO_POR_TAREFA} arquivos por tarefa.`
        );
        aceitos.length = Math.max(0, ANEXOS_MAXIMO_POR_TAREFA - arquivos.length);
      }

      if (aceitos.length > 0) onMudar([...arquivos, ...aceitos]);
      if (problemas.length > 0) setErro(problemas.join(" "));
    },
    [arquivos, onMudar]
  );

  const remover = useCallback(
    (indice: number) => {
      setErro("");
      onMudar(arquivos.filter((_, i) => i !== indice));
    },
    [arquivos, onMudar]
  );

  const cheio = arquivos.length >= ANEXOS_MAXIMO_POR_TAREFA;

  return (
    <div className="space-y-3">
      {erro && <Aviso tom="atencao" mensagem={erro} onFechar={() => setErro("")} />}

      <AreaSelecao
        onArquivos={acrescentar}
        desabilitado={desabilitado || cheio}
        ocupado={false}
        ajuda="Eles são enviados assim que a tarefa for criada."
      />

      {arquivos.length > 0 && (
        <ul className="space-y-2">
          {arquivos.map((arquivo, indice) => {
            const tipo = validarTipo(arquivo.type, arquivo.name);
            const mime = tipo.ok ? tipo.tipoMime : arquivo.type;
            return (
              <LinhaArquivo
                key={`${arquivo.name}-${arquivo.size}-${indice}`}
                icone={iconeDoAnexo(mime)}
                nome={arquivo.name}
                detalhe={`${tamanhoLegivel(arquivo.size)} · ${
                  ehImagem(mime) ? "imagem" : "documento"
                } · será enviado ao salvar`}
                acao={
                  <Botao
                    variante="fantasma"
                    tamanho="sm"
                    icone="Trash2"
                    disabled={desabilitado}
                    onClick={() => remover(indice)}
                    aria-label={`Remover ${arquivo.name} da lista`}
                  >
                    Remover
                  </Botao>
                }
              />
            );
          })}
        </ul>
      )}

      {arquivos.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs leading-5 text-[#6B7280]">
          <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {arquivos.length === 1
              ? "1 arquivo em espera."
              : `${arquivos.length} arquivos em espera.`}{" "}
            O envio acontece depois de a tarefa ser criada. Se algum falhar, a
            tarefa continua criada e a tela diz qual foi.
          </span>
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Anexos ao vivo (edição)                         */
/* -------------------------------------------------------------------------- */

export function AnexosDaTarefa({
  alvo,
  usuarioId,
  ehAdmin = false,
  podeEnviar = true,
  /** Muda para forçar recarga de fora (ex.: depois de criar a tarefa). */
  recarga = 0,
  onMudou,
}: {
  alvo: AlvoAnexo;
  /** Para saber quem pode remover: só quem enviou, ou administrador. */
  usuarioId?: string;
  ehAdmin?: boolean;
  podeEnviar?: boolean;
  recarga?: number;
  onMudou?: (total: number) => void;
}) {
  const [anexos, setAnexos] = useState<AnexoTarefa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [recargaLocal, setRecargaLocal] = useState(0);

  const consulta = alvo.apuracaoId
    ? `?apuracaoId=${encodeURIComponent(alvo.apuracaoId)}`
    : `?processoId=${encodeURIComponent(alvo.processoId as string)}`;

  /**
   * `onMudou` em ref, e fora das dependências.
   *
   * Os chamadores passam arrow inline, então a identidade muda a cada render — e
   * com ela nas dependências o efeito recarregaria a lista sem parar. É o mesmo
   * defeito que fazia o modal roubar o foco a cada tecla digitada.
   */
  const avisar = useRef(onMudou);
  avisar.current = onMudou;

  useEffect(() => {
    const controlador = new AbortController();
    let vivo = true;

    setCarregando(true);
    setErro("");

    apiGet<RespostaLista>(`/api/tarefas/anexos${consulta}`, controlador.signal)
      .then((dados) => {
        if (!vivo) return;
        const lista = dados.anexos ?? [];
        setAnexos(lista);
        avisar.current?.(lista.length);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return; // Abortado: já existe outra busca em curso.
        setErro(mensagem);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [consulta, recarga, recargaLocal]);

  const enviar = useCallback(
    async (arquivos: File[]) => {
      setErro("");

      const problemas: string[] = [];
      const aceitos: File[] = [];
      for (const arquivo of arquivos) {
        const problema = conferirArquivo(arquivo);
        if (problema) problemas.push(problema);
        else aceitos.push(arquivo);
      }

      if (aceitos.length === 0) {
        setErro(problemas.join(" ") || "Nenhum arquivo válido.");
        return;
      }

      setEnviando(true);
      const resultado = await enviarAnexosPendentes(alvo, aceitos);
      setEnviando(false);

      const todos = [
        ...problemas,
        ...resultado.falhas.map((f) => `"${f.nome}": ${f.erro}`),
      ];
      if (todos.length > 0) setErro(todos.join(" "));
      if (resultado.enviados > 0) setRecargaLocal((n) => n + 1);
    },
    [alvo]
  );

  const remover = useCallback(
    async (anexo: AnexoTarefa) => {
      setErro("");
      setRemovendo(anexo.id);
      try {
        await apiDelete(`/api/tarefas/anexos/${anexo.id}`);
        setAnexos((atual) => {
          const lista = atual.filter((a) => a.id !== anexo.id);
          avisar.current?.(lista.length);
          return lista;
        });
      } catch (falha) {
        if (falha instanceof ErroApi && falha.status === 404) {
          // Já não existe: o que a pessoa queria já aconteceu. Tirar da lista é
          // mais honesto que mostrar "não encontrado" para algo que ela pediu
          // para apagar.
          setAnexos((atual) => atual.filter((a) => a.id !== anexo.id));
        } else {
          setErro(mensagemDeErro(falha) || "Não foi possível remover o anexo.");
        }
      } finally {
        setRemovendo(null);
      }
    },
    []
  );

  const cheio = anexos.length >= ANEXOS_MAXIMO_POR_TAREFA;

  return (
    <div className="space-y-3">
      {erro && <Aviso mensagem={erro} onFechar={() => setErro("")} />}

      {podeEnviar && (
        <AreaSelecao
          onArquivos={enviar}
          desabilitado={enviando || cheio}
          ocupado={enviando}
          ajuda={
            cheio
              ? `Limite de ${ANEXOS_MAXIMO_POR_TAREFA} arquivos atingido.`
              : "O envio começa na hora."
          }
        />
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-xs text-[#6B7280]">
          <Icone nome="RefreshCw" className="h-3.5 w-3.5 animate-spin" />
          Carregando anexos
        </p>
      ) : anexos.length === 0 ? (
        <p className="flex items-start gap-1.5 rounded-[10px] border border-[#EDEFF3] bg-[#F8F9FB] px-3 py-2.5 text-xs leading-5 text-[#6B7280]">
          <Icone nome="Paperclip" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Nenhum anexo ainda. Contrato social, DBE, comprovante de taxa e
            documento do sócio ficam aqui, junto da tarefa.
          </span>
        </p>
      ) : (
        <ul className="space-y-2">
          {anexos.map((anexo) => {
            // Mesma regra do servidor, replicada só para não OFERECER o que vai
            // ser recusado. A decisão continua sendo lá.
            const podeRemover =
              ehAdmin || (!!usuarioId && anexo.enviadoPorId === usuarioId);

            return (
              <LinhaArquivo
                key={anexo.id}
                icone={anexo.icone}
                nome={anexo.nomeOriginal}
                href={anexo.url}
                detalhe={`${anexo.tamanhoLegivel} · ${
                  anexo.enviadoPorNome
                } · ${dataHora(anexo.createdAt)}${
                  anexo.descricao ? ` · ${anexo.descricao}` : ""
                }`}
                acao={
                  <>
                    <a
                      href={anexo.url}
                      download={anexo.nomeOriginal}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#6B7280] transition-colors hover:bg-[#F4F5F7] hover:text-[#14161B]"
                      aria-label={`Baixar ${anexo.nomeOriginal}`}
                      title="Baixar"
                    >
                      <Icone nome="Download" className="h-4 w-4" />
                    </a>
                    {podeRemover && (
                      <Botao
                        variante="fantasma"
                        tamanho="sm"
                        icone="Trash2"
                        carregando={removendo === anexo.id}
                        textoCarregando="Removendo"
                        onClick={() => remover(anexo)}
                        aria-label={`Remover ${anexo.nomeOriginal}`}
                      >
                        Remover
                      </Botao>
                    )}
                  </>
                }
              />
            );
          })}
        </ul>
      )}

      {!carregando && anexos.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs leading-5 text-[#6B7280]">
          <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {anexos.length === 1 ? "1 anexo" : `${anexos.length} anexos`} de até{" "}
            {ANEXOS_MAXIMO_POR_TAREFA}. Remover apaga o arquivo, mas o histórico
            guarda quem anexou e quando.
          </span>
        </p>
      )}
    </div>
  );
}
