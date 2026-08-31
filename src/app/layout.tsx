import type { Metadata } from "next";
import '@/lib/metadata';
import { DM_Sans, Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/datepicker-custom.css";
import Providers from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Fonte do painel.
 *
 * Carregada aqui para o `next/font` fazer o preload e evitar salto de texto,
 * mas APLICADA só dentro de `.cz-admin` e `.cz-auth` (ver globals.css). O resto
 * do app continua na fonte que já usava: trocar a fonte de dezenas de telas de
 * uma vez muda espaçamento e quebra de linha em todas elas, e isso é uma decisão
 * separada desta. Quando quiser rodar para o app inteiro, é mudar o seletor.
 *
 * Os pesos são declarados explicitamente porque o painel usa 800 nos números
 * grandes; sem pedir, o navegador simularia o negrito e o número sairia borrado.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/**
 * Fonte do formulário público de abertura de CNPJ (`/formulario`).
 *
 * Aplicada só dentro de `.cz-form` (ver globals.css), como a Jakarta é no
 * painel. O formulário é lido por CLIENTE, não por operador: quem preenche está
 * no celular, uma vez na vida, sem treino na interface. A DM Sans tem contraforma
 * mais aberta e altura de x maior que a Jakarta, o que sustenta melhor o texto de
 * ajuda longo que este formulário tem em quase todo campo.
 *
 * `latin-ext` além de `latin` porque razão social brasileira traz "ç" e vogal
 * acentuada, e sem o subset estendido esses glifos caem no fallback — na mesma
 * palavra, com outra fonte, o que aparece como letra de outro tamanho.
 */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sistema de Gestão",
  description: "Sistema de gestão de vendas e finanças",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ "--sidebar-w": "16rem" } as React.CSSProperties}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${dmSans.variable} bg-[#F3F3F3] antialiased overflow-x-hidden`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
