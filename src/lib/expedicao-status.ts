/**
 * Tradução do status de envio CRU do marketplace para rótulo legível e tom de cor.
 *
 * NÃO IMPORTA PRISMA NEM `next/server` DE PROPÓSITO — mesmo motivo de
 * `src/lib/expedicao.ts`. Quem consome isto é a tela da fila, que é um
 * componente `"use client"`: ela recebe `shipping_status` e `status` já prontos
 * da API e só precisa saber o que escrever e de que cor pintar. Se este arquivo
 * tocasse o Prisma, o cliente do banco iria inteiro para o pacote do navegador.
 * As consultas ficam em `expedicao-data.ts`, que é só servidor.
 *
 * Este arquivo é PURO: nenhuma importação de valor, nenhum efeito, nada de
 * componente. Assim ele serve igual no servidor (para um resumo renderizado no
 * servidor) e no navegador, sem duas cópias da mesma tabela de rótulos.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ ARMADILHA: `shipping_status` SIGNIFICA COISAS DIFERENTES POR CANAL     │
 * ├────────────────────────────────────────────────────────────────────────┤
 * │ MERCADO LIVRE — `shipping_status` é o status do envio de verdade       │
 * │   (`pending`, `handling`, `ready_to_ship`, `printed`, `shipped`,       │
 * │   `delivered`, `not_delivered`, `cancelled`, `invoice_pending`,        │
 * │   `delayed`, `stale`). Vem de `order.shipment.status` no sync — ver    │
 * │   `src/utils/sync-prepare-sale-data.ts`.                              │
 * │                                                                        │
 * │ SHOPEE — `shipping_status` guarda a TRANSPORTADORA, não um status.     │
 * │   O sync grava literalmente `shippingStatus: shippingCarrier` (ver     │
 * │   `src/app/api/shopee/vendas/sync/route.ts`, onde monta o registro da  │
 * │   venda), ou seja "Shopee Xpress", "J&T Express" e afins caem numa     │
 * │   coluna cujo nome promete um status. O status real da Shopee está na  │
 * │   coluna `status` (`READY_TO_SHIP`, `PROCESSED`, `RETRY_SHIP`,         │
 * │   `SHIPPED`, `TO_CONFIRM_RECEIVE`, `COMPLETED`, `IN_CANCEL`,           │
 * │   `CANCELLED`, `UNPAID`, `INVOICE_PENDING`, `TO_RETURN`).              │
 * │                                                                        │
 * │ CONSEQUÊNCIA PARA ESTA API: em `SP` a função IGNORA `shippingStatus` e │
 * │ traduz `statusVenda`. Traduzir a coluna pelo nome dela faria a tela    │
 * │ escrever o nome de uma transportadora onde deveria estar o estado do   │
 * │ pacote — e, pior, cairia sempre no caminho de "valor desconhecido",    │
 * │ então nunca daria erro nem apareceria em teste de tipo.                │
 * │ `expedicao-data.ts` já convive com isso: a MODALIDADE da Shopee é lida │
 * │ de `shipping_status` justamente por ser a transportadora.              │
 * └────────────────────────────────────────────────────────────────────────┘
 */

/* -------------------------------------------------------------------------- */
/*                                    Tom                                     */
/* -------------------------------------------------------------------------- */

/**
 * Tons aceitos pelos selos do shell.
 *
 * ESPELHA `TomSelo` de `src/app/components/views/comum/shell.tsx` DE PROPÓSITO,
 * em vez de importar de lá. O shell é um arquivo de COMPONENTE (`"use client"`,
 * JSX, ícones); fazer esta lib depender dele arrastaria a árvore de componentes
 * para qualquer lugar que só quer um rótulo — inclusive para código de servidor,
 * onde a tela não deveria entrar. A duplicação aqui é de seis literais que não
 * mudam; a alternativa era um acoplamento em sentido errado (lib depender de UI).
 *
 * Se um tom novo aparecer no shell, esta lista tem de ser atualizada à mão. É
 * barato: passar um tom que o shell não conhece quebra na montagem do `Record`
 * dele, não silenciosamente na cor.
 */
export type TomStatus =
  | "neutro"
  | "info"
  | "bom"
  | "alerta"
  | "critico"
  | "marca";

/**
 * O que a tela precisa para desenhar o selo de status.
 *
 * `explicacao` é opcional porque só uns poucos estados exigem contexto para
 * alguém saber o que FAZER (NF pendente, envio ainda não criado). Escrever uma
 * frase para "Entregue" só treinaria a pessoa a ignorar o texto de apoio.
 */
export type StatusEnvio = {
  rotulo: string;
  tom: TomStatus;
  explicacao?: string;
};

/* -------------------------------------------------------------------------- */
/*                               Normalização                                 */
/* -------------------------------------------------------------------------- */

/**
 * Deixa o valor cru comparável com as chaves dos mapas.
 *
 * A troca de ESPAÇO por UNDERSCORE não é zelo: o sync do Mercado Livre grava o
 * status da VENDA com o underscore já removido —
 * `String(o.status).replace(/_/g, " ")` em `src/utils/sync-prepare-sale-data.ts`
 * — então `payment_in_process` chega ao banco como `payment in process` e
 * `paid` chega intacto. O `shipping_status` do ML não passa por essa troca hoje,
 * mas os dois campos vêm da mesma rotina e o SQL da fila já normaliza os dois do
 * mesmo jeito (`REPLACE(LOWER(...), ' ', '_')` em `expedicao-data.ts`). Fazer
 * igual aqui mantém uma única regra de comparação em todo o módulo.
 *
 * Também colapsa espaços repetidos: `"ready  to ship"` e `"ready to ship"` são o
 * mesmo estado, e um espaço extra do marketplace não deveria virar
 * "desconhecido".
 */
function normalizar(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return valor.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Rótulo de último recurso: o valor CRU, em maiúsculas.
 *
 * NUNCA string vazia e NUNCA "Desconhecido". O vocabulário de status dos dois
 * marketplaces é aberto e muda sem aviso (foi o que motivou a lista negra de
 * `ML_ENVIO_ENCERRADO` em `expedicao-data.ts`, em vez de lista branca). Um
 * estado novo tem de APARECER COMO ESTÁ, porque:
 *
 * - linha em branco parece defeito da tela, e ninguém investiga o marketplace;
 * - "Desconhecido" apaga a única informação útil que temos, que é o nome do
 *   estado — sem ele não há o que pesquisar na documentação nem o que reportar.
 *
 * Mostrando o valor cru, quem opera percebe a novidade no mesmo dia e o rótulo
 * bonito entra no mapa depois. Tom `neutro` porque não sabemos a gravidade:
 * pintar de vermelho um estado que talvez seja inofensivo custa confiança na cor.
 */
function cru(valor: string): StatusEnvio {
  return { rotulo: valor.trim().toUpperCase(), tom: "neutro" };
}

/* -------------------------------------------------------------------------- */
/*                              Mercado Livre                                 */
/* -------------------------------------------------------------------------- */

/**
 * `shipping_status` do Mercado Livre.
 *
 * As cores seguem a mesma leitura de `URGENCIA_CLASSE`: `alerta`/`critico` só
 * onde existe AÇÃO possível no galpão, e `neutro` no que já saiu das mãos de
 * quem opera. Por isso `shipped`, `delivered` e `cancelled` são neutros mesmo
 * sendo desfechos muito diferentes — nenhum deles é trabalho, e destacá-los
 * roubaria atenção de quem ainda precisa despachar.
 *
 * `cancelled` e `canceled` convivem porque o ML devolve as duas grafias
 * dependendo do recurso; `expedicao-data.ts` já lista as duas por esse motivo.
 */
const ML_STATUS: Record<string, StatusEnvio> = {
  pending: {
    rotulo: "Envio pendente",
    tom: "alerta",
  },
  handling: {
    rotulo: "Em preparação",
    tom: "alerta",
  },
  invoice_pending: {
    rotulo: "NF pendente",
    tom: "critico",
    // Crítico e não alerta: sem a NF-e o ML não libera a etiqueta, então o
    // pacote não pode sair nem que alguém queira. É bloqueio, não fila.
    explicacao: "Emita a NF-e para o Mercado Livre liberar a etiqueta.",
  },
  ready_to_ship: {
    rotulo: "Pronto para envio",
    tom: "bom",
  },
  printed: {
    rotulo: "Etiqueta impressa",
    tom: "info",
  },
  delayed: {
    rotulo: "Atrasado no ML",
    tom: "critico",
  },
  shipped: {
    rotulo: "Despachado",
    tom: "neutro",
  },
  delivered: {
    rotulo: "Entregue",
    tom: "neutro",
  },
  not_delivered: {
    rotulo: "Não entregue",
    tom: "critico",
  },
  cancelled: {
    rotulo: "Cancelado",
    tom: "neutro",
  },
  canceled: {
    rotulo: "Cancelado",
    tom: "neutro",
  },
  stale: {
    rotulo: "Parado no ML",
    tom: "alerta",
  },
};

/**
 * Envio que o marketplace ainda não criou.
 *
 * Estado legítimo e comum, não erro de sync: a venda foi paga e o ML leva um
 * tempo para gerar o envio. Fica `neutro` pelo mesmo motivo de `semPrazo` em
 * `expedicao.ts` — ausência de informação não é gravidade, e pintar de vermelho
 * faria a tela gritar por um dado que não depende de ninguém aqui.
 */
const ML_SEM_ENVIO: StatusEnvio = {
  rotulo: "Envio não criado",
  tom: "neutro",
  explicacao:
    "A venda foi paga e o Mercado Livre ainda não gerou o envio. Nada a fazer no galpão até a etiqueta existir.",
};

/* -------------------------------------------------------------------------- */
/*                                  Shopee                                    */
/* -------------------------------------------------------------------------- */

/**
 * `order_status` da Shopee — que mora na coluna `status`, NÃO em
 * `shipping_status` (ver a armadilha no topo do arquivo).
 *
 * Enum fechado e pequeno, ao contrário do ML: é o mesmo motivo pelo qual
 * `SP_STATUS_FILA` em `expedicao-data.ts` pode ser lista branca. Ainda assim o
 * caminho de "valor desconhecido" continua valendo, porque "fechado" é uma
 * promessa da documentação, não uma garantia do que chega no JSON.
 */
const SP_STATUS: Record<string, StatusEnvio> = {
  ready_to_ship: {
    rotulo: "Pronto para envio",
    tom: "bom",
  },
  processed: {
    rotulo: "Processado",
    tom: "info",
  },
  retry_ship: {
    rotulo: "Nova tentativa",
    tom: "alerta",
  },
  shipped: {
    rotulo: "Despachado",
    tom: "neutro",
  },
  to_confirm_receive: {
    rotulo: "Aguardando o comprador",
    tom: "neutro",
  },
  completed: {
    rotulo: "Concluído",
    tom: "neutro",
  },
  in_cancel: {
    rotulo: "Cancelamento em curso",
    tom: "alerta",
  },
  cancelled: {
    rotulo: "Cancelado",
    tom: "neutro",
  },
  unpaid: {
    rotulo: "Não pago",
    tom: "critico",
  },
  invoice_pending: {
    rotulo: "NF pendente",
    tom: "critico",
  },
  to_return: {
    rotulo: "Devolução",
    tom: "critico",
  },
};

/**
 * Status da Shopee ausente.
 *
 * Não deveria acontecer (`order_status` é obrigatório na resposta de
 * `get_order_detail`), mas a coluna é texto e o registro pode ter vindo de um
 * sync antigo. Mesma regra do resto do arquivo: dizer o que se sabe em vez de
 * devolver vazio, para a linha não parecer defeito de renderização.
 */
const SP_SEM_STATUS: StatusEnvio = {
  rotulo: "Status não informado",
  tom: "neutro",
  explicacao: "A Shopee não devolveu o status deste pedido no último sync.",
};

/* -------------------------------------------------------------------------- */
/*                              API pública                                   */
/* -------------------------------------------------------------------------- */

/**
 * Traduz o estado do pacote para rótulo e tom, respeitando o canal.
 *
 * Recebe os DOIS campos crus (`shippingStatus` e `statusVenda`) mesmo usando um
 * só por canal, porque a decisão de qual deles vale é exatamente o conhecimento
 * que esta função existe para concentrar — ver a armadilha no topo. Se ela
 * recebesse apenas "o status", cada chamador teria de escolher a coluna certa, e
 * o erro voltaria espalhado pela tela.
 *
 * - `ML`: traduz `shippingStatus` (o status do envio de verdade).
 * - `SP`: traduz `statusVenda` e IGNORA `shippingStatus`, que ali é a
 *   transportadora. Para lê-la, use `transportadoraShopee`.
 */
export function statusEnvio(
  canal: "ML" | "SP",
  shippingStatus: string | null,
  statusVenda: string,
): StatusEnvio {
  if (canal === "SP") {
    const chave = normalizar(statusVenda);
    if (chave === "") return SP_SEM_STATUS;
    return SP_STATUS[chave] ?? cru(statusVenda);
  }

  const chave = normalizar(shippingStatus);
  // Vazio e NULL são o MESMO caso: o sync grava `null` quando o ML não mandou
  // envio, mas `NULLIF(TRIM(...), '')` no SQL da fila mostra que string vazia
  // também chega. Tratar só um dos dois deixaria metade das linhas caindo no
  // caminho de "desconhecido" com rótulo vazio.
  if (chave === "") return ML_SEM_ENVIO;
  return ML_STATUS[chave] ?? cru(shippingStatus ?? "");
}

/**
 * Transportadora da Shopee.
 *
 * Existe SÓ por causa da armadilha da coluna: a transportadora está gravada em
 * `shipping_status` (`shippingStatus: shippingCarrier` no sync da Shopee), e sem
 * uma função com este nome cada tela leria `pacote.shippingStatus` achando que é
 * status — que é o engano que o nome da coluna praticamente convida a cometer.
 * Chamar isto documenta a intenção no ponto de uso.
 *
 * Devolve o valor com `trim` e sem mexer em caixa: é nome próprio de empresa
 * ("Shopee Xpress", "J&T Express") e maiusculizar só dificultaria a leitura.
 * `null` quando vazio, para a tela poder omitir o campo em vez de desenhar um
 * rótulo sem conteúdo.
 */
export function transportadoraShopee(shippingStatus: string | null): string | null {
  if (shippingStatus === null || shippingStatus === undefined) return null;
  const limpo = shippingStatus.trim();
  return limpo === "" ? null : limpo;
}
