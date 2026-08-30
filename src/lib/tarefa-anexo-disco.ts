/**
 * Onde o anexo de tarefa fica no disco.
 *
 * Separado de `tarefa-anexo.ts` por causa do bundle: aquele arquivo é importado
 * por `Anexos.tsx`, que é `"use client"`, e um `import { join } from "path"` ali
 * arrastaria polyfill de módulo do Node para o navegador sem necessidade. Aqui só
 * as duas rotas importam.
 *
 * DISCO LOCAL, e não S3.
 *
 * É o que o projeto já faz em `/api/documents`, e não há credencial de S3 ou R2
 * configurada em nenhum ambiente. Os composes ganharam volume nomeado em
 * `/app/uploads` na mesma mudança — sem ele o arquivo morria no deploy seguinte e
 * a linha no banco continuava apontando para um arquivo inexistente, que é o
 * defeito que o download trata com 410.
 *
 * Trocar por armazenamento de objeto depois muda este arquivo e mais nada: quem
 * chama só conhece `diretorioAnexos` e `caminhoDoAnexo`.
 */

import { join } from "path";
import { nomeDeArquivoSeguro } from "./tarefa-anexo";

/**
 * Diretório dos anexos de tarefa.
 *
 * Subpasta `tarefas` dentro de `UPLOAD_DIR`, separada dos documentos de cliente:
 * as duas coisas têm ciclo de vida e permissão diferentes, e misturar tornaria
 * impossível varrer uma sem tocar na outra.
 */
export function diretorioAnexos(): string {
  const base = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
  return join(base, "tarefas");
}

/**
 * Caminho absoluto do arquivo, recusando nome que tente sair da pasta.
 *
 * O nome vem do banco, mas o banco não é fronteira de confiança para caminho: se
 * uma linha antiga tiver `../../etc/passwd`, esta função devolve `null` em vez de
 * ler o que não deve. Conferir no ponto de uso é mais barato que confiar na
 * higienização que aconteceu na escrita — e a escrita pode ter sido feita por uma
 * versão anterior do código.
 */
export function caminhoDoAnexo(arquivo: string): string | null {
  if (!nomeDeArquivoSeguro(arquivo)) return null;
  return join(diretorioAnexos(), arquivo);
}
