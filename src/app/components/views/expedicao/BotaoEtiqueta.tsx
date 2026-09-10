"use client";

/**
 * Botão de etiqueta de envio, um por formato (PDF ou ZPL).
 *
 * Dois formatos porque são dois equipamentos: o PDF vai para a impressora comum
 * de folha A4, o ZPL vai direto para a térmica Zebra. Converter um no outro no
 * navegador degrada o código de barras, então quem tem térmica precisa do ZPL do
 * próprio Mercado Livre.
 *
 * O botão não decide se a etiqueta pode sair — isso é da rota, que revalida o
 * status no ML na hora do clique. Aqui só se trata do resultado.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  IconeAlerta,
  IconeAtualizar,
  IconeBaixar,
  IconeDocumento,
} from "../comum/icones";

type Estado = "idle" | "carregando" | "erro";

export type PropsBotaoEtiqueta = {
  /** Nulo quando a venda ainda não tem envio gerado no Mercado Livre. */
  shippingId: string | null;
  /** Id do registro de `meli_account` — a rota usa para achar o token do dono. */
  contaId: string;
  tipo: "pdf" | "zpl";
};

/**
 * Quanto tempo a mensagem de erro fica na tela.
 *
 * Seis segundos: tempo de ler uma frase de duas linhas sem precisar de clique para
 * fechar. Some sozinha porque um tooltip preso sobre a tabela atrapalharia a
 * próxima linha da fila.
 */
const MS_ERRO = 6_000;

/** Um minuto. Ver o comentário do revoke, no `abrir`. */
const MS_REVOKE = 60_000;

const BASE =
  "relative inline-flex h-8 items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed";

export default function BotaoEtiqueta({ shippingId, contaId, tipo }: PropsBotaoEtiqueta) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [mensagem, setMensagem] = useState<string>("");

  // Guarda os timers para limpar no desmonte: a fila de expedição repagina e
  // remonta as linhas com frequência, e um `setState` disparado depois disso é
  // aviso no console em desenvolvimento e trabalho jogado fora em produção.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const atuais = timers.current;
    return () => {
      for (const t of atuais) clearTimeout(t);
    };
  }, []);

  const agendar = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const rotulo = tipo === "zpl" ? "ZPL" : "PDF";

  const abrir = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");

      // Revoke ATRASADO, não imediato. A aba nova ainda está sendo aberta quando
      // esta linha executa; revogar na hora invalidaria o blob antes de ela
      // terminar de carregar, e o operador veria uma aba em branco. Um minuto é
      // folgado o bastante para qualquer máquina do galpão e ainda libera a
      // memória — sem o revoke, cada etiqueta impressa fica retida até recarregar
      // a página.
      agendar(() => URL.revokeObjectURL(url), MS_REVOKE);
    },
    [agendar],
  );

  const clicar = useCallback(async () => {
    if (!shippingId || estado === "carregando") return;

    setEstado("carregando");
    setMensagem("");

    try {
      const p = new URLSearchParams({ shippingId, contaId, tipo });
      // `credentials: "include"`: a rota autentica pelo cookie `session`.
      const res = await fetch(`/api/expedicao/etiqueta?${p.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        let texto = "Não foi possível gerar a etiqueta.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) texto = body.error;
        } catch {
          // Resposta sem JSON: fica a mensagem genérica.
        }
        setMensagem(texto);
        setEstado("erro");
        agendar(() => setEstado("idle"), MS_ERRO);
        return;
      }

      abrir(await res.blob());
      setEstado("idle");
    } catch {
      setMensagem("Falha de conexão ao pedir a etiqueta. Tente de novo.");
      setEstado("erro");
      agendar(() => setEstado("idle"), MS_ERRO);
    }
  }, [abrir, agendar, contaId, estado, shippingId, tipo]);

  // Sem envio não há o que imprimir. Desabilitado e não escondido: a coluna
  // continua alinhada com as outras linhas, e o `title` diz o motivo em vez de
  // deixar a pessoa procurando um botão que sumiu.
  if (!shippingId) {
    return (
      <button
        type="button"
        disabled
        title="Sem código de envio para esta venda."
        className={`${BASE} border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)] opacity-40`}
      >
        {tipo === "zpl" ? (
          <IconeBaixar className="h-3.5 w-3.5" />
        ) : (
          <IconeDocumento className="h-3.5 w-3.5" />
        )}
        {rotulo}
      </button>
    );
  }

  const aparencia =
    estado === "erro"
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : "border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] text-[var(--cz-texto)] hover:border-[var(--cz-laranja-borda)] hover:bg-[var(--cz-laranja-suave)] hover:text-[var(--cz-laranja-forte)]";

  const titulo =
    estado === "carregando"
      ? `Gerando a etiqueta em ${rotulo}...`
      : estado === "erro"
        ? mensagem
        : tipo === "zpl"
          ? "Baixar a etiqueta em ZPL para impressora térmica."
          : "Abrir a etiqueta em PDF para impressão.";

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={clicar}
        disabled={estado === "carregando"}
        title={titulo}
        className={`${BASE} ${aparencia}`}
      >
        {estado === "carregando" ? (
          <IconeAtualizar className="h-3.5 w-3.5 animate-spin" />
        ) : estado === "erro" ? (
          <IconeAlerta className="h-3.5 w-3.5" />
        ) : tipo === "zpl" ? (
          <IconeBaixar className="h-3.5 w-3.5" />
        ) : (
          <IconeDocumento className="h-3.5 w-3.5" />
        )}
        {rotulo}
      </button>

      {/*
        A mensagem aparece por extenso, e não só como borda vermelha.
        O erro daqui quase nunca é do sistema: é "emita a NF-e", "o envio ainda
        está em preparação". É instrução, e instrução escondida atrás de um
        `title` que exige parar o mouse sobre o botão não chega a quem está
        despachando com pressa. Largura fixa para o texto quebrar em linhas em vez
        de esticar a célula da tabela.
      */}
      {estado === "erro" && mensagem ? (
        <span
          role="status"
          className="absolute left-0 top-full z-20 mt-1 w-[260px] rounded-lg border border-rose-200 bg-[var(--cz-superficie)] px-2.5 py-2 text-[11px] leading-snug font-medium text-rose-700 shadow-lg"
        >
          {mensagem}
        </span>
      ) : null}
    </span>
  );
}
