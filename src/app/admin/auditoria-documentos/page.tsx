import AuditoriaDocumentos from "@/app/components/views/ui/AuditoriaDocumentos";
import { Metadata } from "next";
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminLayoutWrapper from "../AdminLayoutWrapper";

export const metadata: Metadata = {
  title: "Auditoria de Documentos - Admin ContaZoom",
  description: "Logs de interações com documentos",
};

export default function AdminAuditoriaDocsPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <AuditoriaDocumentos />
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
