import { FilePen, FileX2, RefreshCw, Scale, ShieldCheck } from "lucide-react";
import { BotaoWhatsapp, Rotulo, Texto, Titulo, atraso } from "./comum";

/**
 * 08 · Abertura de CNPJ estruturado para e-commerce
 *
 * Posicionado após a proposta comercial central para quem já vende.
 * Foco em nascer com os CNAEs corretos para Mercado Livre, Shopee e TikTok Shop,
 * evitando suspensão de contas e desenquadramentos precoces.
 */

const FASES = [
  {
    titulo: "Formulário online",
    texto: "Dados dos sócios e da empresa, opções de nome e documentos. O envio gera um protocolo imediato.",
  },
  {
    titulo: "CNAEs e viabilidade",
    texto: "Definição técnica dos CNAEs exatos de comércio eletrônico e consulta prévia de viabilidade de endereço.",
  },
  {
    titulo: "Receita Federal",
    texto: "Preenchimento, protocolo e deferimento do DBE (Documento Básico de Entrada) de abertura do CNPJ.",
  },
  {
    titulo: "Junta Comercial",
    texto: "Registro digital na Junta Comercial, com o contrato social assinado de forma 100% eletrônica.",
  },
  {
    titulo: "Inscrição e alvará",
    texto: "Inscrição Estadual ativa para emissão de NF-e de venda de mercadorias e documentos oficiais entregues.",
  },
];

const OUTROS_SERVICOS = [
  {
    Icone: FilePen,
    titulo: "Alteração cadastral",
    texto: "Atualização de endereço fiscal, inclusão de sócios, novos CNAEs de e-commerce ou capital social.",
  },
  {
    Icone: RefreshCw,
    titulo: "Regularização de CNPJ",
    texto: "Diagnóstico de pendências na Receita e Fazenda, declarações em atraso e parcelamentos de guias.",
  },
  {
    Icone: Scale,
    titulo: "Desenquadramento de MEI",
    texto: "Transição planejada para Microempresa (ME) no Simples Nacional quando suas vendas decolarem.",
  },
  {
    Icone: FileX2,
    titulo: "Encerramento de CNPJ",
    texto: "Baixa e extinção de empresas com certidões negativas e levantamento prévio de pendências.",
  },
];

export default function AberturaCnpj() {
  return (
    <section id="abertura" className="scroll-mt-16 border-t border-[#EDEFF3] bg-[#F8F9FB] py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
          <div data-revelar="" className="max-w-[46rem]">
            <Rotulo numero="08" texto="Abertura de CNPJ" />
            <Titulo>Vai abrir empresa para vender online? Seu CNPJ nasce pronto para e-commerce.</Titulo>
            <Texto>
              Abertura rápida e 100% digital, com a escolha estratégica dos CNAEs de comércio varejista
              para você poder emitir notas fiscais no Mercado Livre, Shopee e TikTok Shop desde o primeiro dia.
            </Texto>
          </div>
          <div data-revelar="" style={atraso(100)}>
            <BotaoWhatsapp mensagem="abertura" className="w-full sm:w-auto">
              Quero abrir meu CNPJ para vender online
            </BotaoWhatsapp>
          </div>
        </div>

        {/* 5 Fases da abertura */}
        <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <span
            aria-hidden="true"
            className="absolute left-[10%] right-[10%] top-[42px] hidden border-t-2 border-dashed border-[#FFD9BF] lg:block"
          />
          {FASES.map((fase, i) => (
            <li
              key={fase.titulo}
              data-revelar=""
              style={atraso(i * 80)}
              className="relative flex flex-col rounded-[20px] border border-[#EDEFF3] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.03)]"
            >
              <span className="czl-num relative grid size-11 place-items-center rounded-full border-2 border-[#F26212] bg-[#FFF8F3] text-[16px] font-extrabold text-[#F26212]">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[16px] font-extrabold tracking-[-0.03em] text-[#14161B]">{fase.titulo}</h3>
              <p className="mt-1.5 text-[13.5px] leading-[1.6] text-[#6B7280]">{fase.texto}</p>
            </li>
          ))}
        </ol>

        {/* Serviços societários adicionais */}
        <div data-revelar="" className="mt-12">
          <p className="font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">
            Serviços societários e legalização
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {OUTROS_SERVICOS.map(({ Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-3.5 rounded-[18px] border border-[#EDEFF3] bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#FFF2E9] text-[#F26212]">
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#14161B]">{titulo}</h3>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#6B7280]">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
