/**
 * Onde o XML fiscal fica no disco.
 *
 * Separado da lógica de importação pelo mesmo motivo de `tarefa-anexo-disco.ts`:
 * quem chama só conhece as três funções daqui, então trocar disco local por
 * armazenamento de objeto depois muda este arquivo e mais nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE O ARQUIVO É GUARDADO, E NÃO SÓ LIDO
 *
 * O XML é a PROVA do número. Quando o banco questionar a declaração de
 * faturamento, o que responde é o arquivo original — não a linha do nosso banco.
 * Retenção fiscal é de 5 anos.
 *
 * POR QUE SHARDEADO POR CNPJ E COMPETÊNCIA
 *
 * Conta do volume real: 822 arquivos numa conta, num mês. O grupo tem cinco
 * contas de Mercado Livre mais Shopee e TikTok. Na mesma ordem de grandeza dá
 * ~50 mil arquivos por ano. Um diretório único com 50 mil arquivos é problema
 * operacional de verdade — listagem, backup e inode. O caminho é derivável da
 * chave de acesso, então o sharding não custa nenhuma coluna a mais.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { join } from "path";

/** `<cnpj>/<AAAA-MM>/<chave>.xml` — o formato exato que este módulo grava. */
const FORMATO_RELATIVO = /^\d{14}\/\d{4}-\d{2}\/\d{44}\.xml$/;

/**
 * Diretório raiz dos XML fiscais.
 *
 * Subpasta própria dentro de `UPLOAD_DIR`, irmã de `tarefas`: documento fiscal
 * tem retenção legal e ciclo de vida diferente de anexo de trabalho, e misturar
 * tornaria impossível varrer um sem tocar no outro.
 */
export function diretorioXmlFiscal(): string {
  const base = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
  return join(base, "fiscal-xml");
}

/**
 * Caminho relativo a gravar no banco.
 *
 * A competência vem de fora (derivada de `dhEmi`) e não da chave, embora a chave
 * também carregue AAMM: são a mesma coisa em nota normal, mas se um dia
 * divergirem o que vale para organizar é a data de emissão, que é o critério da
 * apuração.
 */
export function caminhoRelativoDoXml(
  cnpjEmitente: string,
  ano: number,
  mes: number,
  chave: string,
): string {
  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;
  return `${cnpjEmitente}/${competencia}/${chave}.xml`;
}

/**
 * Caminho absoluto, recusando qualquer coisa fora do formato esperado.
 *
 * WHITELIST, e não blacklist de `..`: a lista de formas de escapar de um
 * diretório é longa e depende de plataforma (`..`, `%2e%2e`, barra invertida,
 * caminho absoluto, byte nulo). Exigir que o valor case exatamente
 * `14 dígitos / AAAA-MM / 44 dígitos .xml` rejeita tudo isso de uma vez, sem
 * precisar prever cada variante.
 *
 * A conferência acontece na LEITURA e não só na escrita, de propósito: o valor
 * vem do banco, e o banco não é fronteira de confiança para caminho — a linha
 * pode ter sido gravada por uma versão anterior do código.
 */
export function caminhoAbsolutoDoXml(relativo: string): string | null {
  if (!relativo || !FORMATO_RELATIVO.test(relativo)) return null;
  return join(diretorioXmlFiscal(), ...relativo.split("/"));
}
