import type { Metadata, Viewport } from "next";
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
        className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${dmSans.variable} bg-[var(--cz-fundo)] antialiased overflow-x-hidden`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
