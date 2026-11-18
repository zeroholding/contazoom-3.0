import type { Metadata, Viewport } from "next";
import '@/lib/metadata';
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import "react-datepicker/dist/react-datepicker.css";
import "../styles/datepicker-custom.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Sistema de Gestão",
  description: "Sistema de gestão de vendas e finanças",
  icons: {
    icon: "/favicon.ico",
  },
  // "Adicionar à tela inicial" abre o painel sem a moldura do navegador. O
  // status bar fica no padrão (claro, opaco): o cabeçalho do painel é branco, e
  // uma barra translúcida faria o conteúdo passar por baixo da hora e da bateria.
  appleWebApp: {
    capable: true,
    title: "ContaZoom",
    statusBarStyle: "default",
  },
  // O iOS transforma qualquer sequência de dígitos (pedido, CNPJ, valor) em link
  // de telefone, e o número vira azul e sublinhado no meio da tabela.
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

/**
 * `viewportFit: "cover"` deixa a página ocupar a tela inteira do iPhone, e é por
 * isso que a barra de abas e as gavetas somam `env(safe-area-inset-bottom)`: sem
 * isso o indicador de início do iOS ficaria por cima dos botões.
 *
 * NÃO há `maximumScale` nem `userScalable: false`. Travar o zoom tira de quem
 * enxerga mal a única forma de ler uma tabela densa, e os campos já têm 16px no
 * celular (ver globals.css), que é o que impede o zoom automático ao focar.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `pt-BR` e não `en`: com `lang="en"` num texto em português o Chrome do
    // celular oferece "Traduzir esta página?" em toda abertura, o leitor de tela
    // lê com sotaque inglês e o corretor do teclado marca cada palavra.
    <html lang="pt-BR" style={{ "--sidebar-w": "16rem" } as React.CSSProperties}>
      <body
        className="bg-[var(--cz-fundo)] antialiased overflow-x-hidden"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
