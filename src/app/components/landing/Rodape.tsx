import Image from "next/image";
import Link from "next/link";
import { IconeWhatsapp } from "./comum";
import { WHATSAPP_EXIBICAO, linkWhatsapp } from "./contato";
import { linkDoApp } from "./links";

const COLUNAS = [
  {
    titulo: "Contabilidade",
    links: [
      { href: "#tributacao", rotulo: "Planejamento tributário" },
      { href: "#provas", rotulo: "Casos reais e especialização" },
      { href: "#contabilidade", rotulo: "O que a contabilidade inclui" },
      { href: "#como-funciona", rotulo: "Como trocar de contador" },
      { href: "#planos", rotulo: "Planos e proposta" },
      { href: "#abertura", rotulo: "Abertura de CNPJ" },
      { href: "#duvidas", rotulo: "Dúvidas frequentes" },
    ],
  },
  {
    titulo: "Sistema",
    links: [
      { href: "#sistema", rotulo: "Sistema gratuito incluso" },
      { href: linkDoApp("/login"), rotulo: "Entrar no painel" },
    ],
  },
];

export default function Rodape() {
  const ano = new Date().getFullYear();

  return (
    <footer className="border-t border-[#EDEFF3] bg-white pb-24 pt-16 sm:pt-20">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <Image src="/contazoom-logo.svg" alt="Contazoom" width={646} height={230} unoptimized className="h-9 w-auto" />
            <p className="mt-5 max-w-sm text-[15px] leading-[1.65] text-[#6B7280]">
              Contabilidade especializada em e-commerce, com planejamento tributário por produto e gestão
              do lucro real — com sistema próprio de gestão gratuito e incluso para todos os clientes.
            </p>
          </div>

          <nav aria-label="Rodapé" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUNAS.map((coluna) => (
              <div key={coluna.titulo}>
                <p className="font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#9AA1AC]">{coluna.titulo}</p>
                <ul className="mt-4 space-y-2.5">
                  {coluna.links.map((link) => (
                    <li key={link.rotulo}>
                      {link.href.startsWith("#") ? (
                        <a href={link.href} className="text-[14px] font-medium text-[#14161B] transition-colors hover:text-[#D9500A]">
                          {link.rotulo}
                        </a>
                      ) : (
                        <Link href={link.href} className="text-[14px] font-medium text-[#14161B] transition-colors hover:text-[#D9500A]">
                          {link.rotulo}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="col-span-2 sm:col-span-1">
              <p className="font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#9AA1AC]">Atendimento</p>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a
                    href={linkWhatsapp("tributacao")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-2 text-[14px] font-medium text-[#14161B] transition-colors hover:text-[#D9500A]"
                  >
                    <IconeWhatsapp className="mt-[2px] h-[18px] w-[18px] shrink-0 text-[#128C7E]" />
                    <span>
                      <span className="block font-bold">WhatsApp Comercial</span>
                      <span className="czl-num block whitespace-nowrap text-[13px] text-[#6B7280]">{WHATSAPP_EXIBICAO}</span>
                    </span>
                    <span className="sr-only"> (abre em nova aba)</span>
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-[#EDEFF3] pt-6 text-[13px] text-[#9AA1AC] sm:flex-row sm:items-center sm:justify-between">
          <p>© {ano} Contazoom Contabilidade. Todos os direitos reservados.</p>
          <p>Contabilidade especializada para quem vende nos marketplaces.</p>
        </div>
      </div>
    </footer>
  );
}
