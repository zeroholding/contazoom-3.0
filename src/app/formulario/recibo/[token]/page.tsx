import type { Metadata } from "next";
import ReciboView from "./ReciboView";

/**
 * `/formulario/recibo/[token]` — consulta pública do formulário enviado.
 *
 * `noindex, nofollow` é obrigatório aqui, não opcional: a página mostra CPF,
 * endereço e telefone dos sócios. Um link "não listado" indexado pelo Google
 * deixa de ser não listado.
 */
export const metadata: Metadata = {
  title: "Formulário enviado | ContaZoom",
  description: "Consulta do formulário de abertura de CNPJ enviado à ContaZoom.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ReciboPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReciboView token={token} />;
}
