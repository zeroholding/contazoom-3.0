import type { Metadata } from "next";

import AnunciosMortos from "../../components/views/AnunciosMortos";

export const metadata: Metadata = {
  title: "Anúncios Mortos - Sistema de Gestão",
  description:
    "Anúncios que já venderam bem e pararam, separando falta de estoque de problema do anúncio",
};

export default function AnunciosMortosPage() {
  return <AnunciosMortos />;
}
