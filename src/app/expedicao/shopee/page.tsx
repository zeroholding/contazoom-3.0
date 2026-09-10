import type { Metadata } from "next";

import Expedicao from "../../components/views/Expedicao";

export const metadata: Metadata = {
  title: "Expedição Shopee - Sistema de Gestão",
  description:
    "Pacotes da Shopee a despachar, ordenados pelo prazo de despacho (ship by date)",
};

/** A mesma tela da Expedição Geral, com o canal travado. Ver `mercado-livre`. */
export default function ExpedicaoShopeePage() {
  return <Expedicao canalFixo="SP" />;
}
