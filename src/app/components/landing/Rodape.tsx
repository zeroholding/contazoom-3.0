import Image from "next/image";
import Link from "next/link";
import { IconeWhatsapp } from "./comum";
import { WHATSAPP_EXIBICAO, linkWhatsapp } from "./contato";
import { linkDoApp } from "./links";

const COLUNAS = [
  {
    titulo: "Contabilidade",
    links: [
      { href: "#contabilidade", rotulo: "Apuração mensal" },
      { href: "#abertura", rotulo: "Abertura de CNPJ" },
      { href: "#como-funciona", rotulo: "Como funciona" },
      { href: "#duvidas", rotulo: "Dúvidas" },
    ],
  },
  {
    titulo: "Sistema",
    links: [
      { href: "#sistema", rotulo: "Vendas e margem" },
      { href: linkDoApp("/login"), rotulo: "Entrar" },
      { href: linkDoApp("/register"), rotulo: "Criar conta" },
    ],
  },
];

export default function Rodape() {
  const ano = new Date().getFullYear();
  // pb-24: no fim da rolagem, a última linha para acima do botão flutuante do
  // WhatsApp, em vez de ficar escondida atrás dele.
  return (
    <footer className="pb-24 pt-16 sm:pt-20">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* Colunas de links com mais espaço que a marca: com três colunas, a de
            contato (com o número) não cabia em 1024 px na proporção inversa. */}
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <Image src="/contazoom-logo.svg" alt="ContaZoom" width={646} height={230} unoptimized className="h-10 w-auto" />
            <p className="mt-5 max-w-sm text-[15px] leading-[1.65] text-[#6B7280]">
              Escritório contábil para empresas do Simples Nacional e do Lucro Presumido, com um sistema de
              vendas para quem vende em marketplace.
            </p>
          </div>

          <nav aria-label="Rodapé" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUNAS.map((coluna) => (
              <div key={coluna.titulo}>
                <p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#9AA1AC]">{coluna.titulo}</p>
                <ul className="mt-4 space-y-2.5">
                  {coluna.links.map((link) => (
                    <li key={link.rotulo}>
                      {link.href.startsWith("#") ? (
                        <a href={link.href} className="text-[14.5px] font-medium text-[#14161B] transition-colors hover:text-[#D9500A]">
                          {link.rotulo}
                        </a>
                      ) : (
                        <Link href={link.href} className="text-[14.5px] font-medium text-[#14161B] transition-colors hover:text-[#D9500A]">
                          {link.rotulo}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="col-span-2 sm:col-span-1">
              <p className="font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#9AA1AC]">Contato</p>
              <ul className="mt-4 space-y-2.5">
                <li>
                  {/* Nome e número em duas linhas: numa linha só, o número passava da
                      largura da coluna e saía do alinhamento da página. */}
                  <a
                    href={linkWhatsapp("geral")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-2 text-[14.5px] font-medium text-[#14161B] transition-colors hover:text-[#D9500A]"
                  >
                    <IconeWhatsapp className="mt-[2px] h-[18px] w-[18px] shrink-0 text-[#128C7E]" />
                    <span>
                      <span className="block">WhatsApp</span>
                      <span className="czl-num block whitespace-nowrap text-[13.5px] text-[#6B7280]">{WHATSAPP_EXIBICAO}</span>
                    </span>
                    <span className="sr-only"> (abre em nova aba)</span>
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-[#EDEFF3] pt-6 text-[13px] text-[#9AA1AC] sm:flex-row sm:items-center sm:justify-between">
          <p>© {ano} ContaZoom. Todos os direitos reservados.</p>
          <p>Contabilidade para quem vende na internet.</p>
        </div>
      </div>
    </footer>
  );
}
