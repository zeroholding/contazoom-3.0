"use client";

/**
 * Um formulário recebido, inteiro, para o escritório.
 *
 * O conteúdo declarado é renderizado pelo MESMO componente do recibo do cliente
 * (`app/formulario/componentes/Resumo`). Duplicar aqui garantiria que um dia esta
 * tela mostrasse um campo que a do cliente não, ou o contrário — e a conversa
 * "está escrito aqui" / "não aparece aqui" é justamente o que o protocolo existe
 * para evitar.
 *
 * O que esta tela acrescenta e a do cliente não tem: download dos documentos,
 * situação da análise, observação interna e os dados de origem do envio.
 *
 * NÃO EXISTE BOTÃO DE EXCLUIR, em nenhum lugar desta tela. Documento entregue
 * pelo cliente nunca é apagado, e o formulário é a declaração dele. O banco
 * reforça com `ON DELETE RESTRICT` na chave estrangeira dos documentos.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cabecalho, Carregando, Painel, Vazio } from "./ui/tarefas/Base";
import { Area, Botao, Escolha } from "./ui/tarefas/Campos";
import Icone from "./ui/tarefas/Icone";
import { apiGet, apiPatch, mensagemDeErro } from "./ui/tarefas/api";
import { dataHora } from "./ui/tarefas/formato";
// A situação atual é comunicada pelo próprio `Escolha` do bloco de análise, que
// mostra o valor selecionado. Um selo além dele seria a mesma informação duas
// vezes na mesma tela.
import { SITUACAO_FORMULARIO_OPCOES } from "@/lib/formulario-abertura";
import {
  Resumo,
  type DadosEnviados,
  type DocumentoResumo,
} from "@/app/formulario/componentes/Resumo";

type Documento = DocumentoResumo & {
  id: string;
  tipoMime: string;
  createdAt: string;
  url: string;
  tamanhoLegivel: string;
  icone: string;
  ehImagem: boolean;
};

type Formulario = {
  id: string;
  protocolo: string;
  token: string;
  dados: DadosEnviados;
  situacao: string;
  observacaoInterna: string | null;
  ipOrigem: string | null;
  navegadorInfo: string | null;
  createdAt: string;
  updatedAt: string;
  documentos: Documento[];
};

export default function FormularioDetalheView({ id }: { id: string }) {
  const [dados, setDados] = useState<Formulario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await apiGet<{ formulario: Formulario }>(`/api/formulario/${id}`);
      setDados(r.formulario);
      setObservacao(r.formulario.observacaoInterna ?? "");
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(mudanca: {
    situacao?: string;
    observacaoInterna?: string;
  }) {
    setSalvando(true);
    setSalvo(false);
    try {
      const r = await apiPatch<{
        formulario: { situacao: string; observacaoInterna: string | null };
      }>(`/api/formulario/${id}`, mudanca);
      setDados((atual) =>
        atual
          ? {
              ...atual,
              situacao: r.formulario.situacao,
              observacaoInterna: r.formulario.observacaoInterna,
            }
          : atual
      );
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando && !dados) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Carregando texto="Carregando formulário" />
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
        <Painel>
          <div className="p-6">
            <Vazio
              icone="AlertTriangle"
              titulo="Formulário não encontrado"
              descricao={erro || "O formulário pedido não existe."}
              acao={
                <Link href="/admin/formulario">
                  <Botao variante="primario" icone="ArrowLeft">
                    Voltar para a lista
                  </Botao>
                </Link>
              }
            />
          </div>
        </Painel>
      </div>
    );
  }

  /** Documentos agrupados por dono, para o bloco de download. */
  const porDono = new Map<string, Documento[]>();
  dados.documentos.forEach((d) => {
    const lista = porDono.get(d.dono) ?? [];
    lista.push(d);
    porDono.set(d.dono, lista);
  });

  return (
    <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
      <Cabecalho
        titulo={dados.dados.nomeFantasia || dados.protocolo}
        descricao={`Protocolo ${dados.protocolo} · recebido em ${dataHora(dados.createdAt)}`}
        acoes={
          <>
            <Link href="/admin/formulario">
              <Botao variante="secundario" icone="ArrowLeft">
                Voltar
              </Botao>
            </Link>
            <Botao
              variante="secundario"
              icone="RefreshCw"
              onClick={carregar}
              carregando={carregando}
            >
              Atualizar
            </Botao>
          </>
        }
      />

      {erro && (
        <Painel>
          <p className="flex items-start gap-2 p-4 text-[13.5px] font-medium text-[#B42318]">
            <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
            {erro}
          </p>
        </Painel>
      )}

      {/* -------------------------- Análise do escritório ---------------------- */}
      <Painel
        titulo="Análise"
        descricao="Único bloco que o escritório altera. O que o cliente declarou é imutável: correção é um envio novo, com protocolo novo."
      >
        <div className="grid gap-5 p-5 lg:grid-cols-[18rem_1fr]">
          <Escolha
            rotulo="Situação"
            opcoes={SITUACAO_FORMULARIO_OPCOES}
            value={dados.situacao}
            disabled={salvando}
            onChange={(e) => void salvar({ situacao: e.target.value })}
            ajuda="Salva na hora."
          />

          <div>
            <Area
              rotulo="Observação interna"
              rows={4}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Anotação do escritório. O cliente nunca vê isto."
              ajuda="Não aparece no link do cliente."
            />
            <div className="mt-2.5 flex items-center gap-3">
              <Botao
                variante="primario"
                icone="Save"
                carregando={salvando}
                onClick={() => void salvar({ observacaoInterna: observacao })}
                disabled={observacao === (dados.observacaoInterna ?? "")}
              >
                Salvar observação
              </Botao>
              {salvo && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cz-laranja-forte)]">
                  <Icone nome="CheckCircle2" className="h-4 w-4" />
                  Salvo
                </span>
              )}
            </div>
          </div>
        </div>
      </Painel>

      {/* ---------------------------- O que foi enviado ------------------------ */}
      {/* `cz-form` no wrapper: o `Resumo` foi desenhado com a tipografia da tela
          pública, e sem a classe ele herdaria a fonte do painel e sairia com dois
          vocabulários tipográficos na mesma página. */}
      <div className="cz-form rounded-[14px] bg-transparent">
        <Resumo
          dados={dados.dados}
          documentos={dados.documentos}
          blocoDocumentos={
            <div className="mt-5 space-y-5">
              {dados.documentos.length === 0 ? (
                <p className="text-[0.9375rem] text-[#667085]">
                  Nenhum documento anexado.
                </p>
              ) : (
                [...porDono.entries()].map(([dono, lista]) => (
                  <div key={dono}>
                    <p className="text-[0.8125rem] font-bold uppercase tracking-wide text-[#667085]">
                      {dono}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {lista.map((d) => (
                        <li key={d.id}>
                          {/* Link e não botão: abre em aba nova, e o operador
                              costuma querer o documento ao lado do formulário. */}
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cz-campo-foco flex items-center gap-3 rounded-[12px] border border-[#E7EAEF] bg-white py-2.5 pl-3 pr-4 transition-colors hover:border-[#F26212] hover:bg-[#FFFBF7]"
                          >
                            <span
                              aria-hidden="true"
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F7F8FA] text-[#667085]"
                            >
                              <Icone
                                nome={d.icone}
                                className="h-[1.125rem] w-[1.125rem]"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[0.875rem] font-semibold text-[#101828]">
                                {d.rotulo}
                              </span>
                              <span className="block truncate text-[0.8125rem] text-[#667085]">
                                {d.nomeOriginal}
                                <span className="cz-num">
                                  {" · "}
                                  {d.tamanhoLegivel}
                                </span>
                              </span>
                            </span>
                            <Icone
                              nome="Download"
                              className="h-4 w-4 shrink-0 text-[#98A2B3]"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          }
        />
      </div>

      {/* ------------------------------- Origem -------------------------------- */}
      <Painel
        titulo="Origem do envio"
        descricao="Guardado porque a tela de envio é pública e sem login. Serve para investigar abuso."
        denso
      >
        <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dado rotulo="Protocolo">
            <span className="cz-num">{dados.protocolo}</span>
          </Dado>
          <Dado rotulo="Recebido em">{dataHora(dados.createdAt)}</Dado>
          <Dado rotulo="IP de origem">
            <span className="cz-num">{dados.ipOrigem || "—"}</span>
          </Dado>
          <Dado rotulo="Última alteração">{dataHora(dados.updatedAt)}</Dado>
          <Dado rotulo="Navegador" largo>
            <span className="break-all font-normal">
              {dados.navegadorInfo || "—"}
            </span>
          </Dado>
          <Dado rotulo="Link do cliente" largo>
            <a
              href={`/formulario/recibo/${dados.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 break-all font-medium text-[var(--cz-laranja-forte)] hover:underline"
            >
              /formulario/recibo/{dados.token}
              <Icone nome="ExternalLink" className="h-3.5 w-3.5 shrink-0" />
            </a>
          </Dado>
        </dl>
      </Painel>

      {/* Diz em voz alta o que a tela NÃO faz, para ninguém procurar o botão. */}
      <p className="flex items-start gap-2 rounded-[12px] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
        <Icone nome="Lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Formulário recebido e documentos do cliente não podem ser excluídos, nem
          por administrador. O conteúdo declarado também não é editável — apenas a
          situação e a observação interna. Uma correção de dado é um envio novo,
          que gera outro protocolo e preserva este.
        </span>
      </p>
    </div>
  );
}

function Dado({
  rotulo,
  children,
  largo = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
}) {
  return (
    <div className={`min-w-0 ${largo ? "sm:col-span-2" : ""}`}>
      <dt className="text-[12.5px] font-medium leading-[18px] text-[var(--cz-texto-suave)]">
        {rotulo}
      </dt>
      <dd className="mt-1 text-[13.5px] font-semibold leading-snug text-[var(--cz-texto)]">
        {children}
      </dd>
    </div>
  );
}
