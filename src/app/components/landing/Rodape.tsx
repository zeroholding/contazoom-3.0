import Image from "next/image";
import Link from "next/link";
import {
  LogoMercadoLivre,
  LogoShopee,
  LogoTikTok,
} from "@/app/components/views/comum/logos";
import { linkDoApp } from "./links";

const COLUNAS = [
  {
    titulo: "Produto",
    links: [
      { href: "#canais", rotulo: "Canais" },
      { href: "#margem", rotulo: "Margem por venda" },
      { href: "#produto", rotulo: "Módulos do painel" },
      { href: "#como-funciona", rotulo: "Como começar" },
    ],
  },
  {
    titulo: "Contabilidade",
    links: [
      { href: "#contabilidade", rotulo: "Apuração mensal" },
      { href: "#contabilidade", rotulo: "Legalização de CNPJ" },
      { href: "#duvidas", rotulo: "Dúvidas" },
    ],
  },
  {
    titulo: "Acesso",
    links: [
      { href: linkDoApp("/login"), rotulo: "Entrar" },
      { href: linkDoApp("/register"), rotulo: "Criar conta" },
    ],
  },
];

export default function Rodape() {
  const ano = new Date().getFullYear();
  return (
    <footer className="pb-10 pt-16 sm:pt-20">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <Image src="/contazoom-logo.svg" alt="ContaZoom" width={646} height={230} unoptimized className="h-10 w-auto" />
            <p className="mt-5 max-w-sm text-[15px] leading-[1.65] text-[#6B7280]">
              A operação e a contabilidade do seu negócio, no mesmo painel.
            </p>
            <div className="mt-6 flex items-center gap-2" aria-label="Canais integrados: Mercado Livre, Shopee e TikTok Shop" role="img">
              {[LogoMercadoLivre, LogoShopee, LogoTikTok].map((Logo, i) => (
                <span key={i} aria-hidden="true" className="grid size-10 place-items-center rounded-[12px] border border-[#EDEFF3] bg-white">
                  <Logo className="max-h-5 w-auto max-w-[26px]" />
                </span>
              ))}
            </div>
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
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-[#EDEFF3] pt-6 text-[13px] text-[#9AA1AC] sm:flex-row sm:items-center sm:justify-between">
          <p>© {ano} ContaZoom. Todos os direitos reservados.</p>
          <p>Feito para quem vende no Mercado Livre, na Shopee e no TikTok Shop.</p>
        </div>
      </div>
    </footer>
  );
}
