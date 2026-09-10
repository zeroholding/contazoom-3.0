import type { Metadata } from "next";

import Expedicao from "../../components/views/Expedicao";

export const metadata: Metadata = {
  title: "Expedição Mercado Livre - Sistema de Gestão",
  description:
    "Pacotes do Mercado Livre a despachar, ordenados pelo prazo de despacho, com foto da variação vendida",
};

/**
 * A MESMA tela da Expedição Geral, com o canal travado.
 *
 * `canalFixo` em vez de um componente próprio: o que difere entre as três telas é
 * o título e o filtro de canal. Duplicar o componente seria garantir que a
 * correção de amanhã entre em uma das cópias e não nas outras.
 */
export default function ExpedicaoMercadoLivrePage() {
  return <Expedicao canalFixo="ML" />;
}
