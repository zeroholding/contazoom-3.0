"use client";

/**
 * Contas de plataforma.
 *
 * UM CARTÃO POR PLATAFORMA, QUE ABRE NO LUGAR
 *
 * A tela anterior tinha três cartões que NAVEGAVAM para uma tabela separada, com
 * um botão "Voltar". Para comparar duas plataformas era preciso entrar, voltar e
 * entrar de novo, e o estado da tela se perdia no caminho. Aqui o cartão abre no
 * lugar: as duas plataformas ficam visíveis ao mesmo tempo e é possível abrir as
 * duas de uma vez.
 *
 * O cartão INTEIRO é o gatilho de abrir. Os botões de dentro (conectar, renovar,
 * excluir) param a propagação, senão clicar em "Excluir" fecharia o cartão junto e
 * a confirmação apareceria sobre um painel que está se fechando.
 *
 * O QUE NÃO ESTÁ AQUI: TOKEN
 *
 * A tela antiga imprimia `access_token` e `refresh_token` numa coluna da tabela,
 * com um `blur` de CSS e um clique para revelar. O `blur` é enfeite — o valor
 * estava no HTML, disponível para qualquer extensão do navegador. Um refresh
 * token do Mercado Livre é a credencial de longo prazo da conta: com ele se
 * emitem acessos novos por tempo indeterminado.
 *
 * Agora a tela mostra a SITUAÇÃO derivada do token (ativa / expirado / precisa
 * reconectar) e quanto falta para vencer, que é tudo o que se precisa saber para
 * decidir entre renovar e reconectar. Os tokens não saem mais do servidor nesta
 * tela: `/api/contas` não os seleciona.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  Aviso,
  BotaoAtualizar,
  BotaoPrimario,
  BotaoSecundario,
  Cabecalho,
  Esqueleto,
  MolduraTela,
} from "./comum/shell";
import { inteiro } from "./comum/formato";
import { LogoMercadoLivre, LogoShopee } from "./comum/logos";
import {
  conectarConta,
  excluirConta,
  renovarToken,
  useContas,
} from "./contas/useContas";
import {
  CANAIS_CONTA,
  CANAL_CONTA_DESCRICAO,
  CANAL_CONTA_ID_ROTULO,
  CANAL_CONTA_NOME,
  dataHoraSP,
  dataSP,
  SITUACAO_CONTA_EXPLICACAO,
  SITUACAO_CONTA_ROTULO,
  SITUACAO_CONTA_SELO,
  validadeToken,
  type CanalConta,
  type ContaPlataforma,
} from "@/lib/contas";
import { useToast } from "./ui/toaster";

/* -------------------------------------------------------------------------- */
/*                                   Peças                                    */
/* -------------------------------------------------------------------------- */

function Logo({ canal, className }: { canal: CanalConta; className?: string }) {
  return canal === "ML" ? (
    <LogoMercadoLivre className={className} />
  ) : (
    <LogoShopee className={className} />
  );
}

function Seta({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-5 w-5 shrink-0 text-[var(--cz-texto-fraco)] transition-transform duration-300 ${
        aberto ? "rotate-180" : ""
      }`}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M5.8 7.5a1 1 0 0 1 1.4 0L10 10.3l2.8-2.8a1 1 0 1 1 1.4 1.4l-3.5 3.5a1 1 0 0 1-1.4 0L5.8 8.9a1 1 0 0 1 0-1.4Z"
      />
    </svg>
  );
}

/** Um dado da conta: rótulo pequeno em cima, valor embaixo. */
function Dado({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--cz-texto-fraco)]">
        {rotulo}
      </span>
      <span className="mt-0.5 block text-[13px] font-semibold text-[var(--cz-texto)]">
        {valor}
      </span>
      {nota && (
        <span className="block text-[10.5px] text-[var(--cz-texto-suave)]">{nota}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Conta (uma linha)                             */
/* -------------------------------------------------------------------------- */

function CartaoConta({
  conta,
  ocupado,
  onRenovar,
  onExcluir,
  onReconectar,
}: {
  conta: ContaPlataforma;
  ocupado: boolean;
  onRenovar: () => void;
  onExcluir: () => void;
  onReconectar: () => void;
}) {
  return (
    <li className="rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-fundo)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-[14px] font-bold text-[var(--cz-texto)]">
              {conta.nome}
            </h4>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${SITUACAO_CONTA_SELO[conta.situacao]}`}
            >
              {SITUACAO_CONTA_ROTULO[conta.situacao]}
            </span>
          </div>
          {/* A explicação só aparece quando há algo a fazer. Repetir "está tudo
              bem" em cada conta ativa seria ruído em cima do selo verde. */}
          {conta.situacao !== "ativa" && (
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
              {SITUACAO_CONTA_EXPLICACAO[conta.situacao]}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {conta.situacao === "expirada" && (
            <BotaoSecundario
              onClick={onRenovar}
              desabilitado={ocupado}
              className="h-9 px-3 text-[12.5px]"
            >
              {ocupado ? "Renovando…" : "Renovar agora"}
            </BotaoSecundario>
          )}
          {conta.situacao === "reconectar" && (
            <BotaoPrimario
              onClick={onReconectar}
              desabilitado={ocupado}
              className="h-9 px-3 text-[12.5px]"
            >
              Reconectar
            </BotaoPrimario>
          )}
          <button
            type="button"
            onClick={onExcluir}
            disabled={ocupado}
            className="inline-flex h-9 items-center justify-center rounded-[var(--cz-raio)] border border-rose-200 bg-white px-3 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ocupado ? "Aguarde…" : "Excluir"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <Dado rotulo={CANAL_CONTA_ID_ROTULO[conta.canal]} valor={conta.identificador} />
        <Dado rotulo="Conectada em" valor={dataSP(conta.conectadaEm)} />
        {/* O que se quer saber do token é se ele está de pé, não o valor dele. */}
        <Dado
          rotulo="Acesso"
          valor={validadeToken(conta.tokenExpiraEm)}
          nota={`renovado ${dataHoraSP(conta.tokenAtualizadoEm)}`}
        />
        <Dado rotulo="Vendas sincronizadas" valor={inteiro(conta.vendas)} />
        <Dado rotulo="Venda mais recente" valor={dataSP(conta.ultimaVenda)} />
        <Dado rotulo="Último sync" valor={dataHoraSP(conta.ultimoSync)} />
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Cartão de uma plataforma                          */
/* -------------------------------------------------------------------------- */

function CartaoPlataforma({
  canal,
  contas,
  aberto,
  onAlternar,
  ocupados,
  onRenovar,
  onExcluir,
  onConectar,
}: {
  canal: CanalConta;
  contas: ContaPlataforma[];
  aberto: boolean;
  onAlternar: () => void;
  ocupados: Set<string>;
  onRenovar: (conta: ContaPlataforma) => void;
  onExcluir: (conta: ContaPlataforma) => void;
  onConectar: (canal: CanalConta) => void;
}) {
  const ativas = contas.filter((c) => c.situacao === "ativa").length;
  const problemas = contas.filter((c) => c.situacao !== "ativa").length;
  const vendas = contas.reduce((soma, c) => soma + c.vendas, 0);
  const idPainel = `contas-${canal}`;

  return (
    <section className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] shadow-[var(--cz-elev-1)]">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        aria-controls={idPainel}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-[var(--cz-fundo)] sm:p-5"
      >
        {/* Caixa de tamanho FIXO para o logo. Os dois SVGs têm proporções muito
            diferentes (o do ML é largo, o da Shopee é alto), e sem uma caixa comum
            um cartão ficaria visivelmente mais alto que o outro. */}
        <span className="grid h-12 w-16 shrink-0 place-items-center">
          <Logo canal={canal} className="max-h-11 w-auto max-w-full" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-[var(--cz-texto)]">
            {CANAL_CONTA_NOME[canal]}
          </span>
          <span className="mt-0.5 block text-[12px] text-[var(--cz-texto-suave)]">
            {contas.length === 0
              ? "Nenhuma conta conectada"
              : `${inteiro(contas.length)} ${contas.length === 1 ? "conta" : "contas"} · ${inteiro(ativas)} ${ativas === 1 ? "ativa" : "ativas"}${
                  problemas > 0
                    ? ` · ${inteiro(problemas)} com pendência`
                    : ""
                } · ${inteiro(vendas)} vendas`}
          </span>
        </span>

        {/* Aviso no cabeçalho FECHADO: sem ele, uma conta precisando de reconexão
            ficaria escondida atrás de um clique, e o sync falharia sem que nada na
            tela tivesse avisado. */}
        {problemas > 0 && !aberto && (
          <span className="hidden shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-amber-800 sm:inline-flex">
            requer atenção
          </span>
        )}
        <Seta aberto={aberto} />
      </button>

      {/* Abre e fecha animando `grid-template-rows` de 0fr para 1fr. É o que
          permite transição suave SEM fixar altura em pixel: a altura do painel
          depende de quantas contas existem, e um `max-height` chutado cortaria a
          lista de quem tem quatro contas. */}
      <div
        id={idPainel}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: aberto ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--cz-hairline)] p-4 sm:p-5">
            {contas.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                  {CANAL_CONTA_DESCRICAO[canal]} Conecte uma conta para começar a
                  sincronizar.
                </p>
                <BotaoPrimario onClick={() => onConectar(canal)}>
                  Conectar conta {CANAL_CONTA_NOME[canal]}
                </BotaoPrimario>
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {contas.map((conta) => (
                    <CartaoConta
                      key={conta.id}
                      conta={conta}
                      ocupado={ocupados.has(conta.id)}
                      onRenovar={() => onRenovar(conta)}
                      onExcluir={() => onExcluir(conta)}
                      onReconectar={() => onConectar(canal)}
                    />
                  ))}
                </ul>
                <div className="mt-4 flex justify-start">
                  <BotaoSecundario onClick={() => onConectar(canal)}>
                    Conectar outra conta
                  </BotaoSecundario>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Tela                                    */
/* -------------------------------------------------------------------------- */

export default function Contas() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { dados, carregando, atualizando, erro, atualizar } = useContas();

  const [abertos, setAbertos] = useState<Set<CanalConta>>(new Set());
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());

  const alternar = useCallback((canal: CanalConta) => {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(canal)) proximo.delete(canal);
      else proximo.add(canal);
      return proximo;
    });
  }, []);

  const abrir = useCallback((canal: CanalConta) => {
    setAbertos((atual) => new Set(atual).add(canal));
  }, []);

  const marcarOcupado = useCallback((id: string, ocupado: boolean) => {
    setOcupados((atual) => {
      const proximo = new Set(atual);
      if (ocupado) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }, []);

  /**
   * Retorno do OAuth.
   *
   * As duas plataformas voltam com parâmetros na URL. Eles são LIMPOS depois de
   * lidos, com `replaceState`: sem isso, recarregar a página mostraria de novo
   * "conta conectada" sem nada ter acontecido, e o cartão reabriria sozinho.
   */
  useEffect(() => {
    const mlOk = searchParams.get("meli_connected") === "true";
    const spOk = searchParams.get("shopee_connected") === "true";
    if (!mlOk && !spOk) return;

    const canal: CanalConta = mlOk ? "ML" : "SP";
    const nome = mlOk
      ? searchParams.get("meli_nickname") ||
        `Vendedor ${searchParams.get("meli_user_id") ?? ""}`.trim()
      : `Loja ${searchParams.get("shopee_shop_id") ?? ""}`.trim();

    toast({
      variant: "success",
      title: `Conta ${CANAL_CONTA_NOME[canal]} conectada`,
      description: `${nome} entrou na lista. Sincronize as vendas para começar.`,
      duration: 6000,
    });

    abrir(canal);
    atualizar();

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      for (const chave of [
        "meli_connected",
        "meli_nickname",
        "meli_user_id",
        "shopee_connected",
        "shopee_shop_id",
        "shopee_merchant_id",
      ]) {
        url.searchParams.delete(chave);
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, toast, abrir, atualizar]);

  /**
   * Resultado da janela da Shopee.
   *
   * A checagem de `event.origin` não é formalidade: sem ela, qualquer página
   * aberta em outra aba poderia mandar uma mensagem e a tela reagiria como se a
   * Shopee tivesse respondido.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    function aoReceber(evento: MessageEvent) {
      if (evento.origin !== window.location.origin) return;
      const dado = evento.data;
      if (!dado || typeof dado !== "object") return;

      if (dado.type === "shopee:auth:success") {
        const loja = dado.data?.shopId ?? dado.data?.shop_id;
        toast({
          variant: "success",
          title: "Conta Shopee conectada",
          description: loja ? `Loja ${loja} entrou na lista.` : "Loja conectada.",
          duration: 5000,
        });
        abrir("SP");
        atualizar();
        return;
      }

      if (dado.type === "shopee:auth:error") {
        toast({
          variant: "error",
          title: "Falha ao conectar a Shopee",
          description:
            typeof dado.message === "string" && dado.message
              ? dado.message
              : "Não foi possível concluir a autorização. Tente novamente.",
          duration: 6000,
        });
      }
    }

    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, [toast, abrir, atualizar]);

  const conectar = useCallback(
    (canal: CanalConta) => {
      const abriu = conectarConta(canal);
      if (!abriu) {
        toast({
          variant: "warning",
          title: "Permita janelas para conectar a Shopee",
          description:
            "O navegador barrou a janela de autorização. Libere janelas para este site e tente de novo.",
          duration: 6000,
        });
      }
    },
    [toast],
  );

  const renovar = useCallback(
    async (conta: ContaPlataforma) => {
      marcarOcupado(conta.id, true);
      const r = await renovarToken(conta.canal, conta.id);
      marcarOcupado(conta.id, false);

      if (r.ok) {
        toast({
          variant: "success",
          title: "Token renovado",
          description: `${conta.nome} está ativa novamente.`,
          duration: 4000,
        });
        atualizar();
        return;
      }

      toast({
        variant: r.precisaReconectar ? "error" : "warning",
        title: r.precisaReconectar ? "Reconexão necessária" : "Não foi possível renovar",
        description: r.precisaReconectar
          ? "A plataforma recusou a autorização guardada. Use Reconectar para autorizar de novo."
          : r.mensagem,
        duration: 7000,
      });
      // Recarrega mesmo na falha: se o motivo foi refresh recusado, o servidor
      // acabou de marcar isso e o selo da conta tem de passar a dizer "Reconectar".
      atualizar();
    },
    [marcarOcupado, toast, atualizar],
  );

  const excluir = useCallback(
    async (conta: ContaPlataforma) => {
      // A confirmação NOMEIA a consequência. O endpoint apaga as vendas da conta
      // em cascata, e quem lê apenas "excluir conta" não imagina que o histórico
      // vai embora junto.
      const texto =
        conta.vendas > 0
          ? `Excluir a conta ${conta.nome}?\n\nIsso remove também as ${conta.vendas.toLocaleString("pt-BR")} vendas já sincronizadas dela. Não há como desfazer.`
          : `Excluir a conta ${conta.nome}?\n\nNão há como desfazer.`;

      if (typeof window !== "undefined" && !window.confirm(texto)) return;

      marcarOcupado(conta.id, true);
      const r = await excluirConta(conta.canal, conta.id);
      marcarOcupado(conta.id, false);

      toast({
        variant: r.ok ? "success" : "error",
        title: r.ok ? "Conta removida" : "Erro ao excluir",
        description: r.ok ? `${conta.nome} foi removida.` : r.mensagem,
        duration: r.ok ? 4000 : 6000,
      });
      atualizar();
    },
    [marcarOcupado, toast, atualizar],
  );

  const porCanal = useMemo(() => {
    const mapa = new Map<CanalConta, ContaPlataforma[]>(
      CANAIS_CONTA.map((c) => [c, [] as ContaPlataforma[]]),
    );
    for (const conta of dados?.contas ?? []) {
      mapa.get(conta.canal)?.push(conta);
    }
    return mapa;
  }, [dados]);

  const total = dados?.contas.length ?? 0;
  const pendentes = dados?.precisamReconectar ?? 0;

  return (
    <MolduraTela>
      <Cabecalho
        titulo="Contas de plataforma"
        descricao="Conexões com o Mercado Livre e a Shopee. Abra uma plataforma para ver os dados de cada conta, o estado da autorização e o histórico de sincronização."
        acao={
          <BotaoAtualizar
            onClick={atualizar}
            atualizando={atualizando}
            desabilitado={carregando}
            rotulo="Atualizar"
            rotuloAtivo="Atualizando…"
          />
        }
      />

      {pendentes > 0 && (
        <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] leading-relaxed text-rose-800">
          <strong>
            {pendentes === 1
              ? "1 conta precisa ser reconectada"
              : `${inteiro(pendentes)} contas precisam ser reconectadas`}
          </strong>
          . A plataforma recusou a autorização guardada, então a renovação
          automática não funciona mais e o sync dessas contas vai falhar. Abra a
          plataforma abaixo e use <em>Reconectar</em>.
        </div>
      )}

      {erro && (
        <div className="mt-4 rounded-[var(--cz-raio-cartao)] border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-800">
          Não foi possível carregar as contas: {erro}
        </div>
      )}

      {carregando ? (
        <div className="mt-4 overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
          <Esqueleto linhas={2} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {CANAIS_CONTA.map((canal) => (
            <CartaoPlataforma
              key={canal}
              canal={canal}
              contas={porCanal.get(canal) ?? []}
              aberto={abertos.has(canal)}
              onAlternar={() => alternar(canal)}
              ocupados={ocupados}
              onRenovar={renovar}
              onExcluir={excluir}
              onConectar={conectar}
            />
          ))}

          {total === 0 && (
            <div className="overflow-hidden rounded-[var(--cz-raio-cartao)] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
              <Aviso
                titulo="Nenhuma conta conectada ainda"
                texto="Conecte o Mercado Livre ou a Shopee para o CONTAZOOM começar a trazer vendas, anúncios, estoque e a fila de expedição."
                acao={
                  <div className="flex flex-wrap justify-center gap-2">
                    <BotaoPrimario onClick={() => conectar("ML")}>
                      Conectar Mercado Livre
                    </BotaoPrimario>
                    <BotaoSecundario onClick={() => conectar("SP")}>
                      Conectar Shopee
                    </BotaoSecundario>
                  </div>
                }
              />
            </div>
          )}
        </div>
      )}
    </MolduraTela>
  );
}
