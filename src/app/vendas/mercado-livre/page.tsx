import type { Metadata } from "next";
import VendasMercadolivre from "../../components/views/VendasMercadolivre";
import ProtectedRoute from "@/components/ProtectedRoute";
import VendasMercadolivreV2 from "@/app/components/views/v2/VendasMercadolivre";
import { VendasProvider } from "@/contexts/VendasContext";

export const metadata: Metadata = {
  title: "Vendas Mercado Livre - Sistema de Gestão",
  description: "Gestão de vendas do Mercado Livre",
};

export default function VendasMercadolivrePage() {
  return (
    <ProtectedRoute>
      <VendasProvider platform="Mercado Livre">
        <VendasMercadolivreV2 />
      </VendasProvider>
    </ProtectedRoute>
  );
}
