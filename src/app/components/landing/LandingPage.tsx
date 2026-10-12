import "./landing.css";
import Animacoes from "./Animacoes";
import Cabecalho from "./Cabecalho";
import Canais from "./Canais";
import Cascata from "./Cascata";
import ChamadaFinal from "./ChamadaFinal";
import ComoFunciona from "./ComoFunciona";
import Contabilidade from "./Contabilidade";
import Duvidas from "./Duvidas";
import Hero from "./Hero";
import Modulos from "./Modulos";
import Rodape from "./Rodape";

/**
 * Landing pública do ContaZoom (contazoom.com.br).
 *
 * Componente de servidor: só o cabeçalho, a lupa e as animações de rolagem são
 * de cliente. O resto chega pronto no HTML, que é o que o buscador lê e o que
 * aparece primeiro numa conexão de celular ruim.
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
        <Canais />
        <Cascata />
        <Modulos />
        <Contabilidade />
        <ComoFunciona />
        <Duvidas logado={logado} />
        <ChamadaFinal logado={logado} />
      </main>
      <Rodape />
      <Animacoes />
    </div>
  );
}
