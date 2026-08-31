"use client";

/**
 * Tela de "enviado", com o protocolo e o link único.
 *
 * É a tela que fecha o preenchimento, e ela tem três trabalhos, nessa ordem:
 *
 * 1. DIZER QUE CHEGOU. O medo de quem acabou de mandar CPF, endereço e foto de RG
 *    é ter perdido tudo. A confirmação é a primeira coisa e é grande.
 * 2. DAR O PROTOCOLO. É o que a pessoa cita quando liga. Fica em fonte grande,
 *    numeral tabular, com botão de copiar — ditar "CZ-7H2KQ4" por telefone só
 *    funciona se estiver legível, e o alfabeto do protocolo já exclui 0/O e 1/I/L
 *    justamente por isso.
 * 3. DAR O LINK. Guardar o link é o que permite conferir depois sem ligar para o
 *    escritório. E o aviso de que o link mostra os dados é obrigatório: quem
 *    encaminha o link num grupo de WhatsApp precisa saber o que está encaminhando.
 */

import { useState } from "react";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { BotaoForm, Cartao, Nota } from "./Base";

export function Concluido({
  protocolo,
  url,
  documentos,
  onRecomecar,
}: {
  protocolo: string;
  /** Caminho relativo. O absoluto é montado aqui, com a origem do navegador. */
  url: string;
  documentos: number;
  onRecomecar: () => void;
}) {
  const [copiado, setCopiado] = useState<"protocolo" | "link" | null>(null);

  // `window.location.origin` e não variável de ambiente: em homologação e em
  // produção o domínio é diferente, e um link com o domínio errado é pior que
  // link nenhum.
  const linkCompleto =
    typeof window === "undefined" ? url : `${window.location.origin}${url}`;

  async function copiar(texto: string, qual: "protocolo" | "link") {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2200);
    } catch {
      // `navigator.clipboard` falha sem HTTPS e em navegador antigo. O texto está
      // visível na tela e selecionável, então o caminho manual continua aberto —
      // por isso o silêncio aqui em vez de um alerta.
    }
  }

  return (
    <div className="space-y-5">
      <Cartao className="overflow-hidden">
        {/* Faixa laranja: é o único momento do formulário em que a marca aparece
            cheia, e é o momento que a pessoa vai printar. */}
        <div className="bg-gradient-to-br from-[#F26212] to-[#C74A08] px-6 py-8 text-center sm:px-10 sm:py-10">
          <span
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/25"
          >
            <Icone nome="CheckCircle2" className="h-9 w-9 text-white" />
          </span>

          <h2 className="mt-5 text-[1.5rem] font-bold leading-8 tracking-[-0.025em] text-white sm:text-[1.75rem]">
            Formulário enviado
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-6 text-white/90">
            Recebemos seus dados e{" "}
            <strong className="font-bold text-white">
              {documentos} {documentos === 1 ? "documento" : "documentos"}
            </strong>
            . O escritório já pode dar andamento na abertura do CNPJ.
          </p>
        </div>

        {/* ----------------------------- Protocolo ----------------------------- */}
        <div className="border-b border-[#E7EAEF] px-6 py-7 text-center sm:px-10">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.08em] text-[#98A2B3]">
            Seu protocolo
          </p>
          <p className="cz-num mt-2 text-[2rem] font-bold leading-none tracking-[0.02em] text-[#101828] sm:text-[2.5rem]">
            {protocolo}
          </p>
          <p className="mx-auto mt-3 max-w-sm text-[0.8125rem] leading-5 text-[#667085]">
            Anote ou tire um print. É o número que você informa ao falar com o
            escritório.
          </p>

          <div className="mt-4 flex justify-center">
            <BotaoForm
              variante={copiado === "protocolo" ? "secundario" : "primario"}
              icone={copiado === "protocolo" ? "CheckCircle2" : "Hash"}
              onClick={() => copiar(protocolo, "protocolo")}
            >
              {copiado === "protocolo" ? "Protocolo copiado" : "Copiar protocolo"}
            </BotaoForm>
          </div>
        </div>

        {/* -------------------------------- Link ------------------------------- */}
        <div className="px-6 py-7 sm:px-10">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#FFDCC4] bg-[#FFF4EC] text-[#D9500A]"
            >
              <Icone nome="Link2" className="h-[1.125rem] w-[1.125rem]" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[1.0625rem] font-bold leading-6 tracking-[-0.017em] text-[#101828]">
                Link para consultar depois
              </h3>
              <p className="mt-1 text-[0.875rem] leading-[1.55] text-[#667085]">
                Guarde este endereço. Ele abre exatamente o que você enviou, sem
                precisar preencher nada de novo.
              </p>
            </div>
          </div>

          {/* O link inteiro visível e selecionável, não escondido atrás de um
              botão: se o `clipboard` falhar (acontece sem HTTPS), a pessoa ainda
              consegue selecionar e copiar à mão. */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 overflow-x-auto rounded-[10px] border border-[#E7EAEF] bg-[#F7F8FA] px-3.5 py-3 text-[0.8125rem] leading-5 text-[#344054]">
              <span className="whitespace-nowrap font-medium">{linkCompleto}</span>
            </p>
            <BotaoForm
              variante="secundario"
              icone={copiado === "link" ? "CheckCircle2" : "Link2"}
              onClick={() => copiar(linkCompleto, "link")}
              className="shrink-0"
            >
              {copiado === "link" ? "Link copiado" : "Copiar link"}
            </BotaoForm>
          </div>

          <Nota tom="atencao" className="mt-4">
            Quem tiver este link vê os dados e a lista de documentos que você
            enviou. Compartilhe só com quem precisa.
          </Nota>
        </div>
      </Cartao>

      {/* --------------------------- O que vem agora -------------------------- */}
      <Cartao className="p-5 sm:p-6">
        <h3 className="text-[1.0625rem] font-bold leading-6 tracking-[-0.017em] text-[#101828]">
          O que acontece agora
        </h3>
        <ol className="mt-4 space-y-4">
          {[
            {
              titulo: "Conferência dos dados e dos documentos",
              texto:
                "O escritório confere o que você enviou e verifica as atividades para definir os CNAEs.",
            },
            {
              titulo: "Consulta de viabilidade do nome",
              texto:
                "As três opções de razão social são consultadas na Junta Comercial, na ordem que você informou.",
            },
            {
              titulo: "Registro e emissão do CNPJ",
              texto:
                "Com a viabilidade aprovada, o processo segue para o registro digital e a emissão dos documentos.",
            },
          ].map((passo, i) => (
            <li key={passo.titulo} className="flex gap-3.5">
              <span
                aria-hidden="true"
                className="cz-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E7EAEF] bg-[#F7F8FA] text-[0.8125rem] font-bold text-[#475467]"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-semibold leading-5 text-[#101828]">
                  {passo.titulo}
                </span>
                <span className="mt-0.5 block text-[0.875rem] leading-[1.55] text-[#667085]">
                  {passo.texto}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-5 border-t border-[#E7EAEF] pt-4 text-[0.875rem] leading-[1.55] text-[#667085]">
          Se algum dado estiver errado, fale com o escritório informando o
          protocolo. Não é preciso preencher o formulário de novo.
        </p>
      </Cartao>

      <div className="flex justify-center">
        <BotaoForm variante="secundario" icone="Plus" onClick={onRecomecar}>
          Preencher para outra empresa
        </BotaoForm>
      </div>
    </div>
  );
}
