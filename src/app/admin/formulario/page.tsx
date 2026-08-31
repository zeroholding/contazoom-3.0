import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import AdminLayoutWrapper from "@/app/admin/AdminLayoutWrapper";
import FormularioListaView from "@/app/components/views/FormularioListaView";

/**
 * `/admin/formulario` — formulários de abertura recebidos.
 *
 * A pilha `ProtectedRoute` → `AdminLayoutWrapper` → `RoleGuard` é a MESMA de
 * todas as telas do admin, e não é decoração:
 *
 *   - `ProtectedRoute` responde "está logado?" e manda para o login se não;
 *   - `AdminLayoutWrapper` é a casca — barra lateral, cabeçalho e trilha. O
 *     projeto não tem `layout.tsx` em `src/app/admin/`, então CADA página
 *     precisa envolver a si mesma. Foi exatamente o que faltou na primeira
 *     versão desta tela: ela abria solta numa página branca, sem menu e sem
 *     como voltar;
 *   - `RoleGuard` mostra "acesso não liberado" em vez de uma lista vazia com 403
 *     no console, que a pessoa leria como defeito.
 *
 * Nada disso é a autorização de verdade — essa está em `requireInterno` na rota
 * `/api/formulario`. Sem os três, nenhum dado vazaria; a tela só ficaria confusa.
 */
export const metadata: Metadata = {
  title: "Formulários de abertura - ContaZoom",
  description:
    "Formulários de abertura de CNPJ enviados pelos clientes pela tela pública, com os dados declarados e os documentos de cada sócio.",
};

export default function FormularioAdminPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <RoleGuard area="os formulários de abertura">
          <FormularioListaView />
        </RoleGuard>
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
