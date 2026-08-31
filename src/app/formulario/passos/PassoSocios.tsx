"use client";

/**
 * Passo 1: quantos sócios, e o bloco completo de cada um.
 *
 * A quantidade vem primeiro porque nada mais pode ser perguntado antes de saber
 * quem são as pessoas: capital, administração e documentos todos dependem disso.
 */

import Icone from "@/app/components/views/ui/tarefas/Icone";
import { Botao } from "@/app/components/views/ui/tarefas/Campos";
import {
  MAXIMO_SOCIOS,
  type Erros,
  type FormularioAbertura,
  type Socio,
} from "@/lib/formulario-abertura";
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
      <CabecalhoPasso
        icone="Users"
        titulo="Quem são os sócios"
        descricao="Comece pela quantidade. Cada pessoa tem os dados dela, sem misturar."
      />

      {/* --------------------------- Quantidade -------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#EDEFF3] bg-white px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold leading-5 text-[#14161B]">
            Quantidade de sócios
          </p>
          <p className="mt-0.5 text-xs leading-5 text-[#6B7280]">
            {total === 1
              ? "Empresa com um único sócio."
              : `${total} pessoas na sociedade.`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Botao
            variante="secundario"
            icone="Trash2"
            aria-label="Remover o último sócio"
            disabled={total <= 1}
            onClick={() => onPedirRemocao(total - 1)}
          >
            Remover
          </Botao>
          <span
            className="cz-num min-w-[2.5rem] text-center text-xl font-bold text-[#14161B]"
            aria-live="polite"
          >
            {total}
          </span>
          <Botao
            variante="primario"
            icone="UserPlus"
            disabled={total >= MAXIMO_SOCIOS}
            onClick={onAdicionar}
          >
            Adicionar sócio
          </Botao>
        </div>
      </div>

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
            onRemover={total > 1 ? () => onPedirRemocao(i) : undefined}
          />
        ))}
      </div>

      {total < MAXIMO_SOCIOS && (
        <button
          type="button"
          onClick={onAdicionar}
          className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#C6CCD6] bg-[#F8F9FB] px-4 text-[0.9375rem] font-semibold text-[#4B5563] transition-colors hover:border-[#F26212] hover:bg-[#FFF2E9] hover:text-[#C2410C]"
        >
          <Icone nome="UserPlus" className="h-[1.125rem] w-[1.125rem]" />
          Adicionar sócio {total + 1}
        </button>
      )}
    </div>
  );
}

/** Cabeçalho de passo. Repetido nos cinco, então mora aqui e é exportado. */
export function CabecalhoPasso({
  icone,
  titulo,
  descricao,
}: {
  icone: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
        <Icone nome={icone} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        {/* `h2` porque o `h1` é o título da página. Pular nível quebra a
            navegação por cabeçalho do leitor de tela. */}
        <h2 className="text-lg font-bold leading-6 tracking-[-0.02em] text-[#14161B]">
          {titulo}
        </h2>
        <p className="mt-1 max-w-2xl text-[0.875rem] leading-6 text-[#6B7280]">
          {descricao}
        </p>
      </div>
    </div>
  );
}
