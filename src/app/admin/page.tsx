import type { Metadata } from "next";
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminLayoutWrapper from "./AdminLayoutWrapper";
import AdminPanel from "@/app/components/views/ui/AdminPanel";

export const metadata: Metadata = {
  title: "Administração - ContaZoom",
  description: "Painel de Administração do ContaZoom",
};

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminLayoutWrapper>
        <AdminPanel />
      </AdminLayoutWrapper>
    </ProtectedRoute>
  );
}
