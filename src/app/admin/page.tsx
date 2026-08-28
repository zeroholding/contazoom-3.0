import type { Metadata } from "next";
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminLayoutWrapper from "./AdminLayoutWrapper";
import RoleGuard from "@/components/RoleGuard";
import UsuariosView from "@/app/components/views/UsuariosView";
import { PAPEL } from "@/lib/papeis";

export const metadata: Metadata = {
  title: "Usuários e níveis de acesso - ContaZoom",
  description: "Gestão de usuários e perfis de acesso do ContaZoom",
};

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        {/* `ProtectedRoute` só garante que existe login. Sem a barreira de papel,
            um cliente com sessão válida abriria esta tela, levaria 403 do
            `GET /api/admin/users` e leria isso como defeito do sistema. */}
        <RoleGuard papeis={[PAPEL.ADMIN]} area="a gestão de usuários">
          <UsuariosView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
