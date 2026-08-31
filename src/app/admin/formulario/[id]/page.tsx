import FormularioDetalheView from "@/app/components/views/FormularioDetalheView";

export default async function FormularioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormularioDetalheView id={id} />;
}
