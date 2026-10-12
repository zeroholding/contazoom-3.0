import { KeyRound, ShieldCheck, Smartphone, Timer } from "lucide-react";
import { Rotulo, Texto, Titulo, atraso } from "./comum";

/** 05 · Como começar — três passos e o que protege a conta. */

const PASSOS = [
  {
    titulo: "Crie sua conta",
    texto: "Nome, e-mail e senha. Leva um minuto.",
  },
  {
    titulo: "Conecte seus canais",
    texto:
      "Autorize o Mercado Livre, a Shopee e o TikTok Shop no site de cada um. Dá para conectar mais de uma conta por canal.",
  },
  {
    titulo: "Sincronize e veja a margem",
    texto:
      "Um clique traz as vendas. Informe o custo dos SKUs, ou suba uma planilha, e a margem aparece em cada pedido, inclusive nos antigos.",
  },
];

const GARANTIAS = [
  {
    Icone: KeyRound,
    titulo: "Sem senha de marketplace",
    texto: "A conexão é autorizada no próprio canal. Dá para reconectar ou remover a conta quando quiser.",
  },
  {
    Icone: ShieldCheck,
    titulo: "Cada um vê o que é seu",
    texto: "Vendas, custos e documentos ficam separados por usuário.",
  },
  {
    Icone: Timer,
    titulo: "Sessão que expira sozinha",
    texto: "Ficou parado, o painel pede para entrar de novo.",
  },
  {
    Icone: Smartphone,
    titulo: "No celular também",
    texto: "Menu inferior, vendas em cartões e filtros que cabem na palma da mão.",
  },
];

export default function ComoFunciona() {
  return (
    <section id="como-funciona" className="scroll-mt-16 py-24 sm:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div data-revelar="" className="max-w-[44rem]">
          <Rotulo numero="05" texto="Como começar" />
          <Titulo>Do cadastro à primeira margem em três passos.</Titulo>
          <Texto>Sem implantação, sem planilha para montar antes. Você conecta e o painel se preenche.</Texto>
        </div>

        <ol className="relative mt-14 grid gap-4 md:grid-cols-3 md:gap-5">
          {/* Fio que liga os três passos no desktop. */}
          <span
            aria-hidden="true"
            className="absolute left-[16%] right-[16%] top-[51px] hidden border-t-2 border-dashed border-[#FFD9BF] md:block"
          />
          {PASSOS.map((passo, i) => (
            <li
              key={passo.titulo}
              data-revelar=""
              style={atraso(i * 110)}
              className="relative rounded-[22px] border border-[#EDEFF3] bg-white p-6 sm:p-7"
            >
              <span className="czl-num relative grid size-12 place-items-center rounded-full border-2 border-[#F26212] bg-white text-[18px] font-extrabold text-[#F26212]">
                {i + 1}
              </span>
              <h3 className="mt-5 text-[19px] font-extrabold tracking-[-0.03em] text-[#14161B]">{passo.titulo}</h3>
              <p className="mt-2 text-[15px] leading-[1.65] text-[#6B7280]">{passo.texto}</p>
            </li>
          ))}
        </ol>

        <ul className="mt-6 grid gap-px overflow-hidden rounded-[22px] border border-[#EDEFF3] bg-[#EDEFF3] sm:grid-cols-2 lg:grid-cols-4">
          {GARANTIAS.map(({ Icone, titulo, texto }, i) => (
            <li key={titulo} data-revelar="" style={atraso(i * 70)} className="bg-[#F8F9FB] p-5 sm:p-6">
              <Icone className="h-5 w-5 text-[#F26212]" aria-hidden="true" />
              <h3 className="mt-3 text-[15px] font-bold tracking-[-0.02em] text-[#14161B]">{titulo}</h3>
              <p className="mt-1 text-[14px] leading-[1.6] text-[#6B7280]">{texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
