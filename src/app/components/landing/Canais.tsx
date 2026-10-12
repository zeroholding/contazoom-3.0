import { Check } from "lucide-react";
import { Rotulo, Secao, Texto, Titulo, atraso } from "./comum";
import SincronizacaoDemo from "./SincronizacaoDemo";

/**
 * 01 · Canais. O cartão da direita é o "Sincronizar vendas" da barra lateral do
 * painel, funcionando: roda sozinho quando aparece e de novo no botão.
 *
 * O respiro de cima é menor que o das outras seções porque esta encosta na
 * primeira dobra, que já termina com respiro próprio.
 */

const VANTAGENS = [
  "Pedidos, frete, comissão e dados do anúncio de cada venda",
  "Várias contas por canal, cada uma com o seu progresso",
  "Depois da primeira vez, só busca o que mudou",
  "SKUs novos entram sozinhos na Gestão de SKU",
];

export default function Canais() {
  return (
    <Secao id="canais" espaco="pt-8 pb-12 sm:pt-12 sm:pb-16">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div data-revelar="">
          <Rotulo numero="01" texto="Canais" />
          <Titulo>Três canais. Um clique para sincronizar todos.</Titulo>
          <Texto>
            Conecte suas contas do Mercado Livre, da Shopee e do TikTok Shop. Um clique busca as vendas
            de todos os canais ao mesmo tempo e mostra o progresso ao vivo, conta por conta.
          </Texto>
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            {VANTAGENS.map((item) => (
              <li key={item} className="flex gap-2.5 text-[14.5px] leading-[1.5] text-[#14161B]">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#FFF2E9] text-[#D9500A]">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div data-revelar="" style={atraso(100)}>
          <SincronizacaoDemo />
        </div>
      </div>
    </Secao>
  );
}
