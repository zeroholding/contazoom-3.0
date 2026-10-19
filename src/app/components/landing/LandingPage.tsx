import "./landing.css";
import AberturaCnpj from "./AberturaCnpj";
import Animacoes from "./Animacoes";
import Cabecalho from "./Cabecalho";
import ChamadaFinal from "./ChamadaFinal";
import ComoFunciona from "./ComoFunciona";
import Contabilidade from "./Contabilidade";
import Duvidas from "./Duvidas";
import Hero from "./Hero";
import Rodape from "./Rodape";
import Sistema from "./Sistema";
import WhatsappFlutuante from "./WhatsappFlutuante";

/**
 * Landing pública do ContaZoom (contazoom.com.br).
 *
 * A ordem conta a história do negócio: primeiro o escritório contábil
 * (apuração mensal, abertura de CNPJ, como é ser cliente), depois o sistema de
 * vendas dos marketplaces, que é um adicional. A ação principal é o WhatsApp.
 *
 * Componente de servidor: só o cabeçalho, a lupa, as abas do fluxo, o botão
 * flutuante e as animações de rolagem são de cliente. O resto chega pronto no
 * HTML, que é o que o buscador lê e o que aparece primeiro num celular lento.
 */
export default function LandingPage({ logado }: { logado: boolean }) {
  return (
    <div className="cz-landing min-h-screen">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[10px] focus:bg-white focus:px-4 focus:py-2.5 focus:text-[14px] focus:font-semibold focus:text-[#14161B] focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <Cabecalho logado={logado} />
      <main id="conteudo">
        <Hero logado={logado} />
        <Contabilidade />
        <AberturaCnpj />
        <ComoFunciona />
        <Sistema logado={logado} />
        <Duvidas />
        <ChamadaFinal logado={logado} />
      </main>
      <Rodape />
      <WhatsappFlutuante />
      <Animacoes />
    </div>
  );
}
