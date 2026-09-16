import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import FaturamentoXmlView from "@/app/components/views/FaturamentoXmlView";

export const metadata: Metadata = {
  title: "Faturamento (XML) - ContaZoom",
  description:
    "Importação de XML de nota fiscal e apuração do faturamento mensal por CNPJ.",
};

export default function FaturamentoXmlPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="o faturamento por XML">
          <FaturamentoXmlView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
