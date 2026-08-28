import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import ApuracaoDetalheView from "@/app/components/views/ApuracaoDetalheView";

export const metadata: Metadata = {
  title: "Competência - ContaZoom",
  description:
    "Detalhe da apuração fiscal mensal: etapas, pendências, prazo e histórico de alterações da competência.",
};

/**
 * `params` é Promise no App Router do Next 15+ — daí o `await`.
 *
 * A página só resolve o id e monta as barreiras. Tudo que depende de sessão e de
 * dados vive na view cliente, porque a autorização de verdade está em cada rota
 * de API e a tela precisa reagir a cada ação sem recarregar.
 */
export default async function ApuracaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="a apuração fiscal">
          <ApuracaoDetalheView id={id} />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
