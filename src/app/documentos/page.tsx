import type { Metadata } from "next";
import ProtectedRoute from '@/components/ProtectedRoute';
import DriveLayoutWrapper from "./DriveLayoutWrapper";

export const metadata: Metadata = {
  title: "Documentos - ContaZoom",
  description: "Drive de documentos contábeis e fiscais",
};

export default function DocumentosPage() {
  return (
    <ProtectedRoute>
      <DriveLayoutWrapper />
    </ProtectedRoute>
  );
}
