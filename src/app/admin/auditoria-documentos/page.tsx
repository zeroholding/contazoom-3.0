import AuditoriaDocumentos from "@/app/components/views/ui/AuditoriaDocumentos";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auditoria de Documentos - Admin ContaZoom",
  description: "Logs de interações com documentos",
};

export default function AdminAuditoriaDocsPage() {
  return (
    <div className="min-h-screen bg-[#F3F3F3]">
      <main className="p-6">
        <AuditoriaDocumentos />
      </main>
    </div>
  );
}
