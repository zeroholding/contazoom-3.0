/**
 * Onde o documento do formulário de abertura fica no disco.
 *
 * Espelha `tarefa-anexo-disco.ts` e existe separado por dois motivos:
 *
 * 1. PASTA PRÓPRIA. Estes arquivos NUNCA são excluídos (ver o comentário do model
 *    `FormularioAberturaDocumento`), enquanto anexo de tarefa é apagável. Misturar
 *    as duas coisas na mesma pasta tornaria impossível varrer uma sem risco de
 *    tocar na outra — e a que não pode ser tocada é justamente esta.
 * 2. O arquivo chega por rota PÚBLICA, sem login. Manter o destino num módulo
 *    próprio deixa explícito qual pasta recebe upload anônimo.
 *
 * Disco local, não S3: é o que o projeto já faz, e não há credencial de
 * armazenamento de objeto configurada em nenhum ambiente. O volume nomeado em
 * `/app/uploads` já existe nos dois composes — sem ele o arquivo morre no deploy
 * seguinte e a linha do banco fica apontando para o vazio.
 */

import { join } from "path";
import { nomeDeArquivoSeguro } from "./tarefa-anexo";

/** Subpasta `formulario` dentro de `UPLOAD_DIR`. */
export function diretorioFormulario(): string {
  const base = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
  return join(base, "formulario");
}

/**
 * Caminho absoluto do arquivo, recusando nome que tente sair da pasta.
 *
 * O nome vem do banco, mas o banco não é fronteira de confiança para caminho: uma
 * linha com `../../etc/passwd` devolve `null` em vez de ler o que não deve.
 * Conferir no ponto de uso é mais barato que confiar na higienização que
 * aconteceu na escrita — e a escrita pode ter sido feita por outra versão do
 * código.
 */
export function caminhoDoDocumento(arquivo: string): string | null {
  if (!nomeDeArquivoSeguro(arquivo)) return null;
  return join(diretorioFormulario(), arquivo);
}
