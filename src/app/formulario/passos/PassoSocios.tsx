"use client";

/**
 * Passo 1: quantos sócios, e o bloco completo de cada um.
 *
 * A quantidade vem primeiro porque nada mais pode ser perguntado antes de saber
 * quem são as pessoas: capital, administração e documentos todos dependem disso.
 */

import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  MAXIMO_SOCIOS,
  type Erros,
  type FormularioAbertura,
  type Socio,
} from "@/lib/formulario-abertura";
import { BotaoForm, Cartao, TituloSecao } from "../componentes/Base";
import { BlocoSocio } from "./BlocoSocio";

export function PassoSocios({
  dados,
  erros,
  onMudarSocio,
  onAdicionar,
  onPedirRemocao,
}: {
  dados: FormularioAbertura;
  erros: Erros;
  onMudarSocio: (indice: number, parcial: Partial<Socio>) => void;
  onAdicionar: () => void;
  /** Pede confirmação no pai: remover apaga dados e documentos daquela pessoa. */
  onPedirRemocao: (indice: number) => void;
}) {
  const total = dados.socios.length;

  return (
    <div className="space-y-5">
      <TituloSecao
        nivel={2}
        icone="Users"
        titulo="Quem são os sócios"
        descricao="Cada pessoa tem os dados dela, sem misturar. Comece pela quantidade."
      />

      {/* --------------------------- Quantidade -------------------------------- */}
      <Cartao className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold leading-5 text-[#101828]">
              Quantidade de sócios
            </p>
            <p className="mt-1 text-[0.8125rem] leading-5 text-[#667085]">
              {total === 1
                ? "Empresa com um único sócio."
                : `${total} pessoas na sociedade.`}
            </p>
          </div>

          {/* Contador com dois passos, em vez de select de 1 a 10: a mudança é
              quase sempre de um em um, e o select esconde o valor atual atrás de
              um toque. */}
          <div className="flex items-center gap-1 rounded-[12px] border border-[#D8DDE5] bg-white p-1">
            <button
              type="button"
              onClick={() => onPedirRemocao(total - 1)}
              disabled={total <= 1}
              aria-label="Remover o último sócio"
              className="cz-campo-foco flex h-11 w-11 items-center justify-center rounded-[10px] text-[#475467] transition-colors hover:bg-[#F2F4F7] hover:text-[#101828] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Icone nome="MinusCircle" className="h-[1.125rem] w-[1.125rem]" />
            </button>
            <span
              className="cz-num min-w-[2.75rem] text-center text-[1.375rem] font-bold text-[#101828]"
              aria-live="polite"
            >
              {total}
            </span>
            <button
              type="button"
              onClick={onAdicionar}
              disabled={total >= MAXIMO_SOCIOS}
              aria-label="Adicionar um sócio"
              className="cz-campo-foco flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#FFF4EC] text-[#D9500A] transition-colors hover:bg-[#FFE7D6] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Icone nome="Plus" className="h-[1.125rem] w-[1.125rem]" />
            </button>
          </div>
        </div>
      </Cartao>

      {/* ------------------------------ Blocos --------------------------------- */}
      <div className="space-y-5">
        {dados.socios.map((socio, i) => (
          <BlocoSocio
            key={i}
            socio={socio}
            indice={i}
            total={total}
            enderecoDoPrimeiro={dados.socios[0].endereco}
            erros={erros}
            onMudar={(parcial) => onMudarSocio(i, parcial)}
            onRemover={() => onPedirRemocao(i)}
          />
        ))}
      </div>

      {total < MAXIMO_SOCIOS && (
        <BotaoForm
          variante="secundario"
          icone="UserPlus"
          larguraCheia
          onClick={onAdicionar}
          className="min-h-[3.5rem] border-dashed bg-[#FBFCFD]"
        >
          Adicionar sócio {total + 1}
        </BotaoForm>
      )}
    </div>
  );
}
