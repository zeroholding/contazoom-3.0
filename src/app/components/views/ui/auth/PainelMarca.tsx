"use client";

/**
 * Painel da marca das telas de entrada e cadastro.
 *
 * Vive num arquivo só porque as duas telas já divergiram uma vez: o login tinha
 * um retângulo com degradê laranja para amarelo e o cadastro tinha três bolhas
 * de gradiente girando com GSAP. Duas linguagens visuais na mesma porta de
 * entrada, e ninguém percebe porque nunca se vê as duas juntas.
 *
 * É LARANJA, não preto. A referência aprovada assenta o painel claro sobre
 * laranja, e é a leitura certa da paleta — laranja e branco, sem terceira cor. O
 * degradê fica dentro da família (`#F26212` a `#C74A08`): sair para amarelo, como
 * era antes, inventa uma cor que a marca não tem.
 *
 * O que ele diz é o que o sistema realmente faz. Frase genérica de gestão em
 * painel de login é ruído: quem chega aqui já é cliente e quer entrar, e quem
 * chega por engano precisa saber em um segundo se é o lugar certo.
 */

import {
  Calculator,
  FolderOpen,
  Lock,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

const CAPACIDADES = [
  {
    icone: ShoppingBag,
    titulo: "Vendas de Mercado Livre e Shopee",
    texto: "Pedidos, frete e comissão de cada canal em um só lugar.",
  },
  {
    icone: TrendingUp,
    titulo: "Financeiro com DRE",
    texto: "Margem por produto, contas a pagar e a receber, resultado do mês.",
  },
  {
    icone: Calculator,
    titulo: "Apuração fiscal acompanhada",
    texto: "Etapa por etapa da competência, com prazo e responsável.",
  },
  {
    icone: FolderOpen,
    titulo: "Documentos por competência",
    texto: "Guias e relatórios organizados, sempre no mesmo lugar.",
  },
];

export default function PainelMarca({
  titulo = "A operação e a contabilidade do seu negócio, no mesmo painel.",
}: {
  /** Chamada do painel. O padrão serve às duas telas. */
  titulo?: string;
}) {
  return (
    <div className="cz-auth-marca cz-auth-malha relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between">
      {/* Lockup em branco, não a imagem do logo: o arquivo do logo é feito para
          fundo claro e sobre laranja o resultado é imprevisível. */}
      <div className="relative flex items-center gap-2.5 px-12 pt-12">
        <span
          aria-hidden="true"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white/15 ring-1 ring-inset ring-white/25"
        >
          <Lock className="h-[17px] w-[17px] text-white" />
        </span>
        <span className="text-[17px] font-bold tracking-[-0.02em] text-white">
          ContaZoom
        </span>
      </div>

      <div className="relative px-12 py-10">
        <h2 className="max-w-md text-[2rem] font-extrabold leading-[1.14] tracking-[-0.035em] text-white">
          {titulo}
        </h2>

        <ul className="mt-10 space-y-5">
          {CAPACIDADES.map((item) => {
            const Icone = item.icone;
            return (
              <li key={item.titulo} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/15 ring-1 ring-inset ring-white/20"
                >
                  <Icone className="h-[18px] w-[18px] text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold leading-snug tracking-[-0.015em] text-white">
                    {item.titulo}
                  </p>
                  {/* Branco a 75%: texto secundário sobre laranja precisa recuar
                      sem virar cinza, que sujaria a cor de baixo. */}
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/75">
                    {item.texto}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative border-t border-white/20 px-12 py-6">
        <p className="flex items-center gap-2 text-[12px] text-white/70">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Conexão protegida. Sua sessão expira automaticamente por inatividade.
        </p>
      </div>
    </div>
  );
}
