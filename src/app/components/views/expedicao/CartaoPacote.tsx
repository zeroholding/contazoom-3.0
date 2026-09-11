"use client";

/**
 * Um pacote da fila, como CARTÃO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE DEIXOU DE SER LINHA DE TABELA
 *
 * Era uma `<tr>` de oito colunas dentro de `min-w-[1280px]` com scroll
 * horizontal. Numa tabela larga, o problema não é o scroll em si: é que a coluna
 * do PRODUTO sai da tela exatamente quando se olha o prazo e a etiqueta do lado
 * direito, e aí não se sabe mais de qual pacote é a linha. E as oito colunas
 * ainda tinham larguras muito desiguais — "Itens a separar" precisa de metade da
 * tela, "Unid." precisa de 40px — o que numa tabela obriga todas as linhas a
 * respeitar a mais gorda.
 *
 * Como cartão, cada informação fica onde o olho a procura e a largura é livre:
 *
 *   • a BORDA ESQUERDA de 4px é a urgência, visível a um metro da tela;
 *   • o topo esquerdo é a identidade do pacote (etiqueta, comprador, conta);
 *   • o corpo é a LISTA DE SEPARAÇÃO, que é o trabalho;
 *   • a coluna direita é o prazo e as ações, sempre no mesmo lugar em todo cartão.
 *
 * A caixa de seleção existe para imprimir etiqueta em lote (ver `BarraLote`), que
 * é a diferença entre imprimir a fila do dia e clicar trinta vezes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Miniatura, Selo } from "../comum/shell";
import { brl, inteiro } from "../comum/formato";
import { SeloCanal } from "../comum/logos";
import {
  IconeAbrirFora,
  IconeAlerta,
  IconeAmpulheta,
  IconeCaixa,
  IconeCalendario,
  IconeCamadas,
  IconeCaminhao,
  IconeEtiqueta,
  IconePessoa,
  IconeRelogio,
} from "../comum/icones";
import {
  rotuloPrazo,
  URGENCIA_BARRA,
  URGENCIA_CLASSE,
  URGENCIA_ROTULO,
  type PacoteExpedicao,
  type Urgencia,
} from "@/lib/expedicao";
import { statusEnvio, transportadoraShopee } from "@/lib/expedicao-status";
import BotaoEtiqueta from "./BotaoEtiqueta";

/**
 * Ícone de cada faixa de urgência.
 *
 * A cor sozinha não basta: quem não distingue vermelho de âmbar (cerca de 8% dos
 * homens) lê a fila toda como a mesma coisa. O ícone é o segundo canal da mesma
 * informação, e é ele que faz "atrasado" e "vence hoje" se separarem num relance
 * mesmo em tela ruim.
 */
export const ICONE_URGENCIA: Record<Urgencia, React.ReactNode> = {
  atrasado: <IconeAlerta className="h-3.5 w-3.5" />,
  hoje: <IconeAmpulheta className="h-3.5 w-3.5" />,
  amanha: <IconeRelogio className="h-3.5 w-3.5" />,
  // Calendário nas duas faixas com folga: elas são de PLANEJAMENTO, não de
  // pressa, e o relógio (que é o ícone da urgência) daria a elas a mesma
  // linguagem visual do que vence amanhã.
  proximo: <IconeCalendario className="h-3.5 w-3.5" />,
  futuro: <IconeCalendario className="h-3.5 w-3.5" />,
  // Meio apagado: é ausência de informação, não gravidade.
  semPrazo: <IconeRelogio className="h-3.5 w-3.5 opacity-50" />,
};

/** Prazo em "09/09 às 18:00", no fuso de São Paulo. */
export function prazoCurto(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataCurtaSP(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function SeloUrgencia({ urgencia, dias }: { urgencia: Urgencia; dias: number | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.04em] ${URGENCIA_CLASSE[urgencia]}`}
      title={rotuloPrazo(dias)}
    >
      {ICONE_URGENCIA[urgencia]}
      {URGENCIA_ROTULO[urgencia]}
    </span>
  );
}

export default function CartaoPacote({
  pacote,
  selecionado,
  onAlternarSelecao,
}: {
  pacote: PacoteExpedicao;
  selecionado: boolean;
  /** Ausente quando o pacote não pode entrar em lote (sem etiqueta, ou Shopee). */
  onAlternarSelecao?: () => void;
}) {
  const estado = statusEnvio(pacote.canal, pacote.shippingStatus, pacote.status);
  const transportadora = transportadoraShopee(pacote.shippingStatus);
  const atrasado = pacote.urgencia === "atrasado";

  return (
    <article
      className={`border-b border-l-4 border-[var(--cz-hairline)] transition-colors last:border-b-0 ${
        URGENCIA_BARRA[pacote.urgencia]
      } ${selecionado ? "bg-[var(--cz-laranja-suave)]" : "hover:bg-[var(--cz-fundo)]"}`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Caixa de seleção. Só existe onde há etiqueta para imprimir: um
            checkbox que não faz nada é pior que a ausência dele, porque quem
            marca espera que "Imprimir selecionadas" inclua aquele pacote. */}
        <span className="flex w-4 shrink-0 justify-center pt-1">
          {onAlternarSelecao ? (
            <input
              type="checkbox"
              checked={selecionado}
              onChange={onAlternarSelecao}
              aria-label={`Selecionar o pacote ${pacote.shippingId ?? pacote.chave}`}
              className="size-4 accent-[var(--cz-laranja)]"
            />
          ) : (
            <span
              className="mt-1 size-1.5 rounded-full bg-[var(--cz-hairline-forte)]"
              title="Este pacote não entra na impressão em lote: a etiqueta não sai por aqui."
            />
          )}
        </span>

        {/* Corpo: identidade + lista de separação. */}
        <div className="min-w-0 flex-1">
          {/* Linha 1 — quem é este pacote. */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <SeloUrgencia urgencia={pacote.urgencia} dias={pacote.diasRestantes} />

            <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] font-semibold text-[var(--cz-texto)]">
              <IconeEtiqueta className="h-3.5 w-3.5 shrink-0 text-[var(--cz-texto-fraco)]" />
              {pacote.shippingId ?? "sem etiqueta"}
            </span>

            {/* Só aparece quando o pacote junta mais de uma venda. É a informação
                que explica por que a contagem de pacotes é menor que a de pedidos —
                sem ela, a diferença parece defeito. */}
            {pacote.pedidos > 1 && (
              <Selo tom="info" titulo="Vendas diferentes que saem na mesma etiqueta">
                <IconeCaixa className="h-3.5 w-3.5" />
                {pacote.pedidos} pedidos juntos
              </Selo>
            )}
          </div>

          {/* Linha 2 — a LISTA DE SEPARAÇÃO, todos os itens, sem expandir.
              Esta é a tarefa: quem olha a tela precisa saber o que buscar na
              prateleira, e esconder isso atrás de um clique transformaria uma
              tarefa em dois passos. */}
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {pacote.itens.map((item) => (
              <li key={item.orderId} className="flex items-start gap-2.5">
                {/* A FOTO da variação vendida, não a capa do anúncio. Quem separa
                    confere cor e tamanho pela imagem antes de fechar a caixa; num
                    anúncio de seis cores a capa é a mesma para as seis. */}
                <Miniatura src={item.thumbnailUrl} alt={item.titulo} tamanho={46} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex h-[22px] min-w-[1.75rem] shrink-0 items-center justify-center rounded-md border border-[var(--cz-hairline-forte)] bg-[var(--cz-superficie)] px-1 text-[12px] font-bold tabular-nums text-[var(--cz-texto)]">
                      {item.quantidade}
                    </span>

                    {item.permalink ? (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noreferrer"
                        title={`Abrir "${item.titulo}" no Mercado Livre`}
                        className="inline-flex min-w-0 items-start gap-1 text-[13.5px] font-semibold leading-snug text-[var(--cz-texto)] transition-colors hover:text-[var(--cz-laranja-forte)]"
                      >
                        {/* Duas linhas e não reticências na primeira: título de
                            anúncio é longo por construção, e cortar cedo apaga
                            justamente o que separa "60x30x10 Preto" de
                            "60x30x10 Azul". */}
                        <span className="line-clamp-2">{item.titulo}</span>
                        <IconeAbrirFora className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                      </a>
                    ) : (
                      <span
                        className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-[var(--cz-texto)]"
                        title={item.titulo}
                      >
                        {item.titulo}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[calc(1.75rem+0.5rem)] text-[11.5px] text-[var(--cz-texto-suave)]">
                    <span className="font-mono font-semibold text-[var(--cz-texto)]">
                      {item.sku ?? "sem SKU"}
                    </span>
                    <span className="font-mono opacity-70">#{item.orderId}</span>
                    {item.hierarquia1 && (
                      <Selo tom="neutro" titulo="Categoria do cadastro de SKU">
                        <IconeCamadas className="h-3 w-3" />
                        {item.hierarquia1}
                      </Selo>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Linha 3 — o rodapé de contexto: conta, comprador, modalidade. Vem
              DEPOIS dos itens porque é o que se confere na hora de colar a
              etiqueta, não na hora de separar. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-[var(--cz-texto-suave)]">
            <span className="inline-flex items-center gap-1.5" title="Conta de venda">
              <SeloCanal canal={pacote.canal} />
              <span className="font-semibold text-[var(--cz-texto)]">
                {pacote.conta}
              </span>
            </span>

            <span className="text-[var(--cz-hairline-forte)]">•</span>

            <span className="inline-flex min-w-0 items-center gap-1.5" title="Comprador">
              <IconePessoa className="h-3.5 w-3.5 shrink-0 text-[var(--cz-texto-fraco)]" />
              <span className="truncate">{pacote.comprador}</span>
            </span>

            <span className="text-[var(--cz-hairline-forte)]">•</span>

            <span className="inline-flex items-center gap-1.5" title="Modalidade de envio">
              <IconeCaminhao className="h-3.5 w-3.5 shrink-0 text-[var(--cz-texto-fraco)]" />
              <span className="font-semibold text-[var(--cz-texto)]">
                {pacote.modalidade}
              </span>
              {/* Só na Shopee: no ML esta parte repetiria a modalidade. */}
              {pacote.canal === "SP" && transportadora && <span>· {transportadora}</span>}
            </span>

            <span className="text-[var(--cz-hairline-forte)]">•</span>

            {/* O estado do pacote vem TRADUZIDO por `statusEnvio`, que sabe qual
                coluna vale em cada canal. No ML vale `shipping_status`; na Shopee
                aquela coluna guarda a TRANSPORTADORA e o estado real está em
                `status` — ver a armadilha no topo de `expedicao-status.ts`. */}
            <Selo tom={estado.tom} titulo={estado.explicacao ?? undefined}>
              {estado.rotulo}
            </Selo>
          </div>
        </div>

        {/* Coluna direita: prazo, dinheiro e ações. Alinhada à direita e com
            largura própria para ficar no MESMO lugar em todo cartão — é o que
            permite varrer a coluna de prazos com o olho descendo a lista. */}
        <div className="flex w-[13.5rem] shrink-0 flex-col items-end gap-1.5 text-right">
          <span
            className={`text-[12px] font-bold uppercase tracking-[0.03em] tabular-nums ${
              atrasado ? "text-rose-700" : "text-[var(--cz-texto)]"
            }`}
            title="Prazo para despachar"
          >
            Limite: {prazoCurto(pacote.prazoDespacho)}
          </span>
          <span className="text-[11.5px] text-[var(--cz-texto-suave)]">
            {rotuloPrazo(pacote.diasRestantes)}
          </span>

          <span className="inline-flex items-center gap-1 text-[11.5px] tabular-nums text-[var(--cz-texto-fraco)]">
            <IconeRelogio className="h-3 w-3 shrink-0" />
            Venda {dataCurtaSP(pacote.dataVenda)}
          </span>

          <span className="mt-0.5 text-[14px] font-bold tabular-nums text-[var(--cz-texto)]">
            {brl(pacote.valorTotal)}
          </span>
          <span className="text-[11.5px] tabular-nums text-[var(--cz-texto-suave)]">
            {inteiro(pacote.unidades)} unidade(s)
          </span>

          {/* Etiqueta só no Mercado Livre. A Shopee não expõe a etiqueta pelos
              endpoints que este projeto usa, e desenhar um botão desabilitado em
              todo cartão da Shopee prometeria um recurso que não existe. */}
          {pacote.canal === "ML" ? (
            <span className="mt-1 flex flex-wrap justify-end gap-1.5">
              <BotaoEtiqueta
                shippingId={pacote.shippingId}
                contaId={pacote.accountId}
                tipo="pdf"
              />
              <BotaoEtiqueta
                shippingId={pacote.shippingId}
                contaId={pacote.accountId}
                tipo="zpl"
              />
            </span>
          ) : (
            <span className="mt-1 text-[11.5px] leading-snug text-[var(--cz-texto-fraco)]">
              Etiqueta no painel da Shopee
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
