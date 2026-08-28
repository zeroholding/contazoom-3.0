import type { Metadata } from "next";
import '@/lib/metadata';
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
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
        className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} bg-[#F3F3F3] antialiased overflow-x-hidden`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
