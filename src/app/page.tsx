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
  "Escritório contábil para empresas do Simples Nacional e do Lucro Presumido: impostos apurados todo mês a partir das notas fiscais, guias no seu painel e abertura de CNPJ. E um sistema que mostra a margem de cada venda no Mercado Livre, na Shopee e no TikTok Shop.";

export const metadata: Metadata = {
  metadataBase: new URL("https://contazoom.com.br"),
  title: "ContaZoom | Contabilidade para quem vende na internet",
  description: DESCRICAO,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "ContaZoom",
    title: "ContaZoom | Dê zoom na contabilidade da sua empresa",
    description: DESCRICAO,
  },
  twitter: {
    card: "summary",
    title: "ContaZoom | Dê zoom na contabilidade da sua empresa",
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
