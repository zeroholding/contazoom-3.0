import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import LegalizacaoListaView from "@/app/components/views/LegalizacaoListaView";

export const metadata: Metadata = {
  title: "Legalização - ContaZoom",
  description:
    "Processos pontuais de legalização: abertura, encerramento, regularização, alteração cadastral e desenquadramento de CNPJ.",
};

export default function LegalizacaoPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="os processos de legalização">
          <LegalizacaoListaView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
