import type { Metadata } from "next";

import AnunciosMaisVendidos from "../../components/views/AnunciosMaisVendidos";

export const metadata: Metadata = {
  title: "Anúncios Mais Vendidos - Sistema de Gestão",
  description:
    "Anúncios que mais vendem, com o estoque real de cada um no Mercado Livre e a cobertura em dias",
};

export default function AnunciosMaisVendidosPage() {
  return <AnunciosMaisVendidos />;
}
