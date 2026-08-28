import type { Metadata } from "next";

/**
 * O título anterior era "Login - Sistema de Gestão", genérico: é o texto que
 * aparece na aba do navegador e no favorito, e não dizia o nome do produto.
 */
export const metadata: Metadata = {
  title: "Entrar - ContaZoom",
  description:
    "Acesse o painel do ContaZoom: vendas de marketplace, financeiro, apuração fiscal e documentos.",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
