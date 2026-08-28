import type { Metadata } from "next";

/**
 * O título anterior era "Cadastro - Sistema de Gestão", genérico: é o texto que
 * aparece na aba do navegador e no favorito, e não dizia o nome do produto.
 */
export const metadata: Metadata = {
  title: "Criar conta - ContaZoom",
  description:
    "Crie sua conta no ContaZoom e acompanhe vendas, financeiro, apuração fiscal e documentos num painel só.",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
