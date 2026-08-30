import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import EmpresasListaView from "@/app/components/views/EmpresasListaView";

export const metadata: Metadata = {
  title: "Empresas - ContaZoom",
  description:
    "Carteira de empresas do escritório: plano interno ContaZoom, regime tributário, competências e processos de legalização.",
};

export default function EmpresasPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="o cadastro de empresas">
          <EmpresasListaView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
