import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import FormularioDetalheView from "@/app/components/views/FormularioDetalheView";

export const metadata: Metadata = {
  title: "Formulário de abertura - ContaZoom",
  description:
    "Formulário de abertura de CNPJ recebido: dados declarados pelo cliente, documentos por sócio e situação da análise.",
};

export default async function FormularioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="os formulários de abertura">
          <FormularioDetalheView id={id} />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
