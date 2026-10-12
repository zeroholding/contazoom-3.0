import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import LandingPage from "./components/landing/LandingPage";

/**
 * Raiz do site: a landing pública em contazoom.com.br.
 *
 * Antes esta rota só fazia `redirect("/login")`. O subdomínio do painel
 * (app.contazoom.com.br) continua com esse comportamento, porque é o endereço
 * que os clientes já têm salvo e quem abre ele quer entrar, não ler sobre o
 * produto. Em qualquer outro host (o domínio principal e o localhost) aparece a
 * landing.
 */

const DESCRICAO =
  "Vendas do Mercado Livre, Shopee e TikTok Shop num painel só, com a margem real de cada pedido: comissão, frete, imposto e custo do produto já descontados. E contabilidade para o seu CNPJ no mesmo lugar.";

export const metadata: Metadata = {
  metadataBase: new URL("https://contazoom.com.br"),
  title: "ContaZoom | Gestão de vendas e contabilidade para marketplaces",
  description: DESCRICAO,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "ContaZoom",
    title: "ContaZoom | Dê zoom no lucro de cada venda",
    description: DESCRICAO,
  },
  twitter: {
    card: "summary",
    title: "ContaZoom | Dê zoom no lucro de cada venda",
    description: DESCRICAO,
  },
};

export default async function Home() {
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("app.")) redirect("/login");

  // Só a PRESENÇA do cookie decide o texto do botão ("Entrar" ou "Ir para o
  // painel"). Sessão vencida cai no login normalmente ao abrir o painel.
  const logado = Boolean((await cookies()).get("session")?.value);

  return <LandingPage logado={logado} />;
}
