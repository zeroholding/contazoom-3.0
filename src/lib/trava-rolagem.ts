/**
 * Trava a rolagem da PÁGINA enquanto uma gaveta, folha inferior ou modal está
 * aberta no celular.
 *
 * Sem isto, o dedo que arrasta a lista da folha arrasta também a tabela por
 * baixo dela, e ao fechar a pessoa volta para outro ponto da tela.
 *
 * É um CONTADOR, e não um liga/desliga: a gaveta do menu e uma folha de filtros
 * podem estar abertas ao mesmo tempo (uma abre a outra, ou o React monta as duas
 * antes de desmontar a primeira). Com um booleano, a que fecha primeiro soltaria
 * a trava da que continua aberta. A classe só sai quando a ÚLTIMA trava é solta.
 *
 * A regra de CSS que faz o trabalho é `html.cz-trava-rolagem` em `globals.css`.
 *
 * Uso:
 *   useEffect(() => (aberto ? travarRolagem() : undefined), [aberto]);
 * O valor devolvido é a função que solta a trava, que é exatamente o que o
 * `useEffect` espera como limpeza.
 */
const CLASSE = "cz-trava-rolagem";

let travas = 0;

export function travarRolagem(): () => void {
  if (typeof document === "undefined") return () => {};

  travas += 1;
  document.documentElement.classList.add(CLASSE);

  // Cada chamador só pode soltar a PRÓPRIA trava, uma vez. Sem isto, uma limpeza
  // chamada duas vezes (StrictMode em desenvolvimento faz exatamente isso)
  // descontaria uma trava que pertence a outro.
  let solta = false;
  return () => {
    if (solta) return;
    solta = true;
    travas = Math.max(0, travas - 1);
    if (travas === 0) document.documentElement.classList.remove(CLASSE);
  };
}
