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
 * onde estava. Agrupando, a interrupção acontece numa fase só, quando ela já sabe
 * exatamente quais arquivos buscar.
 */

import Icone from "@/app/components/views/ui/tarefas/Icone";
import { TAMANHO_MAXIMO_BYTES, tamanhoLegivel } from "@/lib/tarefa-anexo";
import {
  gruposDeDocumentos,
  type Erros,
  type FormularioAbertura,
} from "@/lib/formulario-abertura";
import { Cartao, Nota, TituloSecao } from "../componentes/Base";
import { SlotDocumento } from "../componentes/Campos";

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
      <TituloSecao
        nivel={2}
        icone="Paperclip"
        titulo="Documentos"
        descricao="Cada arquivo já vem identificado com o dono. Nada de pasta comum onde ninguém sabe de quem é o quê."
      />

      <Nota tom="atencao">
        PDF, JPG ou PNG, até {tamanhoLegivel(TAMANHO_MAXIMO_BYTES)} por arquivo.
        Foto do celular serve, desde que o documento esteja legível.{" "}
        <strong className="font-bold">
          Os arquivos não ficam salvos se você fechar a página
        </strong>{" "}
        — envie o formulário na mesma sessão em que anexar.
      </Nota>

      {grupos.map((grupo) => {
        const obrigatorios = grupo.slots.filter((s) => s.obrigatorio);
        const prontos = obrigatorios.filter(
          (s) => (arquivos[s.chave]?.length ?? 0) > 0
        ).length;
        const completo =
          obrigatorios.length > 0 && prontos === obrigatorios.length;

        return (
          <Cartao key={grupo.chave} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[#E7EAEF] bg-[#FBFCFD] px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${
                    completo
                      ? "border-[#FFDCC4] bg-[#FFF4EC] text-[#D9500A]"
                      : "border-[#E7EAEF] bg-white text-[#667085]"
                  }`}
                >
                  <Icone
                    nome={grupo.chave === "empresa" ? "Building2" : "IdCard"}
                    className="h-[1.125rem] w-[1.125rem]"
                  />
                </span>
                {/* Nome da pessoa como cabeçalho do grupo: é o que faz a
                    propriedade do arquivo ficar óbvia de relance. */}
                <h3 className="truncate text-[1rem] font-bold tracking-[-0.01em] text-[#101828]">
                  {grupo.titulo}
                </h3>
              </div>

              {obrigatorios.length > 0 && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-bold ${
                    completo
                      ? "bg-[#FFF4EC] text-[#C2410C]"
                      : "bg-[#F2F4F7] text-[#475467]"
                  }`}
                >
                  {completo && (
                    <Icone nome="CheckCircle2" className="h-3.5 w-3.5" />
                  )}
                  <span className="cz-num">
                    {prontos} de {obrigatorios.length}
                  </span>
                </span>
              )}
            </div>

            <div className="divide-y divide-[#E7EAEF]">
              {grupo.slots.map((slot) => (
                <div key={slot.chave} className="p-4 sm:p-5">
                  <SlotDocumento
                    rotulo={slot.rotulo}
                    ajuda={slot.ajuda}
                    obrigatorio={slot.obrigatorio}
                    arquivos={arquivos[slot.chave] ?? []}
                    onMudar={(lista) => onMudarArquivos(slot.chave, lista)}
                    erro={erros[slot.chave] ?? null}
                  />
                </div>
              ))}
            </div>
          </Cartao>
        );
      })}
    </div>
  );
}
