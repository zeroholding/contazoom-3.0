import type { Metadata } from "next";

import Expedicao from "../components/views/Expedicao";

export const metadata: Metadata = {
  title: "Expedição - Sistema de Gestão",
  description:
    "Pacotes a despachar no Mercado Livre e na Shopee, ordenados pelo prazo de despacho, com atrasados e vencimentos do dia em destaque",
};

export default function ExpedicaoPage() {
  return <Expedicao />;
}
