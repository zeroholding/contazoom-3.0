"use client";

/**
 * Confirmação de exclusão de empresa, competência ou processo.
 *
 * UM componente para os três, e não três parecidos: o texto de "isto não tem
 * volta" tem de ser idêntico nos três lugares. Três versões do mesmo aviso é
 * como uma delas acaba mais fraca que as outras — e vai ser justamente a da
 * empresa, que é a que apaga mil linhas.
 *
 * O QUE ESTE MODAL FAZ DE DIFERENTE de um "tem certeza?": ele CARREGA a prévia
 * do servidor antes de deixar confirmar. Quem clica vê o número real de
 * competências, etapas, registros de histórico e anexos que vão junto, mais os
 * avisos que só o servidor sabe (competência encerrada, protocolo em órgão
 * externo). "Tem certeza?" não informa nada; um botão desabilitado até a prévia
 * chegar informa tudo.
 *
 * Três estados, e nenhum deles deixa apagar por acidente:
 *
 *   carregando  -> botão desabilitado, ninguém confirma no escuro
 *   erro        -> botão desabilitado, porque não sabemos o que seria apagado
 *   pronto      -> mostra os números, exige motivo, e a digitação quando o
 *                  servidor manda `confirmacaoEsperada`
 */

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, mensagemDeErro } from "./api";
import { Aviso } from "./Base";
import { Area, Botao, Entrada } from "./Campos";
import { Modal } from "./Modal";
import Icone from "./Icone";
/**
 * As regras vêm de `@/lib/exclusao-regras`, o MESMO módulo que o servidor usa.
 *
 * A primeira versão deste componente tinha uma cópia da normalização. Se as duas
 * divergissem — uma aparando espaço, a outra não — o botão liberaria e a rota
 * recusaria, e o operador leria isso como sistema quebrado sem nenhuma pista.
 */
import {
  MOTIVO_MINIMO,
  confirmacaoConfere,
} from "@/lib/exclusao-regras";

type Contagem = { rotulo: string; quantidade: number };

/** O que a rota de prévia devolve. Ver `[id]/exclusao/route.ts`. */
type Previa = {
  tipo: string;
  alvoId: string;
  descricao: string;
  detalhe: string | null;
  contagens: Contagem[];
  arrastado: string;
  temDependentes: boolean;
  avisos: string[];
  /**
   * Só a empresa manda este campo. Quando vem, o modal exige que a pessoa digite
   * o texto para liberar o botão.
   */
  confirmacaoEsperada?: string;
};

export type ResultadoExclusao = {
  descricao: string;
  /** "24 competências, 251 etapas, 17 anexos" — para a mensagem de sucesso. */
  arrastado: string;
};

export function ModalExclusao({
  aberto,
  /** Rota de prévia. Ex.: `/api/empresas/abc/exclusao`. */
  urlPrevia,
  /** Rota de exclusão. Ex.: `/api/empresas/abc`. */
  urlExclusao,
  /** "empresa", "competência", "processo". Entra no título e nos textos. */
  rotulo,
  onFechar,
  onExcluido,
}: {
  aberto: boolean;
  urlPrevia: string;
  urlExclusao: string;
  rotulo: string;
  onFechar: () => void;
  onExcluido: (resultado: ResultadoExclusao) => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroPrevia, setErroPrevia] = useState("");

  const [motivo, setMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [tocado, setTocado] = useState(false);
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  /* ------------------------------- Prévia -------------------------------- */

  useEffect(() => {
    if (!aberto) return;

    const controlador = new AbortController();
    let vivo = true;

    // Estado zerado a cada abertura: motivo digitado para uma empresa não pode
    // sobrar no modal da próxima.
    setPrevia(null);
    setCarregando(true);
    setErroPrevia("");
    setMotivo("");
    setConfirmacao("");
    setTocado(false);
    setErro("");

    apiGet<Previa>(urlPrevia, controlador.signal)
      .then((dados) => {
        if (vivo) setPrevia(dados);
      })
      .catch((falha) => {
        if (!vivo) return;
        const mensagem = mensagemDeErro(falha);
        if (!mensagem) return; // Abortado.
        setErroPrevia(mensagem);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });

    return () => {
      vivo = false;
      controlador.abort();
    };
  }, [aberto, urlPrevia]);

  /* ------------------------------ Validação ------------------------------ */

  const motivoLimpo = motivo.trim();
  const motivoCurto = motivoLimpo.length < MOTIVO_MINIMO;

  const exigeDigitacao = !!previa?.confirmacaoEsperada;
  const digitacaoConfere =
    !exigeDigitacao ||
    confirmacaoConfere(confirmacao, previa!.confirmacaoEsperada!);

  const podeExcluir = !!previa && !motivoCurto && digitacaoConfere;

  const erroMotivo =
    tocado && motivoCurto
      ? motivoLimpo.length === 0
        ? "Informe o motivo da exclusão."
        : `Escreva ao menos ${MOTIVO_MINIMO} caracteres.`
      : null;

  const erroConfirmacao =
    tocado && exigeDigitacao && !digitacaoConfere && confirmacao.length > 0
      ? "O texto não confere com a razão social cadastrada."
      : null;

  /* ------------------------------- Excluir ------------------------------- */

  const excluir = useCallback(async () => {
    setTocado(true);
    if (!previa || motivoCurto || !digitacaoConfere) return;

    setErro("");
    setExcluindo(true);
    try {
      await apiDelete(urlExclusao, {
        motivo: motivoLimpo,
        // Enviado sempre que o servidor pediu. Quando não pediu, a chave nem
        // aparece no corpo.
        ...(exigeDigitacao ? { confirmacao } : {}),
      });
      onExcluido({ descricao: previa.descricao, arrastado: previa.arrastado });
    } catch (falha) {
      setErro(mensagemDeErro(falha) || "Não foi possível excluir.");
    } finally {
      setExcluindo(false);
    }
  }, [
    previa,
    motivoCurto,
    digitacaoConfere,
    urlExclusao,
    motivoLimpo,
    exigeDigitacao,
    confirmacao,
    onExcluido,
  ]);

  /* -------------------------------- Render ------------------------------- */

  return (
    <Modal
      aberto={aberto}
      titulo={`Excluir ${rotulo}`}
      icone="Trash2"
      largura="lg"
      descricao={
        previa
          ? previa.detalhe
            ? `${previa.descricao} · ${previa.detalhe}`
            : previa.descricao
          : undefined
      }
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={onFechar} disabled={excluindo}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            icone="Trash2"
            onClick={excluir}
            carregando={excluindo}
            textoCarregando="Excluindo"
            // Desabilitado enquanto a prévia não chega: ninguém confirma uma
            // exclusão sem saber o tamanho dela.
            disabled={!podeExcluir}
          >
            Excluir definitivamente
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <Aviso mensagem={erro} onFechar={() => setErro("")} />}

        {carregando ? (
          <p className="flex items-center gap-2 text-sm text-[#6B7280]">
            <Icone nome="RefreshCw" className="h-4 w-4 animate-spin" />
            Conferindo o que será excluído
          </p>
        ) : erroPrevia ? (
          <Aviso mensagem={erroPrevia} />
        ) : previa ? (
          <>
            {/* Aviso principal, sempre igual nos três casos. */}
            <Aviso
              mensagem={`Esta ação não tem volta. A ${rotulo} é apagada do banco de dados e não há como recuperar.`}
            />

            {/* O que vai junto, em número. É a informação que decide o clique. */}
            {previa.temDependentes ? (
              <div className="rounded-[10px] border border-[#FECDCA] bg-[#FEF2F2] px-4 py-3">
                <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[#B42318]">
                  <Icone nome="AlertTriangle" className="h-4 w-4 shrink-0" />
                  Vai junto, no mesmo clique:
                </p>
                <ul className="mt-2 space-y-1">
                  {previa.contagens.map((c) => (
                    <li
                      key={c.rotulo}
                      className="flex items-baseline gap-1.5 text-[0.8125rem] text-[#912018]"
                    >
                      <span className="cz-num font-bold">{c.quantidade}</span>
                      <span>{c.rotulo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-start gap-1.5 rounded-[10px] border border-[#EDEFF3] bg-[#F8F9FB] px-3 py-2.5 text-xs leading-5 text-[#6B7280]">
                <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Nada mais depende deste registro: nenhuma etapa, histórico ou
                  anexo será perdido junto.
                </span>
              </p>
            )}

            {/* Avisos que só o servidor sabe: competência encerrada, protocolo
                em órgão externo. Informam sem bloquear. */}
            {previa.avisos.map((aviso) => (
              <Aviso key={aviso} tom="atencao" mensagem={aviso} />
            ))}

            <Area
              rotulo="Motivo da exclusão"
              required
              rows={2}
              value={motivo}
              erro={erroMotivo}
              placeholder="Cadastro duplicado, criado por engano, cliente encerrou contrato"
              ajuda="Fica registrado com seu nome, e sobrevive à exclusão. É o que responde 'por que isso não está mais aqui' meses depois."
              onChange={(e) => setMotivo(e.target.value)}
              onBlur={() => setTocado(true)}
            />

            {/*
              Digitação da razão social, só para empresa.

              O servidor decide se exige, mandando `confirmacaoEsperada` — a tela
              não escolhe. É o mesmo recurso do GitHub para apagar repositório, e
              serve para o erro que de fato acontece: apagar a empresa errada da
              lista, porque os nomes são parecidos.
            */}
            {exigeDigitacao && (
              <Entrada
                rotulo="Digite a razão social para confirmar"
                required
                autoComplete="off"
                value={confirmacao}
                erro={erroConfirmacao}
                placeholder={previa.confirmacaoEsperada}
                ajuda="Maiúsculas e espaço em excesso não importam."
                onChange={(e) => setConfirmacao(e.target.value)}
                onBlur={() => setTocado(true)}
              />
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}


