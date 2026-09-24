import type { Metadata } from "next";

import Expedicao from "../../components/views/Expedicao";

export const metadata: Metadata = {
  title: "Expedição TikTok Shop - Sistema de Gestão",
  description:
    "Pacotes do TikTok Shop a despachar, ordenados pelo prazo de despacho (rts_sla_time)",
};

/** A mesma tela da Expedição Geral, com o canal travado. Ver `mercado-livre`. */
export default function ExpedicaoTiktokShopPage() {
  return <Expedicao canalFixo="TT" />;
}
