import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import AuditoriaView from "@/app/components/views/AuditoriaView";

export const metadata: Metadata = {
  title: "Auditoria - ContaZoom",
  description:
    "Registro completo das alterações feitas nas apurações fiscais e nos processos de legalização, com autor, papel e horário.",
};

export default function AuditoriaPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="a auditoria de tarefas">
          <AuditoriaView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
