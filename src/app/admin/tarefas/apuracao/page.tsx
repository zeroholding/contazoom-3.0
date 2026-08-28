import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import ApuracaoListaView from "@/app/components/views/ApuracaoListaView";

export const metadata: Metadata = {
  title: "Apuração fiscal - ContaZoom",
  description:
    "Lista das apurações fiscais mensais por competência, em Kanban ou tabela, com prazo, etapa e pendências.",
};

export default function ApuracaoPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="a apuração fiscal">
          <ApuracaoListaView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
