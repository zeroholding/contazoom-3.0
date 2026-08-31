"use client";

/**
 * Passo 4: documentos, agrupados POR PESSOA.
 *
 * O defeito que isto resolve é o mais caro do formulário antigo: "RG ou CNH
 * do(s) Sócio(s) — faça upload de até 5 arquivos aceitos, o tamanho máximo é de
 * 100 MB por item". Chegavam quatro fotos chamadas `IMG_2841.jpg` e ninguém
 * sabia de quem era nenhuma. E 100 MB para fotografar um RG significa cinco
 * minutos de barra andando em 4G e uma desistência.
 *
 * POR QUE OS UPLOADS FICAM NUM PASSO SÓ, em vez de dentro do bloco de cada
 * sócio: no celular, escolher arquivo tira a pessoa do navegador e a devolve
 * depois. Se isso acontecer no meio da digitação, ela volta e precisa reencontrar
 * onde estava. Agrupando, a interrupção acontece numa fase só, quando ela já
 * sabe exatamente quais arquivos buscar.
 */

import Icone from "@/app/components/views/ui/tarefas/Icone";
import { TAMANHO_MAXIMO_BYTES, tamanhoLegivel } from "@/lib/tarefa-anexo";
import {
  gruposDeDocumentos,
  type Erros,
  type FormularioAbertura,
} from "@/lib/formulario-abertura";
import { SlotDocumento } from "../componentes/Campos";
import { CabecalhoPasso } from "./PassoSocios";

export function PassoDocumentos({
  dados,
  erros,
  arquivos,
  onMudarArquivos,
}: {
  dados: FormularioAbertura;
  erros: Erros;
  /**
   * Chave do slot para os arquivos dela.
   *
   * Vive na tela, fora do estado que vai para o `localStorage`: `File` não é
   * serializável em JSON, e converter para base64 estouraria a cota de ~5 MB com
   * um PDF só.
   */
  arquivos: Record<string, File[]>;
  onMudarArquivos: (chave: string, lista: File[]) => void;
}) {
  const grupos = gruposDeDocumentos(dados);

  return (
    <div className="space-y-5">
      <CabecalhoPasso
        icone="Paperclip"
        titulo="Documentos"
        descricao="Cada arquivo já vem identificado com o dono. Nada de pasta comum onde ninguém sabe de quem é o quê."
      />

      <p className="flex items-start gap-2 rounded-[10px] border border-[#EDEFF3] bg-[#F8F9FB] px-3.5 py-3 text-xs font-medium leading-5 text-[#6B7280]">
        <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          PDF, JPG ou PNG, até {tamanhoLegivel(TAMANHO_MAXIMO_BYTES)} por
          arquivo. Foto do celular serve, desde que o documento esteja legível.{" "}
          <strong className="font-semibold text-[#B54708]">
            Os arquivos não ficam salvos se você fechar a página
          </strong>{" "}
          — envie o formulário na mesma sessão em que anexar.
        </span>
      </p>

      {grupos.map((grupo) => {
        const obrigatorios = grupo.slots.filter((s) => s.obrigatorio);
        const prontos = obrigatorios.filter(
          (s) => (arquivos[s.chave]?.length ?? 0) > 0
        ).length;
        const completo = obrigatorios.length > 0 && prontos === obrigatorios.length;

        return (
          <section
            key={grupo.chave}
            className="overflow-hidden rounded-[14px] border border-[#EDEFF3] bg-white"
            style={{ boxShadow: "var(--cz-elev-1)" }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#EDEFF3] bg-[#FCFCFD] px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]"
                >
                  <Icone
                    nome={grupo.chave === "empresa" ? "Building2" : "IdCard"}
                    className="h-4 w-4"
                  />
                </span>
                {/* Nome da pessoa em caixa alta como cabeçalho do grupo: é o que
                    faz a propriedade do arquivo ficar óbvia de relance. */}
                <h3 className="truncate text-[0.875rem] font-bold uppercase tracking-wide text-[#14161B]">
                  {grupo.titulo}
                </h3>
              </div>

              {obrigatorios.length > 0 && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${
                    completo
                      ? "bg-[#FFF2E9] text-[#C2410C]"
                      : "bg-[#F1F3F6] text-[#4B5563]"
                  }`}
                >
                  {completo && <Icone nome="CheckCircle2" className="h-3.5 w-3.5" />}
                  <span className="cz-num">
                    {prontos} de {obrigatorios.length}
                  </span>
                </span>
              )}
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              {grupo.slots.map((slot) => (
                <SlotDocumento
                  key={slot.chave}
                  rotulo={slot.rotulo}
                  ajuda={slot.ajuda}
                  obrigatorio={slot.obrigatorio}
                  arquivos={arquivos[slot.chave] ?? []}
                  onMudar={(lista) => onMudarArquivos(slot.chave, lista)}
                  erro={erros[slot.chave] ?? null}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
