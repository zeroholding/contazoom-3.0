import type { Metadata } from "next";
import FormularioAberturaView from "./FormularioAberturaView";

/**
 * `/formulario` — formulário público de abertura de CNPJ.
 *
 * Server component fino: só metadata. Todo o estado é do cliente, e nesta fase
 * não há banco nem rota de recebimento, então não existe nada para buscar aqui.
 *
 * `robots: noindex` porque é uma tela operacional que o cliente recebe por link
 * do comercial. Aparecer em busca não ajuda ninguém e convidaria preenchimento
 * de quem não é cliente.
 */
export const metadata: Metadata = {
  title: "Abertura de CNPJ | ContaZoom",
  description:
    "Formulário de abertura de CNPJ da ContaZoom: dados dos sócios, da empresa e envio dos documentos.",
  robots: { index: false, follow: false },
};

export default function FormularioPage() {
  return <FormularioAberturaView />;
}
