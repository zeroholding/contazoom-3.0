import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import LegalizacaoDetalheView from "@/app/components/views/LegalizacaoDetalheView";

export const metadata: Metadata = {
  title: "Processo de legalização - ContaZoom",
  description:
    "Etapas, pendências, protocolo no órgão e histórico de um processo de legalização.",
};

export default async function LegalizacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="os processos de legalização">
          <LegalizacaoDetalheView id={id} />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
