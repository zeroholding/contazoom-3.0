import type { Metadata } from "next";

import EstoqueFull from "../components/views/EstoqueFull";

export const metadata: Metadata = {
  title: "Estoque Full - Sistema de Gestão",
  description:
    "Estoque nos centros de distribuição do Mercado Livre, com cobertura em dias e o que precisa de reposição",
};

export default function EstoqueFullPage() {
  return <EstoqueFull />;
}
