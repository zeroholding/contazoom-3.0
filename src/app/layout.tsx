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
 * Fonte do produto INTEIRO.
 *
 * Aplicada no `body` (ver `globals.css`), não mais só dentro de `.cz-admin` e
 * `.cz-auth`. Antes o login vestia a classe e ganhava esta fonte enquanto o
 * painel caía no `Arial` do navegador — era o que fazia a tela de login parecer
 * de outro produto. A troca desloca alguns pixels de quebra de linha em todas as
 * telas, e é o preço de ter uma fonte só em vez de duas.
 *
 * A única tela que legitimamente foge daqui é o formulário público
 * (`/formulario`), que usa DM Sans: quem preenche é o cliente final, uma vez na
 * vida, no celular, e aquele texto de ajuda longo pede outra fonte. Ver
 * `.cz-form`.
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
        className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${dmSans.variable} bg-[var(--cz-fundo)] antialiased overflow-x-hidden`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
