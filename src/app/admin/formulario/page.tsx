import FormularioListaView from "@/app/components/views/FormularioListaView";

/**
 * `/admin/formulario` — formulários de abertura recebidos.
 *
 * O acesso é conferido na rota de API (`requireInterno` em `/api/formulario`),
 * como em todo o admin: o projeto não tem `middleware.ts` e a página em si é uma
 * casca. Sem sessão válida, a lista volta vazia com a mensagem de não autenticado.
 */
export default function FormularioAdminPage() {
  return <FormularioListaView />;
}
