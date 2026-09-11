"use client";

/**
 * Sincronizar vendas: UM clique, e o progresso ao lado do botão.
 *
 * O que havia antes eram QUATRO cliques para uma decisão que nunca variava:
 * abrir um menu, escolher a plataforma, "Iniciar sincronização", e dentro do
 * modal ainda "Verificar vendas novas" e "Sincronizar (N)". A escolha de
 * plataforma e a de contas terminavam sempre em "todas" — era um formulário para
 * confirmar o padrão. Agora o clique JÁ sincroniza tudo o que está conectado, e
 * quem quer recortar por conta usa o filtro de contas que já existe ao lado.
 *
 * O progresso fica AO LADO, e não num modal, porque sincronizar leva minutos: um
 * modal bloqueia a tela inteira e obriga a pessoa a esperar olhando uma barra, ou
 * a fechá-lo e perder a informação. Inline, ela continua lendo o dashboard
 * enquanto os dados chegam, e é isso que "mostrar progresso" precisa significar.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { IconeAlerta, IconeAtualizar, IconeCerto } from "../comum/icones";
import { LogoCanal } from "../comum/logos";
import { useToast } from "./toaster";

type Estado = "parado" | "preparando" | "sincronizando" | "concluido" | "erro";

type Conta = { id: string; canal: "ML" | "SP" };

type Progresso = { mensagem: string; feitos: number; total: number };

/** Quanto tempo o resultado fica visível antes de o botão voltar ao normal. */
const MS_RESULTADO = 8_000;

/**
 * Teto de segurança da sincronização.
 *
 * O `fetch` do sync não tem prazo próprio, e se o servidor pendurar a conexão o
 * botão ficaria girando para sempre — a pessoa não teria como tentar de novo sem
 * recarregar a página. Dez minutos é folgado para uma carga histórica e ainda
 * devolve o controle em algum momento.
 */
const MS_LIMITE = 600_000;

export default function BotaoSincronizarDashboard({
  onConcluido,
}: {
  /** Chamado quando a sincronização termina, para o dashboard recarregar. */
  onConcluido: () => void;
}) {
  const { toast } = useToast();

  const [estado, setEstado] = useState<Estado>("parado");
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  /**
   * O que o painel escreve quando para de rodar.
   *
   * Uma string em vez de derivar do número de vendas: "0 vendas" é ambíguo entre
   * "não havia nada novo" e "outra sincronização já estava rodando", e essas duas
   * situações pedem ações opostas de quem está olhando.
   */
  const [mensagemFinal, setMensagemFinal] = useState("");

  // O EventSource e os timers vivem em ref para o desmonte poder encerrá-los.
  // Sem isso, sair do dashboard no meio da sincronização deixa uma conexão SSE
  // aberta por aba — e o navegador reconecta sozinho, então ela não morre nunca.
  const sse = useRef<EventSource | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;

    // `timers` e `sse` copiados para variáveis locais: o ESLint avisa (com razão)
    // que ler `.current` só na hora da limpeza pode pegar um valor que já mudou.
    // Aqui os dois são o MESMO objeto durante toda a vida do componente, mas
    // copiar deixa isso explícito em vez de depender de uma leitura tardia.
    const agendados = timers.current;
    const canal = sse;

    return () => {
      vivo.current = false;
      if (canal.current) {
        try {
          canal.current.close();
        } catch {
          /* noop */
        }
        canal.current = null;
      }
      for (const t of agendados) clearTimeout(t);
    };
  }, []);

  const agendar = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /**
   * Abre o canal de progresso.
   *
   * Sem o truque de ler `document.cookie` para achar o `session`: aquele cookie é
   * httpOnly, então a leitura sempre falhava e o `token=` nunca ia na URL. Quem
   * de fato autentica é o `withCredentials`, e no modo proxy a própria rota copia
   * o cookie para o parâmetro `token` antes de falar com o backend.
   */
  const abrirProgresso = useCallback(() => {
    try {
      const canal = new EventSource("/api/meli/vendas/sync-progress", {
        withCredentials: true,
      });

      canal.onmessage = (evento) => {
        if (!vivo.current) return;
        try {
          const p = JSON.parse(evento.data) as Record<string, unknown>;
          if (p.type === "heartbeat" || p.type === "connected") return;

          const feitos = Number(p.fetched ?? p.current ?? p.progressValue ?? 0);
          const total = Number(p.expected ?? p.total ?? p.progressMax ?? 0);
          const mensagem = typeof p.message === "string" ? p.message : "";

          // Só atualiza quando o evento traz ALGO de novo. Sem esta guarda, um
          // evento sem números zera a barra que já estava em 60% e o progresso
          // parece andar para trás.
          if (mensagem || feitos > 0 || total > 0) {
            setProgresso((atual) => ({
              mensagem: mensagem || atual?.mensagem || "Sincronizando…",
              feitos: feitos || atual?.feitos || 0,
              total: total || atual?.total || 0,
            }));
          }
        } catch {
          // Linha malformada no stream: ignorar. O progresso é acessório, e uma
          // mensagem quebrada não deve derrubar a sincronização que está indo.
        }
      };

      // Sem `onerror` que encerre: o EventSource reconecta sozinho, e fechar aqui
      // mataria o progresso por causa de uma oscilação de rede de meio segundo.
      sse.current = canal;
    } catch {
      sse.current = null;
    }
  }, []);

  const fecharProgresso = useCallback(() => {
    if (!sse.current) return;
    try {
      sse.current.close();
    } catch {
      /* noop */
    }
    sse.current = null;
  }, []);

  const sincronizar = useCallback(async () => {
    if (estado === "preparando" || estado === "sincronizando") return;

    setEstado("preparando");
    setProgresso(null);
    setMensagemFinal("");
    // Limpa a lista da rodada anterior: sem isto, o painel abriria mostrando os
    // logos da última sincronização enquanto as contas ainda estão sendo lidas.
    setContas([]);

    let lista: Conta[] = [];

    try {
      // As duas listas em paralelo: são independentes, e em série o botão ficaria
      // parado o tempo das duas somadas antes de a sincronização começar.
      const [resML, resSP] = await Promise.all([
        fetch("/api/meli/accounts", { cache: "no-store", credentials: "include" }),
        fetch("/api/shopee/accounts", { cache: "no-store", credentials: "include" }),
      ]);

      if (resML.ok) {
        const linhas = (await resML.json()) as { id: string }[];
        for (const c of linhas ?? []) lista.push({ id: c.id, canal: "ML" });
      }
      if (resSP.ok) {
        const linhas = (await resSP.json()) as { id: string }[];
        for (const c of linhas ?? []) lista.push({ id: c.id, canal: "SP" });
      }
    } catch {
      lista = [];
    }

    if (!vivo.current) return;

    if (lista.length === 0) {
      setEstado("erro");
      setMensagemFinal("Nenhuma conta conectada.");
      toast({
        variant: "warning",
        title: "Nenhuma conta conectada",
        description:
          "Conecte uma conta do Mercado Livre ou da Shopee em Contas para poder sincronizar.",
        duration: 8000,
      });
      agendar(() => vivo.current && setEstado("parado"), MS_RESULTADO);
      return;
    }

    setContas(lista);
    setEstado("sincronizando");
    abrirProgresso();

    /**
     * UMA chamada POR PLATAFORMA, com todas as contas dela dentro.
     *
     * E não uma chamada por conta, que era o que o modal fazia. Três motivos, o
     * último decisivo:
     *
     * - as duas rotas já aceitam `accountIds` como lista e iteram por dentro;
     * - cada requisição a mais é um `acquireSyncLock` e uma partida de rotina
     *   pesada, para o mesmo trabalho;
     * - e as três sincronizações concorrentes escreviam no MESMO canal de
     *   progresso (`sendProgressToUser` é por usuário, não por conta). As
     *   mensagens se intercalavam e a barra pulava entre contagens de contas
     *   diferentes — progresso que anda para trás é pior que nenhum.
     *
     * As duas plataformas continuam em paralelo entre si: são APIs distintas,
     * não competem por nada, e em série o tempo seria a soma das duas.
     */
    const ml = lista.filter((c) => c.canal === "ML").map((c) => c.id);
    const sp = lista.filter((c) => c.canal === "SP").map((c) => c.id);

    const lotes: { rota: string; ids: string[] }[] = [];
    if (ml.length > 0) lotes.push({ rota: "/api/v2/meli/sync-trigger", ids: ml });
    if (sp.length > 0) lotes.push({ rota: "/api/shopee/vendas/sync", ids: sp });

    // Cada lote resolve o próprio erro em vez de lançar: um `throw` aqui abortaria
    // a espera do outro lote, e o botão voltaria ao normal com a sincronização
    // ainda em curso no servidor.
    const resultados = await Promise.all(
      lotes.map(async (lote) => {
        try {
          const res = await fetch(lote.rota, {
            method: "POST",
            cache: "no-store",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountIds: lote.ids }),
            signal: AbortSignal.timeout(MS_LIMITE),
          });

          const corpo = (await res.json().catch(() => ({}))) as {
            alreadyRunning?: boolean;
            results?: { vendas?: number }[];
            totals?: { saved?: number; fetched?: number };
          };

          // 409 com `alreadyRunning` NÃO é falha: outra sincronização (outra aba,
          // ou o cron) já está rodando. Tratar como erro faria a tela acusar
          // defeito onde o sistema está justamente se protegendo.
          if (res.status === 409 && corpo.alreadyRunning) {
            return { ok: true, jaRodando: true, salvas: 0 };
          }

          if (!res.ok) return { ok: false, jaRodando: false, salvas: 0 };

          const somaResults = corpo.results?.reduce(
            (s, r) => s + (Number(r.vendas) || 0),
            0,
          );
          const quantas =
            somaResults ?? corpo.totals?.saved ?? corpo.totals?.fetched ?? 0;

          return { ok: true, jaRodando: false, salvas: Number(quantas) || 0 };
        } catch {
          return { ok: false, jaRodando: false, salvas: 0 };
        }
      }),
    );

    fecharProgresso();
    if (!vivo.current) return;

    setProgresso(null);

    const total = resultados.reduce((s, r) => s + r.salvas, 0);
    const falhas = resultados.filter((r) => !r.ok).length;
    const jaRodando = resultados.some((r) => r.jaRodando);

    onConcluido();

    if (falhas === resultados.length) {
      setEstado("erro");
      setMensagemFinal("A sincronização falhou. Tente de novo.");
      toast({
        variant: "error",
        title: "Sincronização falhou",
        description:
          "Nenhuma conta respondeu. Verifique se as contas continuam conectadas em Contas.",
        duration: 10000,
      });
      agendar(() => vivo.current && setEstado("parado"), MS_RESULTADO);
      return;
    }

    setEstado("concluido");
    setMensagemFinal(
      jaRodando
        ? "Sincronização já em andamento"
        : total > 0
          ? `${total} venda(s) sincronizada(s)`
          : "Nenhuma venda nova",
    );

    // Parcial não é sucesso silencioso: dizer o que ficou de fora é o que impede
    // alguém de olhar o dashboard e achar que os números estão completos.
    if (falhas > 0) {
      toast({
        variant: "warning",
        title: "Sincronização parcial",
        description: `${falhas} de ${resultados.length} plataforma(s) não sincronizaram. Os números desta tela ainda estão incompletos.`,
        duration: 10000,
      });
    }

    // "Já rodando" merece aviso próprio: sem ele, um resultado de zero vendas
    // parece que não havia nada novo, quando na verdade a sincronização de verdade
    // está acontecendo em outra aba (ou no cron) e os números vão mudar sozinhos.
    if (jaRodando) {
      toast({
        variant: "info",
        title: "Já havia uma sincronização em andamento",
        description:
          "Outra sincronização está rodando agora. Os dados vão aparecer aqui quando ela terminar — atualize a tela em alguns minutos.",
        duration: 10000,
      });
    }

    // SKU pendente vale mais que o "concluído": sem custo cadastrado, CMV, lucro
    // e margem do dashboard saem errados, e a pessoa acabou de olhar para eles.
    try {
      const res = await fetch("/api/sku/pendentes");
      if (res.ok) {
        const dados = (await res.json()) as { total?: number };
        const pendentes = Number(dados.total || 0);

        if (pendentes > 0) {
          toast({
            variant: "warning",
            title: "SKUs pendentes de cadastro",
            description: `${pendentes} SKU(s) das suas vendas estão sem custo. Cadastre em Gestão de SKU para CMV, lucro e margem fecharem.`,
            duration: 10000,
          });
        } else if (falhas === 0) {
          toast({
            variant: "success",
            title: "Dashboard atualizado",
            description: "Sincronização concluída e painéis recarregados.",
            duration: 6000,
          });
        }
      }
    } catch {
      // Conferência de SKU é acessória: a sincronização terminou de verdade.
    }

    agendar(() => vivo.current && setEstado("parado"), MS_RESULTADO);
  }, [abrirProgresso, agendar, estado, fecharProgresso, onConcluido, toast]);

  const rodando = estado === "preparando" || estado === "sincronizando";

  const rotulo =
    estado === "preparando"
      ? "Preparando…"
      : estado === "sincronizando"
        ? "Sincronizando…"
        : "Sincronizar vendas";

  const pct =
    progresso && progresso.total > 0
      ? Math.min(100, Math.round((progresso.feitos / progresso.total) * 100))
      : null;

  return (
    // `sm:flex-row-reverse` para o BOTÃO continuar na direita e o progresso
    // crescer para a esquerda. Se o painel entrasse antes na ordem do DOM, o
    // botão andaria pela tela conforme a mensagem muda de tamanho, e acertar um
    // alvo que se move é a única coisa pior que um clique a mais.
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row-reverse sm:items-center">
      <button
        type="button"
        onClick={sincronizar}
        disabled={rodando}
        title={
          rodando
            ? "Sincronização em andamento. Você pode continuar usando o dashboard."
            : "Sincroniza todas as contas conectadas do Mercado Livre e da Shopee."
        }
        className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--cz-raio)] border px-4 text-[13px] font-semibold transition-colors ${
          rodando
            ? "cursor-progress border-[var(--cz-laranja-forte)] bg-[var(--cz-laranja-forte)] text-white"
            : "border-[var(--cz-laranja)] bg-[var(--cz-laranja)] text-white hover:border-[var(--cz-laranja-forte)] hover:bg-[var(--cz-laranja-forte)]"
        }`}
      >
        <IconeAtualizar className={`h-4 w-4 ${rodando ? "animate-spin" : ""}`} />
        {rotulo}
      </button>

      {/* O painel ao lado. Existe só enquanto há o que dizer — um espaço vazio
          reservado para ele empurraria o cabeçalho todo o tempo. */}
      {(rodando || estado === "concluido" || estado === "erro") && (
        <div
          role="status"
          aria-live="polite"
          className={`min-w-0 flex-1 rounded-[var(--cz-raio)] border px-3 py-1.5 sm:min-w-[260px] sm:flex-none ${
            estado === "erro"
              ? "border-rose-200 bg-rose-50"
              : estado === "concluido"
                ? "border-emerald-200 bg-emerald-50"
                : "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)]"
          }`}
        >
          <div className="flex items-center gap-2">
            {estado === "erro" ? (
              <IconeAlerta className="h-3.5 w-3.5 shrink-0 text-rose-600" />
            ) : estado === "concluido" ? (
              <IconeCerto className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <span className="flex shrink-0 items-center gap-1">
                {/* Os logos das contas que estão sendo sincronizadas. Dizem "o
                    que" está acontecendo sem gastar uma palavra, e é a mesma
                    linguagem do resto do produto. */}
                {contas.some((c) => c.canal === "ML") && <LogoCanal canal="ML" />}
                {contas.some((c) => c.canal === "SP") && <LogoCanal canal="SP" />}
              </span>
            )}

            <span
              className={`min-w-0 flex-1 truncate text-[11.5px] font-semibold ${
                estado === "erro"
                  ? "text-rose-700"
                  : estado === "concluido"
                    ? "text-emerald-700"
                    : "text-[var(--cz-laranja-forte)]"
              }`}
            >
              {rodando
                ? (progresso?.mensagem ?? "Buscando contas conectadas…")
                : mensagemFinal}
            </span>

            {rodando && progresso && progresso.total > 0 && (
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--cz-laranja-forte)]">
                {progresso.feitos}/{progresso.total}
              </span>
            )}
          </div>

          {rodando && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--cz-laranja-borda)]">
              {/*
                Sem total conhecido, a barra fica INDETERMINADA (uma faixa que
                atravessa) em vez de parar num palpite tipo 40%. Barra parada num
                número inventado faz a pessoa concluir que travou; faixa que anda
                diz "está trabalhando, não sei quanto falta", que é a verdade
                enquanto o Mercado Livre não devolve o total esperado.
              */}
              {pct === null ? (
                <div className="cz-barra-indeterminada h-full w-1/3 rounded-full bg-[var(--cz-laranja)]" />
              ) : (
                <div
                  className="h-full rounded-full bg-[var(--cz-laranja)] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
