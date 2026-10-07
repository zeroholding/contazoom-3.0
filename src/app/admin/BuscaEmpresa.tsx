"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** Única tela do admin que filtra empresa por texto. Ver `BuscaEmpresa`. */
export const ROTA_BUSCA = "/admin/tarefas/apuracao";

/**
 * Busca de empresa.
 *
 * Campo real, não decoração: ao enviar, navega para a lista de apuração com
 * `?busca=`, que é lido por `lerFiltros` daquela tela e filtra por razão social,
 * fantasia e CNPJ. O `placeholder` diz exatamente o que o campo faz, para
 * ninguém digitar "boleto" esperando busca global.
 *
 * Quem decide ONDE ela aparece é o `className`: no cabeçalho do desktop ela só
 * existe a partir de `lg`; no celular o cabeçalho é enxuto (56px, só hambúrguer e
 * título), então a MESMA busca mora no topo da gaveta de navegação. Um só
 * componente para os dois lugares evita que a regra ("some na própria rota de
 * apuração") e o destino do envio divirjam.
 *
 * Alvo de toque de 44px no celular: `.cz-admin input.cz-busca` crava a altura em
 * 2.5rem no CSS global (sem camada, vence qualquer utilitária), então o `!`
 * importante é o único jeito de crescer o campo sem tocar em `globals.css`.
 */
export default function BuscaEmpresa({
  className = "relative hidden w-80 shrink-0 lg:block",
  aoEnviar,
}: {
  className?: string;
  /** Chamado depois de navegar (a gaveta usa para se fechar). */
  aoEnviar?: () => void;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState("");

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const limpo = termo.trim();
    if (!limpo) return;
    router.push(`${ROTA_BUSCA}?busca=${encodeURIComponent(limpo)}`);
    aoEnviar?.();
  };

  return (
    <form role="search" onSubmit={enviar} className={className}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cz-texto-fraco)]"
      />
      <input
        type="search"
        className="cz-busca max-md:h-11!"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        placeholder="Buscar empresa por nome ou CNPJ"
        aria-label="Buscar empresa por nome ou CNPJ na apuração fiscal"
        enterKeyHint="search"
      />
    </form>
  );
}
