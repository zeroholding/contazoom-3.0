import { executeRedisCommand } from "@/lib/redis";

/**
 * CURSOR INCREMENTAL DE SINCRONIZAÇÃO, POR CONTA.
 *
 * Guarda o instante em que começou a última sincronização COMPLETA de uma conta
 * (todas as páginas buscadas e todas as vendas gravadas). A próxima sync pede ao
 * marketplace só o que mudou a partir dele, menos uma sobreposição de folga.
 *
 * Por que não usar `max(atualizadoEm)` da tabela de vendas: essa coluna é o
 * relógio de GRAVAÇÃO do nosso banco e anda sozinha — qualquer update, inclusive
 * de backfill ou correção, empurra a marca para frente sem que o marketplace
 * tenha sido lido até ali. Uma página que falhou em silêncio também avança a
 * marca. O cursor só anda quando a leitura foi inteira.
 *
 * É OTIMIZAÇÃO, NUNCA FONTE DE VERDADE: se o Redis estiver fora, se a chave não
 * existir ou vier corrompida, `lerCursorSync` devolve `null` e o chamador cai na
 * janela larga antiga. Nenhuma função aqui lança erro.
 */

export type CanalCursorSync = "meli" | "shopee" | "tiktok";

/**
 * Folga aplicada ao ler o cursor. Cobre atraso de indexação da busca do
 * marketplace (o pedido atualizado às 10h pode aparecer na busca minutos depois)
 * e diferença de relógio entre servidores. Custa pouco: são só os pedidos
 * atualizados na última hora, e os inalterados são pulados.
 */
export const SOBREPOSICAO_CURSOR_MS = 60 * 60 * 1000;

const PREFIXO = "sync-cursor:v1";
const TTL_SEGUNDOS = 90 * 24 * 60 * 60;
/** Cursor mais de 5 min no futuro é valor inválido, não relógio adiantado. */
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

function chave(canal: CanalCursorSync, accountId: string): string {
  return `${PREFIXO}:${canal}:${accountId}`;
}

function comoData(valor: string | null): Date | null {
  if (!valor) return null;
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return null;
  if (data.getTime() > Date.now() + TOLERANCIA_FUTURO_MS) return null;
  return data;
}

/** Instante de início da última sync completa da conta, ou `null`. */
export async function lerCursorSync(
  canal: CanalCursorSync,
  accountId: string,
): Promise<Date | null> {
  try {
    return await executeRedisCommand(
      async (client) => comoData(await client.get(chave(canal, accountId))),
      async () => null,
    );
  } catch {
    return null;
  }
}

/**
 * Início da janela incremental a partir do cursor, já com a sobreposição.
 * `null` quando não há cursor válido: o chamador usa a regra antiga.
 */
export async function inicioJanelaPeloCursor(
  canal: CanalCursorSync,
  accountId: string,
): Promise<Date | null> {
  const cursor = await lerCursorSync(canal, accountId);
  return cursor ? new Date(cursor.getTime() - SOBREPOSICAO_CURSOR_MS) : null;
}

/**
 * Avança o cursor para `inicioDaSync`. Nunca retrocede: se já existe um valor
 * mais novo, ele fica. Chamar SÓ depois de a conta ter sido lida e gravada por
 * inteiro — página com erro, parada por tempo ou venda que falhou ao salvar
 * significam "não avançar".
 */
export async function gravarCursorSync(
  canal: CanalCursorSync,
  accountId: string,
  inicioDaSync: Date,
): Promise<void> {
  if (!Number.isFinite(inicioDaSync.getTime())) return;
  try {
    await executeRedisCommand(
      async (client) => {
        const atual = comoData(await client.get(chave(canal, accountId)));
        if (atual && atual.getTime() >= inicioDaSync.getTime()) return;
        await client.set(
          chave(canal, accountId),
          inicioDaSync.toISOString(),
          "EX",
          TTL_SEGUNDOS,
        );
      },
      async () => undefined,
    );
  } catch {
    // Sem cursor, a próxima sync usa a janela larga. Nada a fazer aqui.
  }
}

/** Apaga o cursor da conta. Use após apagar vendas dela ou trocar de regra. */
export async function limparCursorSync(
  canal: CanalCursorSync,
  accountId: string,
): Promise<void> {
  try {
    await executeRedisCommand(
      async (client) => {
        await client.del(chave(canal, accountId));
      },
      async () => undefined,
    );
  } catch {
    // Idem: ausência de cursor é o estado seguro.
  }
}
