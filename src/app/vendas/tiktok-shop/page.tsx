import type { Metadata } from "next";
import VendasTiktokShop from "../../components/views/VendasTiktokShop";
import ProtectedRoute from "@/components/ProtectedRoute";

export const metadata: Metadata = {
  title: "Vendas TikTok Shop - Sistema de Gestão",
  description: "Gestão de vendas do TikTok Shop",
};

export default function VendasTiktokShopPage() {
  return (
    <ProtectedRoute>
      <VendasTiktokShop />
    </ProtectedRoute>
  );
}
