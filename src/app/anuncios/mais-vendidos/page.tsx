import type { Metadata } from "next";

import AnunciosMaisVendidos from "../../components/views/AnunciosMaisVendidos";

export const metadata: Metadata = {
  title: "Anúncios Mais Vendidos - Sistema de Gestão",
  description:
    "Ranking multicanal dos produtos e anúncios mais vendidos no Mercado Livre, Shopee e TikTok Shop",
};

export default function AnunciosMaisVendidosPage() {
  return <AnunciosMaisVendidos />;
}
