import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import EmpresaDetalheView from "@/app/components/views/EmpresaDetalheView";

export const metadata: Metadata = {
  title: "Empresa - ContaZoom",
  description:
    "Ficha da empresa: cadastro, histórico de regime tributário, últimas competências e processos em aberto.",
};

export default async function EmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="o cadastro de empresas">
          <EmpresaDetalheView id={id} />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
