import "./landing.css";
import AberturaCnpj from "./AberturaCnpj";
import Animacoes from "./Animacoes";
import Cabecalho from "./Cabecalho";
import ChamadaFinal from "./ChamadaFinal";
import ComoFunciona from "./ComoFunciona";
import Contabilidade from "./Contabilidade";
import Dores from "./Dores";
import Duvidas from "./Duvidas";
import Hero from "./Hero";
import Planos from "./Planos";
import Provas from "./Provas";
import Rodape from "./Rodape";
import Sistema from "./Sistema";
import Tributacao from "./Tributacao";
import WhatsappFlutuante from "./WhatsappFlutuante";

/**
 * Landing pública da Contazoom (contazoom.com.br).
 *
 * Estrutura comercial otimizada para conduzir à contratação:
 * 1. Contabilidade especializada em e-commerce: promessa e CTA.
 * 2. Identificação com as dores: impostos, margem e falta de clareza.
 * 3. Planejamento tributário por produto: análise do catálogo e oportunidades.
 * 4. Provas da especialização: casos reais, depoimentos e equipe técnica com CRC.
 * 5. Sistema próprio gratuito incluso: benefícios e passagem do lucro líquido.
 * 6. O que a contabilidade inclui: entregas, atendimento e processo técnico expansível.
 * 7. Como trocar de contador: etapas, migração assistida sem atrito.
 * 8. Planos ou proposta comercial: escopo e condições transparentes (análise gratuita).
 * 9. Abertura de CNPJ: CNAEs corretos para quem vai começar a vender online.
 * 10. Perguntas frequentes e remoção de dúvidas.
 * 11. Chamada final com fechamento sobre impostos, margem e controle do negócio.
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
        <Dores />
        <Tributacao />
        <Provas />
        <Sistema logado={logado} />
        <Contabilidade />
        <ComoFunciona />
        <Planos />
        <AberturaCnpj />
        <Duvidas />
        <ChamadaFinal logado={logado} />
      </main>
      <Rodape />
      <WhatsappFlutuante />
      <Animacoes />
    </div>
  );
}
