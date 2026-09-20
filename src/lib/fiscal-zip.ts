/**
 * Extração segura de XMLs fiscais de um arquivo ZIP.
 *
 * Função pura, sem banco e sem disco. Roda no navegador antes do upload: o ZIP é
 * aberto localmente, os XMLs viram lotes de até 300 arquivos e só esses lotes
 * chegam ao servidor. Isso resolve o caso real da TOKYO (3.139 XMLs num ZIP de
 * 24,9 MB) sem montar um multipart de centenas de megabytes no container.
 *
 * Biblioteca: `fflate@0.8.3`, versão EXATA. É JavaScript puro, funciona no browser
 * e não precisa de binário nativo no container Node 20.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFESAS CONTRA ZIP BOMB E ZIP SLIP
 *
 * ZIP bomb é o mesmo problema de "billion laughs": poucos bytes comprimidos viram
 * gigabytes e derrubam a heap. Os limites são conferidos nos metadados da entrada
 * ANTES de `file.start()` e de novo nos bytes que saem do descompressor:
 *
 *   - 32 MiB comprimidos por ZIP (o maior arquivo real tem 24,9 MB);
 *   - 64 MiB descompactados no total;
 *   - 1 MiB por XML (mesmo teto do parser);
 *   - 5.000 XMLs por ZIP (o maior real tem 3.139);
 *   - razão individual máxima de 200:1.
 *
 * ZIP slip não acontece porque caminho interno nenhum é escrito em disco. Ainda
 * assim o resultado usa SOMENTE o nome-base (`pedido_chave.xml`), descartando
 * `../`, drive Windows e diretório absoluto. O nome original completo fica apenas
 * em `origem`, para o relatório.
 *
 * POR QUE A API DE STREAM, E NÃO `unzip()`
 *
 * O ZIP real da Shopee tem 1.863 entradas XML, mas apenas 1.840 NOMES únicos: 23
 * arquivos aparecem duas vezes, com bytes idênticos. `unzip()` devolve um objeto
 * chaveado pelo nome e sobrescreve a repetição em silêncio. `Unzip` chama uma vez
 * por entrada física, inclusive nome repetido. As 1.863 seguem para a importação;
 * a segunda cópia vira `DUPLICADO` pela chave/hash, que é o lugar certo de resolver
 * idempotência.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Unzip,
  UnzipInflate,
  UnzipPassThrough,
  type UnzipFile,
} from "fflate";
import { TAMANHO_MAXIMO_XML } from "./fiscal-limites";

const MIB = 1024 * 1024;

/** Maior ZIP real: TOKYO/venda, 24,9 MB. */
export const TAMANHO_MAXIMO_ZIP = 32 * MIB;
/** Soma dos tamanhos declarados e, de novo, dos bytes reais. */
export const TAMANHO_MAXIMO_DESCOMPACTADO = 64 * MIB;
/** Maior ZIP real tem 3.139 XMLs. */
export const MAX_XMLS_POR_ZIP = 5_000;
/** XML comprime bem; 200:1 ainda é folga grande e bloqueia bomba óbvia. */
export const RAZAO_MAXIMA_COMPRESSAO = 200;

export type CodigoErroZip =
  | "ZIP_VAZIO"
  | "ZIP_GRANDE"
  | "ZIP_INVALIDO"
  | "ZIP_SEM_XML"
  | "ZIP_XML_GRANDE"
  | "ZIP_MUITOS_XMLS"
  | "ZIP_EXPANSAO_GRANDE"
  | "ZIP_RAZAO_SUSPEITA";

export class ErroZipFiscal extends Error {
  readonly code: CodigoErroZip;

  constructor(code: CodigoErroZip, message: string) {
    super(message);
    this.name = "ErroZipFiscal";
    this.code = code;
  }
}

export type XmlExtraidoDoZip = {
  /** Nome-base seguro, usado como File.name no upload e pelo parser do order_id. */
  nome: string;
  bytes: Uint8Array;
  /** `<zip>!<caminho interno>`; só diagnóstico, nunca vira caminho no disco. */
  origem: string;
};

function nomeBase(caminho: string): string {
  const normalizado = caminho.replace(/\\/g, "/");
  return normalizado.split("/").filter(Boolean).pop() ?? "arquivo.xml";
}

function ehXml(caminho: string): boolean {
  return nomeBase(caminho).toLowerCase().endsWith(".xml");
}

function juntar(chunks: Uint8Array[], tamanho: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const resultado = new Uint8Array(tamanho);
  let offset = 0;
  for (const chunk of chunks) {
    resultado.set(chunk, offset);
    offset += chunk.length;
  }
  return resultado;
}

function erroDeBiblioteca(nomeZip: string, falha: unknown): ErroZipFiscal {
  if (falha instanceof ErroZipFiscal) return falha;
  const detalhe = falha instanceof Error ? `: ${falha.message}` : "";
  return new ErroZipFiscal(
    "ZIP_INVALIDO",
    `Não foi possível abrir "${nomeZip}"${detalhe}.`,
  );
}

/**
 * Abre um ZIP e devolve todas as entradas XML, inclusive nomes repetidos.
 *
 * O trabalho pesado começa num `setTimeout(0)`: devolve o controle ao React para
 * ele pintar "Abrindo ZIP…" antes da descompressão síncrona. A API de stream é
 * síncrona por arquivo, mas não constrói um segundo objeto com o ZIP inteiro antes
 * de nos entregar as entradas.
 */
export function extrairXmlsDoZip(
  bytes: Uint8Array,
  nomeZip: string,
): Promise<XmlExtraidoDoZip[]> {
  if (bytes.length === 0) {
    return Promise.reject(new ErroZipFiscal("ZIP_VAZIO", `"${nomeZip}" está vazio.`));
  }
  if (bytes.length > TAMANHO_MAXIMO_ZIP) {
    return Promise.reject(
      new ErroZipFiscal(
        "ZIP_GRANDE",
        `"${nomeZip}" tem ${(bytes.length / MIB).toFixed(1)} MB; o limite é ${TAMANHO_MAXIMO_ZIP / MIB} MB.`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const extraidos: XmlExtraidoDoZip[] = [];
      let entradasXml = 0;
      let totalDeclarado = 0;
      let totalReal = 0;
      let terminouDeLerZip = false;
      let pendentes = 0;
      let encerrado = false;

      const falhar = (erro: unknown) => {
        if (encerrado) return;
        encerrado = true;
        reject(erroDeBiblioteca(nomeZip, erro));
      };

      const talvezConcluir = () => {
        if (encerrado || !terminouDeLerZip || pendentes > 0) return;
        encerrado = true;
        if (extraidos.length === 0) {
          reject(
            new ErroZipFiscal(
              "ZIP_SEM_XML",
              `"${nomeZip}" não contém nenhum arquivo .xml.`,
            ),
          );
          return;
        }
        resolve(extraidos);
      };

      const aoEncontrarArquivo = (file: UnzipFile) => {
        if (encerrado || !ehXml(file.name)) return;

        entradasXml += 1;
        if (entradasXml > MAX_XMLS_POR_ZIP) {
          falhar(
            new ErroZipFiscal(
              "ZIP_MUITOS_XMLS",
              `"${nomeZip}" tem mais de ${MAX_XMLS_POR_ZIP.toLocaleString("pt-BR")} XMLs.`,
            ),
          );
          return;
        }

        if (file.originalSize !== undefined) {
          if (file.originalSize <= 0) return;
          if (file.originalSize > TAMANHO_MAXIMO_XML) {
            falhar(
              new ErroZipFiscal(
                "ZIP_XML_GRANDE",
                `"${file.name}" tem ${(file.originalSize / 1024).toFixed(0)} KB descompactado; o limite por XML é ${TAMANHO_MAXIMO_XML / 1024} KB.`,
              ),
            );
            return;
          }
          totalDeclarado += file.originalSize;
          if (totalDeclarado > TAMANHO_MAXIMO_DESCOMPACTADO) {
            falhar(
              new ErroZipFiscal(
                "ZIP_EXPANSAO_GRANDE",
                `"${nomeZip}" passa de ${TAMANHO_MAXIMO_DESCOMPACTADO / MIB} MB depois de aberto.`,
              ),
            );
            return;
          }
        }

        if (file.size !== undefined && file.originalSize !== undefined) {
          const razao =
            file.size > 0
              ? file.originalSize / file.size
              : Number.POSITIVE_INFINITY;
          if (razao > RAZAO_MAXIMA_COMPRESSAO) {
            falhar(
              new ErroZipFiscal(
                "ZIP_RAZAO_SUSPEITA",
                `"${file.name}" expande ${razao.toFixed(0)} vezes; o limite é ${RAZAO_MAXIMA_COMPRESSAO}:1.`,
              ),
            );
            return;
          }
        }

        pendentes += 1;
        const chunks: Uint8Array[] = [];
        let tamanho = 0;

        file.ondata = (falha, chunk, final) => {
          if (encerrado) return;
          if (falha) {
            falhar(falha);
            return;
          }

          tamanho += chunk.length;
          totalReal += chunk.length;

          // Confere de novo com bytes reais. ZIP adulterado pode mentir no
          // diretório central e tentar furar os limites declarados.
          if (tamanho > TAMANHO_MAXIMO_XML) {
            file.terminate?.();
            falhar(
              new ErroZipFiscal(
                "ZIP_XML_GRANDE",
                `"${file.name}" ultrapassou o limite depois de aberto.`,
              ),
            );
            return;
          }
          if (totalReal > TAMANHO_MAXIMO_DESCOMPACTADO) {
            file.terminate?.();
            falhar(
              new ErroZipFiscal(
                "ZIP_EXPANSAO_GRANDE",
                `"${nomeZip}" ultrapassou o limite depois de aberto.`,
              ),
            );
            return;
          }

          if (chunk.length > 0) chunks.push(chunk);

          if (final) {
            pendentes -= 1;
            if (tamanho > 0) {
              extraidos.push({
                nome: nomeBase(file.name).slice(0, 255),
                bytes: juntar(chunks, tamanho),
                origem: `${nomeZip}!${file.name}`,
              });
            }
            talvezConcluir();
          }
        };

        try {
          file.start();
        } catch (falha) {
          pendentes -= 1;
          falhar(falha);
        }
      };

      try {
        const leitor = new Unzip(aoEncontrarArquivo);
        leitor.register(UnzipInflate);
        leitor.register(UnzipPassThrough);

        /*
         * Não entrega o ZIP inteiro numa chamada.
         *
         * O ZIP real TOKYO/venda tem 25,5 MB e 3.139 entradas. `push(bytes,
         * true)` fazia toda a descoberta/descompressão na mesma pilha e falhava
         * intermitentemente com "Maximum call stack size exceeded". Blocos de
         * 256 KiB quebram a pilha e cedem o event loop, sem criar um Worker por
         * entrada (a alternativa assíncrona do fflate abriu milhares e estourou a
         * heap no ZIP Shopee).
         */
        const TAMANHO_BLOCO = 256 * 1024;
        let offset = 0;
        const enviarProximoBloco = () => {
          if (encerrado) return;
          try {
            const fim = Math.min(offset + TAMANHO_BLOCO, bytes.length);
            const ultimo = fim === bytes.length;
            leitor.push(bytes.subarray(offset, fim), ultimo);
            offset = fim;
            if (ultimo) {
              terminouDeLerZip = true;
              talvezConcluir();
            } else {
              setTimeout(enviarProximoBloco, 0);
            }
          } catch (falha) {
            falhar(falha);
          }
        };
        enviarProximoBloco();
      } catch (falha) {
        falhar(falha);
      }
    }, 0);
  });
}
