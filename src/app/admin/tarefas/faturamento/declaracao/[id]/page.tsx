import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import DeclaracaoFaturamentoDocumento from "@/app/components/views/fiscal/DeclaracaoFaturamentoDocumento";

export const metadata: Metadata = {
  title: "Declaração de Faturamento - ContaZoom",
  description: "Snapshot de faturamento dos 12 meses para impressão.",
};

type Props = { params: Promise<{ id: string }> };

export default async function DeclaracaoFaturamentoPage({ params }: Props) {
  const { id } = await params;
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="a declaração de faturamento">
          <DeclaracaoFaturamentoDocumento id={id} />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
