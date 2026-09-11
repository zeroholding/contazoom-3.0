"use client";

import { LogoCanal, type CanalLogo } from "../comum/logos";

/**
 * Uma linha do resumo: uma conta e quantas vendas ela tem na lista em tela.
 *
 * `canal` é opcional porque as pastilhas de PROGRESSO de sincronização entram
 * nesta mesma lista e não pertencem a um marketplace — elas descrevem um job,
 * não uma conta.
 */
export type LinhaResumoConta = {
  conta: string;
  total: number;
  canal?: CanalLogo | null;
  /** Pastilha de andamento de sincronização, não uma conta de verdade. */
  progresso?: boolean;
};

const formatarNumero = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

/**
 * Resumo por conta, no TOPO do cartão da tabela.
 *
 * Morava no rodapé da paginação, encostado no "Mostrando 1-10 de 13.230". Ali
 * duas informações diferentes disputavam o mesmo bloco — quantas vendas cada
 * conta tem é leitura de contexto, e paginação é controle — e o rodapé crescia
 * para três alturas de texto, empurrando a tabela até sobrar espaço para quatro
 * linhas na tela. Subir o resumo devolve altura para a tabela e coloca o número
 * perto do título da página, que é onde se procura por ele.
 *
 * O LOGO do marketplace vem antes do nome porque o nome da conta não diz o
 * canal: "ESTOCOLMO" pode ser Mercado Livre ou Shopee, e com contas nos dois
 * lugares a pastilha sem logo obriga a abrir outra tela para descobrir.
 *
 * A caixa do logo tem largura FIXA. Os dois desenhos têm proporções diferentes
 * (o do Mercado Livre é largo, o da Shopee é alto); sem a caixa comum, o nome de
 * uma conta do ML começaria alguns pixels adiante do nome de uma da Shopee e a
 * fileira de pastilhas ficaria visivelmente desalinhada.
 */
export default function ResumoPorConta({
  itens,
  totalGeral,
  /**
   * Escopo dos números por conta, quando ele NÃO é a lista inteira.
   *
   * Na tela Geral e na do Mercado Livre a paginação é feita no servidor, então
   * as vendas em memória são só a página atual: "ESTOCOLMO — 10 vendas" é o que
   * há NESTA PÁGINA, e o "Total" é o resultado inteiro do filtro. Sem dizer
   * isso, os dois números lado a lado se leem como o mesmo recorte e a conta não
   * fecha.
   */
  rotulo,
}: {
  itens: LinhaResumoConta[];
  totalGeral: number;
  rotulo?: string;
}) {
  if (!Array.isArray(itens) || itens.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-2">
      {rotulo && (
        <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cz-texto-fraco)]">
          {rotulo}
        </span>
      )}

      {itens.map((item, indice) => {
        const nome = item.conta || "Sem conta";
        const titulo = `${nome}: ${formatarNumero(item.total)} vendas`;

        return (
          <span
            // O nome da conta serviria de chave, mas as pastilhas de progresso
            // podem repetir rótulo entre eventos; o índice evita colisão sem
            // inventar um id que não existe no dado.
            key={`${nome}-${indice}`}
            title={titulo}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] leading-none",
              item.progresso
                ? "border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)]"
                : "border-[var(--cz-hairline)] bg-[var(--cz-superficie)] text-[var(--cz-texto-suave)]",
            ].join(" ")}
          >
            {item.canal && (
              <span className="grid w-[17px] shrink-0 place-items-center">
                <LogoCanal canal={item.canal} />
              </span>
            )}
            <span className="font-semibold text-[var(--cz-texto)]">{nome}</span>
            <span className="tabular-nums">{formatarNumero(item.total)}</span>
          </span>
        );
      })}

      {/* O total fica por ÚLTIMO e em laranja: é o número que resume a tela, e
          separá-lo das contas evita que se leia como "mais uma conta chamada
          Total". */}
      <span
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] px-2.5 py-[3px] text-[11px] leading-none text-[var(--cz-laranja-forte)]"
        title={`Total do filtro: ${formatarNumero(totalGeral)} vendas`}
      >
        <span className="font-bold uppercase tracking-[0.04em]">Total</span>
        <span className="font-semibold tabular-nums">
          {formatarNumero(totalGeral)} vendas
        </span>
      </span>
    </div>
  );
}
