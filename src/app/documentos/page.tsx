import DriveDocumentos from "@/app/components/views/ui/DriveDocumentos";

export const metadata = {
  title: "Documentos - ContaZoom",
  description: "Drive de documentos contábeis e fiscais",
};

export default function DocumentosPage() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Aqui assumimos que o layout raiz já insere a sidebar ou temos que usar a mesma estrutura do Dashboard */}
      {/* O ContaZoom costuma usar Client Components para o layout ou gerenciar abas. */}
      {/* Como estamos numa rota nova, criaremos a view para ser integrada. */}
      <DriveDocumentos />
    </div>
  );
}
