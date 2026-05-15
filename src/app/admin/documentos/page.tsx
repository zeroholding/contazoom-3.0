import type { Metadata } from "next";
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminLayoutWrapper from "../AdminLayoutWrapper";
import AdminDocumentos from "@/app/components/views/ui/AdminDocumentos";

export const metadata: Metadata = {
  title: "Envio de Documentos - Admin ContaZoom",
  description: "Envio de Documentos para Clientes ContaZoom",
};

export default function AdminDocumentosPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <AdminDocumentos />
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
