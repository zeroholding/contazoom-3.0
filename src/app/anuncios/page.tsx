import { redirect } from "next/navigation";

/**
 * `/anuncios` não é tela: é o pai do grupo no menu lateral.
 *
 * O grupo do Sidebar declara um `href` no cabeçalho (mesmo padrão de `/vendas` e
 * `/financeiro`), então a rota precisa existir para não dar 404 em quem clica no
 * título do grupo ou digita o endereço. Redireciona para Mais Vendidos porque é a
 * pergunta mais frequente das duas — quem abre "anúncios" quase sempre quer saber
 * o que está vendendo.
 */
export default function AnunciosPage() {
  redirect("/anuncios/mais-vendidos");
}
