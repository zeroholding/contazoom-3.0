import type { Metadata } from "next";
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminLayoutWrapper from "./AdminLayoutWrapper";

export const metadata: Metadata = {
  title: "Administração - ContaZoom",
  description: "Painel de Administração do ContaZoom",
};

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper />
    </ProtectedRoute>
  );
}
