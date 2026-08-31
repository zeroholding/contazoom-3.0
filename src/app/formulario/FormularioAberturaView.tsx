"use client";

/**
 * Formulário público de abertura de CNPJ.
 *
 * ROTA PÚBLICA, SEM LOGIN. Isso é decisão, não descuido: o Google Forms de hoje
 * avisa que "o nome, a foto e o e-mail associados à sua Conta do Google serão
 * registrados quando você fizer upload de arquivos", e na prática cliente sem
 * Gmail não consegue anexar documento nenhum. O link vem do comercial e a pessoa
 * preenche.
 *
 * SEM BANCO DE DADOS NESTA FASE. Nenhum model de Prisma, nenhuma migração. O
 * rascunho vive no `localStorage` e o envio final está declarado como em
 * homologação. O contrato do payload já existe (`payloadDeEnvio`), então ligar a
 * rota depois é escrever o endpoint, não redesenhar a tela.
 *
 * CINCO PASSOS, e a tensão vale registrar: passo tem custo, e página única seria
 * melhor se fossem 12 campos. São 20 perguntas, 13 delas repetidas por sócio —
 * com três sócios, página única passa de 45 campos numa rolagem só e a pessoa
 * perde onde está. A barra de progresso resolve o "não sei quanto falta", que é a
 * real reclamação contra multi-passo.
 *
 * O container usa `.cz-form` e NÃO `.cz-tarefas`. A primeira versão usava as
 * duas e herdava o campo do painel; ver o comentário de `.cz-form` em
 * `globals.css` e o de `componentes/Base.tsx` para o motivo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Modal } from "@/app/components/views/ui/tarefas/Modal";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  PASSOS,
  TOTAL_PASSOS,
  formularioVazio,
  limparCondicionais,
  socioVazio,
  validarPasso,
  type Erros,
  type FormularioAbertura,
  type Socio,
} from "@/lib/formulario-abertura";
import {
  lerRascunho,
  limparRascunho,
  salvarRascunho,
} from "@/lib/formulario-rascunho";
import { BotaoForm, Nota } from "./componentes/Base";
import { Concluido } from "./componentes/Concluido";
import { PassoSocios } from "./passos/PassoSocios";
import { PassoEmpresa } from "./passos/PassoEmpresa";
import { PassoSociedade } from "./passos/PassoSociedade";
import { PassoDocumentos } from "./passos/PassoDocumentos";
import { PassoRevisao } from "./passos/PassoRevisao";

export default function FormularioAberturaView() {
  const [dados, setDados] = useState<FormularioAbertura>(formularioVazio);
  const [passo, setPasso] = useState(0);
  const [erros, setErros] = useState<Erros>({});

  /** Passo mais avançado já validado. Limita o pulo para frente na trilha. */
  const [liberado, setLiberado] = useState(0);

  /**
   * Arquivos FORA do estado que vai para o `localStorage`.
   *
   * `File` não é serializável em JSON. Se entrasse no mesmo objeto do rascunho,
   * `JSON.stringify` o transformaria em `{}` silenciosamente e o anexo
   * desapareceria sem erro nenhum.
   */
  const [arquivos, setArquivos] = useState<Record<string, File[]>>({});

  const [rascunhoEncontrado, setRascunhoEncontrado] =
    useState<ReturnType<typeof lerRascunho>>(null);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [removendo, setRemovendo] = useState<number | null>(null);

  /**
   * Recibo do envio. `null` enquanto não enviou.
   *
   * Guardar o recibo em estado, e não só um booleano, é o que permite a tela de
   * conclusão mostrar o protocolo e o link — que é o que a pessoa vai printar.
   */
  const [recibo, setRecibo] = useState<{
    protocolo: string;
    url: string;
    documentos: number;
  } | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  const topo = useRef<HTMLDivElement>(null);
  const primeiraCarga = useRef(true);

  /* ------------------------------- Rascunho ------------------------------- */

  useEffect(() => {
    const achado = lerRascunho();
    // Pergunta antes de restaurar. Restaurar em silêncio assusta quem esperava um
    // formulário em branco, e ela não sabe de onde veio aquele CPF.
    if (achado) setRascunhoEncontrado(achado);
    primeiraCarga.current = false;
  }, []);

  useEffect(() => {
    if (primeiraCarga.current) return;
    if (rascunhoEncontrado) return; // Ainda não decidiu se restaura.
    // Debounce: salvar a cada tecla faria `JSON.stringify` do formulário inteiro
    // dezenas de vezes por segundo.
    const t = setTimeout(() => salvarRascunho(dados, passo), 800);
    return () => clearTimeout(t);
  }, [dados, passo, rascunhoEncontrado]);

  /* ------------------------------- Mutações ------------------------------- */

  /**
   * Toda mudança passa por `limparCondicionais`.
   *
   * É o que garante que campo que saiu da tela sai do payload. Sem isso alguém
   * marca "Casado", escolhe "Separação de bens", volta para "Solteiro" e envia um
   * regime de bens que a tela não mostrava mais.
   */
  const mudar = useCallback((parcial: Partial<FormularioAbertura>) => {
    setDados((atual) => limparCondicionais({ ...atual, ...parcial }));
  }, []);

  const mudarSocio = useCallback((indice: number, parcial: Partial<Socio>) => {
    setDados((atual) =>
      limparCondicionais({
        ...atual,
        socios: atual.socios.map((s, i) =>
          i === indice ? { ...s, ...parcial } : s
        ),
      })
    );
  }, []);

  const adicionarSocio = useCallback(() => {
    setDados((atual) =>
      limparCondicionais({ ...atual, socios: [...atual.socios, socioVazio()] })
    );
  }, []);

  /**
   * Remoção de sócio: reindexa os arquivos.
   *
   * As chaves de documento são posicionais (`socio.2.identidade`). Removendo o
   * sócio do meio sem reindexar, o RG do sócio 3 passaria a aparecer no bloco do
   * sócio 2 — arquivo trocando de dono em silêncio, que é exatamente o defeito
   * que esta tela existe para matar.
   */
  const removerSocio = useCallback((indice: number) => {
    setDados((atual) => {
      if (atual.socios.length <= 1) return atual;
      return limparCondicionais({
        ...atual,
        socios: atual.socios.filter((_, i) => i !== indice),
        socioDoEndereco:
          atual.socioDoEndereco === null
            ? null
            : atual.socioDoEndereco === indice
            ? null
            : atual.socioDoEndereco > indice
            ? atual.socioDoEndereco - 1
            : atual.socioDoEndereco,
      });
    });

    setArquivos((atual) => {
      const novo: Record<string, File[]> = {};
      Object.entries(atual).forEach(([chave, lista]) => {
        const m = /^socio\.(\d+)\.(.+)$/.exec(chave);
        if (!m) {
          novo[chave] = lista;
          return;
        }
        const i = Number(m[1]);
        if (i === indice) return; // Sai junto com a pessoa.
        novo[i > indice ? `socio.${i - 1}.${m[2]}` : chave] = lista;
      });
      return novo;
    });

    setErros({});
    setRemovendo(null);
  }, []);

  const mudarArquivos = useCallback((chave: string, lista: File[]) => {
    setArquivos((atual) => {
      if (lista.length) return { ...atual, [chave]: lista };
      return semAChave(atual, chave);
    });
    // Anexou: o erro daquele slot deixa de existir na hora, sem esperar avançar.
    setErros((atual) => (atual[chave] ? semAChave(atual, chave) : atual));
  }, []);

  /* ------------------------------ Navegação ------------------------------- */

  const chavesComArquivo = useMemo(
    () => new Set(Object.keys(arquivos).filter((k) => arquivos[k].length > 0)),
    [arquivos]
  );

  /**
   * Leva o foco ao primeiro campo com erro.
   *
   * A ordem de `Object.keys` no mapa de erros segue a ordem de inserção, e a
   * validação percorre os campos na ordem visual — então o primeiro erro do mapa
   * é o primeiro erro da tela.
   */
  function focarPrimeiroErro(mapa: Erros) {
    const primeira = Object.keys(mapa)[0];
    if (!primeira) return;

    // Só o bloco do sócio tem âncora própria; o resto rola para o topo, onde o
    // resumo de erros aparece.
    const socio = /^socios\.(\d+)\./.exec(primeira);
    const alvo = socio
      ? document.getElementById(`bloco-socio-${socio[1]}`)
      : topo.current;

    alvo?.scrollIntoView({ behavior: "smooth", block: "start" });

    // `aria-invalid` é posto pelo componente de campo, então serve de seletor sem
    // cada campo precisar de um id conhecido aqui.
    requestAnimationFrame(() => {
      const raiz: ParentNode = socio && alvo ? alvo : document;
      raiz.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    });
  }

  function avancar() {
    const mapa = validarPasso(passo, dados, chavesComArquivo);
    setErros(mapa);

    if (Object.keys(mapa).length) {
      focarPrimeiroErro(mapa);
      return;
    }

    if (passo === TOTAL_PASSOS - 1) {
      void enviar();
      return;
    }

    const proximo = passo + 1;
    setPasso(proximo);
    setLiberado((v) => Math.max(v, proximo));
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Voltar é livre: sem validação, sem confirmação, sem perder o digitado. */
  function voltar() {
    if (passo === 0) return;
    setErros({});
    setPasso(passo - 1);
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function irPara(destino: number) {
    // Para trás, livre. Para frente, só até onde já foi validado — senão a pessoa
    // cai na revisão sem ter preenchido nada.
    if (destino > liberado) return;
    setErros({});
    setPasso(destino);
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* -------------------------------- Envio -------------------------------- */

  /**
   * Envia de verdade.
   *
   * O slot vai no NOME DO CAMPO (`arquivo:socio.0.identidade`) e não num JSON
   * paralelo: assim é impossível o arquivo e o dono chegarem dessincronizados no
   * servidor, que é exatamente o defeito do Google Forms — cinco fotos numa caixa
   * comum e ninguém sabendo de quem era cada uma.
   *
   * O rascunho só é apagado DEPOIS do 201. Se apagasse antes e a rede caísse, a
   * pessoa perderia quarenta campos preenchidos por causa de um erro que não foi
   * dela.
   */
  async function enviar() {
    if (enviando) return;
    setEnviando(true);
    setErroEnvio("");

    try {
      const corpo = new FormData();
      corpo.append("dados", JSON.stringify(dados));

      let total = 0;
      Object.entries(arquivos).forEach(([slot, lista]) => {
        lista.forEach((arquivo) => {
          corpo.append(`arquivo:${slot}`, arquivo, arquivo.name);
          total += 1;
        });
      });

      const resposta = await fetch("/api/formulario", {
        method: "POST",
        body: corpo,
      });

      const json = (await resposta.json().catch(() => null)) as
        | {
            protocolo?: string;
            url?: string;
            documentos?: number;
            error?: string;
            campos?: Erros;
          }
        | null;

      if (!resposta.ok) {
        // 422 traz o mapa de campos do servidor. Mostrar esses erros nos campos, e
        // não só uma faixa genérica, é o que permite a pessoa consertar: "um campo
        // precisa de correção" sem dizer qual é um beco sem saída.
        if (resposta.status === 422 && json?.campos) {
          setErros(json.campos);
          setErroEnvio(
            json.error ||
              "Alguns campos precisam de correção. Use o Editar de cada bloco."
          );
        } else {
          setErroEnvio(
            json?.error ||
              "Não conseguimos enviar agora. Confira sua conexão e tente novamente."
          );
        }
        return;
      }

      if (!json?.protocolo || !json?.url) {
        setErroEnvio("Resposta inesperada do servidor. Tente novamente.");
        return;
      }

      // Agora sim: o envio está no banco, o rascunho local não serve mais e tem
      // CPF e endereço em texto claro no aparelho.
      limparRascunho();

      setRecibo({
        protocolo: json.protocolo,
        url: json.url,
        documentos: json.documentos ?? total,
      });
      topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setErroEnvio(
        "Não conseguimos enviar agora. Confira sua conexão e tente novamente."
      );
    } finally {
      setEnviando(false);
    }
  }

  function recomecar() {
    limparRascunho();
    setDados(formularioVazio());
    setArquivos({});
    setErros({});
    setPasso(0);
    setLiberado(0);
    setRecibo(null);
    setErroEnvio("");
    setConfirmandoLimpeza(false);
    setRascunhoEncontrado(null);
  }

  /* -------------------------------- Tela --------------------------------- */

  const quantosErros = Object.keys(erros).length;
  const socioRemovido = removendo !== null ? dados.socios[removendo] : null;

  return (
    // `lang` aqui porque o root layout declara `<html lang="en">`: sem isso o
    // leitor de tela lê português com fonética inglesa e o autofill erra os
    // campos. Trocar no root afeta o app inteiro e é decisão separada desta.
    <div lang="pt-BR" className="cz-form min-h-screen pb-28 sm:pb-14">
      {/* ------------------------------ Topo ---------------------------------- */}
      <header className="border-b border-[#E7EAEF] bg-white">
        <div className="mx-auto max-w-[920px] px-4 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
          {/* A logo de verdade, a mesma do login e da barra lateral. */}
          <Image
            src="/logopng.webp"
            alt="ContaZoom"
            width={210}
            height={48}
            className="h-8 w-auto object-contain sm:h-9"
            priority
          />

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFDCC4] bg-[#FFF4EC] px-3 py-1 text-[0.75rem] font-bold uppercase tracking-[0.04em] text-[#C2410C]">
              <Icone nome="Landmark" className="h-3.5 w-3.5" />
              Legalização
            </span>
            <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-[#667085]">
              <Icone nome="Clock" className="h-3.5 w-3.5" />
              cerca de 10 minutos
            </span>
          </div>

          <h1 className="mt-3 text-[1.75rem] font-bold leading-9 tracking-[-0.03em] text-[#101828] sm:text-[2.125rem] sm:leading-[2.75rem]">
            Abertura de CNPJ
          </h1>
          <p className="mt-2.5 max-w-2xl text-[1rem] leading-[1.6] text-[#667085]">
            Preencha os dados dos sócios e da empresa, e anexe os documentos de
            cada pessoa. O que você digitar fica salvo neste navegador, então dá
            para parar e voltar depois.
          </p>
        </div>

        <Trilha
          passo={passo}
          liberado={liberado}
          onIr={irPara}
          concluido={!!recibo}
        />
      </header>

      <main
        ref={topo}
        className="mx-auto max-w-[920px] scroll-mt-24 px-4 py-6 sm:px-8 sm:py-10"
      >
        {recibo ? (
          <Concluido
            protocolo={recibo.protocolo}
            url={recibo.url}
            documentos={recibo.documentos}
            onRecomecar={recomecar}
          />
        ) : (
          <>
            {/* Resumo de erros no topo, em `role="alert"`: quem usa leitor de tela
                precisa ouvir que a tentativa falhou, não só ver vermelho. */}
            {quantosErros > 0 && (
              <Nota tom="erro" className="mb-6">
                {quantosErros === 1
                  ? "Falta corrigir 1 campo neste passo."
                  : `Faltam corrigir ${quantosErros} campos neste passo.`}{" "}
                Eles estão marcados em vermelho abaixo.
              </Nota>
            )}

            {/* Falha de envio é separada da falha de validação: uma é "conserte o
                campo", a outra é "tente de novo", e tratá-las com a mesma faixa
                faria a pessoa procurar um campo errado que não existe. */}
            {erroEnvio && (
              <Nota tom="erro" className="mb-6">
                {erroEnvio}
              </Nota>
            )}

            {passo === 0 && (
              <PassoSocios
                dados={dados}
                erros={erros}
                onMudarSocio={mudarSocio}
                onAdicionar={adicionarSocio}
                onPedirRemocao={setRemovendo}
              />
            )}
            {passo === 1 && (
              <PassoEmpresa dados={dados} erros={erros} onMudar={mudar} />
            )}
            {passo === 2 && (
              <PassoSociedade
                dados={dados}
                erros={erros}
                onMudarSocio={mudarSocio}
                onMudar={mudar}
              />
            )}
            {passo === 3 && (
              <PassoDocumentos
                dados={dados}
                erros={erros}
                arquivos={arquivos}
                onMudarArquivos={mudarArquivos}
              />
            )}
            {passo === 4 && (
              <PassoRevisao
                dados={dados}
                erros={erros}
                arquivos={arquivos}
                onIrParaPasso={irPara}
                onMudar={mudar}
              />
            )}

            {/* Aviso do que o botão faz, só na revisão. No passo 1 seria ruído
                sobre algo que ainda não vai acontecer. */}
            {passo === 4 && (
              <Nota tom="info" className="mt-5">
                Ao finalizar, os dados e os documentos são enviados ao escritório e
                você recebe um protocolo e um link para consultar depois.
              </Nota>
            )}

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setConfirmandoLimpeza(true)}
                className="cz-campo-foco inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[0.8125rem] font-semibold text-[#98A2B3] transition-colors hover:bg-[#F2F4F7] hover:text-[#B42318]"
              >
                <Icone nome="Trash2" className="h-4 w-4" />
                Limpar preenchimento
              </button>
            </div>
          </>
        )}
      </main>

      {/* ---------------------------- Navegação -------------------------------- */}
      {!recibo && (
        // Fixa no rodapé no celular: sem isso, avançar exige rolar 40 campos até o
        // fim. No desktop volta a ser um bloco normal no fluxo.
        <nav
          aria-label="Navegação do formulário"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E7EAEF] bg-white/95 backdrop-blur sm:static sm:border-t-0 sm:bg-transparent sm:backdrop-blur-none"
        >
          <div className="mx-auto flex max-w-[920px] items-center gap-3 px-4 py-3 sm:px-8 sm:pb-0 sm:pt-0">
            <BotaoForm
              variante="secundario"
              icone="ArrowLeft"
              onClick={voltar}
              disabled={passo === 0 || enviando}
            >
              <span className="hidden sm:inline">Voltar</span>
            </BotaoForm>
            <BotaoForm
              variante="primario"
              icone={enviando ? "Loader" : undefined}
              iconeDireita={
                enviando
                  ? undefined
                  : passo === TOTAL_PASSOS - 1
                  ? "Send"
                  : "ArrowRight"
              }
              onClick={avancar}
              // Desabilitar durante o envio é o que impede o envio dobrado: dois
              // toques no botão criariam dois protocolos com os mesmos documentos.
              disabled={enviando}
              larguraCheia
              className={`sm:w-auto! sm:min-w-[13rem] ${enviando ? "[&>svg]:animate-spin" : ""}`}
            >
              {enviando
                ? "Enviando…"
                : passo === TOTAL_PASSOS - 1
                ? "Enviar formulário"
                : "Continuar"}
            </BotaoForm>
          </div>
        </nav>
      )}

      {/* ------------------------------ Modais -------------------------------- */}

      <Modal
        aberto={!!rascunhoEncontrado}
        titulo="Continuar de onde parou?"
        descricao="Encontramos um preenchimento em andamento neste navegador."
        icone="History"
        largura="sm"
        onFechar={() => setRascunhoEncontrado(null)}
        rodape={
          <>
            <BotaoForm variante="secundario" onClick={recomecar}>
              Começar de novo
            </BotaoForm>
            <BotaoForm
              variante="primario"
              icone="RotateCcw"
              onClick={() => {
                if (!rascunhoEncontrado) return;
                setDados(rascunhoEncontrado.dados);
                setPasso(rascunhoEncontrado.passo);
                setLiberado(rascunhoEncontrado.passo);
                setRascunhoEncontrado(null);
              }}
            >
              Continuar
            </BotaoForm>
          </>
        }
      >
        <p className="text-[0.9375rem] leading-6 text-[#475467]">
          Os campos de texto voltam como estavam.{" "}
          <strong className="font-semibold text-[#B54708]">
            Os arquivos precisam ser escolhidos de novo
          </strong>
          , porque anexo não fica salvo no navegador.
        </p>
      </Modal>

      <Modal
        aberto={removendo !== null}
        titulo="Remover este sócio?"
        icone="Trash2"
        largura="sm"
        onFechar={() => setRemovendo(null)}
        rodape={
          <>
            <BotaoForm variante="secundario" onClick={() => setRemovendo(null)}>
              Cancelar
            </BotaoForm>
            <BotaoForm
              variante="perigo"
              icone="Trash2"
              onClick={() => removendo !== null && removerSocio(removendo)}
            >
              Remover
            </BotaoForm>
          </>
        }
      >
        {/* Nomeia quem sai. Reduzir a quantidade sem dizer de quem eram os dados
            apagaria trabalho em silêncio. */}
        <p className="text-[0.9375rem] leading-6 text-[#475467]">
          Os dados e documentos de{" "}
          <strong className="font-semibold text-[#101828]">
            {socioRemovido?.nome.trim() ||
              `Sócio ${removendo !== null ? removendo + 1 : ""}`}
          </strong>{" "}
          serão apagados deste formulário.
        </p>
      </Modal>

      <Modal
        aberto={confirmandoLimpeza}
        titulo="Limpar tudo?"
        icone="AlertTriangle"
        largura="sm"
        onFechar={() => setConfirmandoLimpeza(false)}
        rodape={
          <>
            <BotaoForm
              variante="secundario"
              onClick={() => setConfirmandoLimpeza(false)}
            >
              Cancelar
            </BotaoForm>
            <BotaoForm variante="perigo" icone="Trash2" onClick={recomecar}>
              Limpar tudo
            </BotaoForm>
          </>
        }
      >
        <p className="text-[0.9375rem] leading-6 text-[#475467]">
          Todos os campos e arquivos deste formulário serão apagados, inclusive o
          rascunho salvo neste navegador. Não tem como desfazer.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Cópia do objeto sem uma chave.
 *
 * Existe porque a alternativa idiomática (`const { [chave]: _fora, ...resto }`)
 * declara uma variável que nunca é lida, e o lint do projeto reclama com razão:
 * variável não usada é normalmente defeito, e abrir exceção por caso esconderia
 * as reclamações legítimas.
 */
function semAChave<T>(
  objeto: Record<string, T>,
  chave: string
): Record<string, T> {
  const copia = { ...objeto };
  delete copia[chave];
  return copia;
}

/* -------------------------------------------------------------------------- */
/*                                  Trilha                                    */
/* -------------------------------------------------------------------------- */

/**
 * Barra de passos. `sticky` no topo: rolando 40 campos, saber onde se está vale
 * mais que os 60px de tela que ela custa.
 *
 * No celular o rótulo do passo não cabe, então só o passo ATUAL mostra o texto —
 * os outros ficam com o número e a linha. Mostrar cinco rótulos de 10 caracteres
 * em 390px produzia texto cortado no meio da palavra.
 */
function Trilha({
  passo,
  liberado,
  onIr,
  concluido,
}: {
  passo: number;
  liberado: number;
  onIr: (destino: number) => void;
  concluido: boolean;
}) {
  return (
    <div className="sticky top-0 z-30 border-t border-[#E7EAEF] bg-white/95 backdrop-blur">
      <ol className="mx-auto flex max-w-[920px] items-stretch gap-1.5 px-4 sm:px-8">
        {PASSOS.map((p, i) => {
          const atual = !concluido && i === passo;
          const feito = concluido || i < passo;
          const alcancavel = !concluido && i <= liberado;

          return (
            <li key={p.chave} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onIr(i)}
                disabled={!alcancavel}
                aria-current={atual ? "step" : undefined}
                className={`group flex w-full flex-col items-center gap-2 pb-3 pt-3.5 ${
                  alcancavel ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold transition-colors ${
                      atual
                        ? "bg-[#F26212] text-white"
                        : feito
                        ? "bg-[#101828] text-white"
                        : "bg-[#EAECF0] text-[#98A2B3]"
                    }`}
                  >
                    {feito ? (
                      <Icone nome="CheckCircle2" className="h-3.5 w-3.5" />
                    ) : (
                      <span className="cz-num">{i + 1}</span>
                    )}
                  </span>
                  <span
                    className={`truncate text-[0.8125rem] font-semibold ${
                      atual
                        ? "inline text-[#C2410C]"
                        : feito
                        ? "hidden text-[#344054] sm:inline"
                        : "hidden text-[#98A2B3] sm:inline"
                    }`}
                  >
                    {p.titulo}
                  </span>
                </span>

                <span className="sr-only">
                  Passo {i + 1} de {PASSOS.length}: {p.titulo}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-[3px] w-full rounded-full transition-colors ${
                    atual
                      ? "bg-[#F26212]"
                      : feito
                      ? "bg-[#101828]"
                      : "bg-[#EAECF0]"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}


