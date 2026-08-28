import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import TarefasPainelView from "@/app/components/views/TarefasPainelView";

export const metadata: Metadata = {
  title: "Tarefas - ContaZoom",
  description:
    "Painel das apurações fiscais e dos processos de legalização da carteira.",
};

export default function TarefasPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="o painel de tarefas">
          <TarefasPainelView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
