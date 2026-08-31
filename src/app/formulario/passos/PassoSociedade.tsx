"use client";

/**
 * Passo 3: capital de cada sócio e quem administra.
 *
 * Dois defeitos do formulário antigo morrem aqui:
 *
 *  - "Capital Social investido por cada sócio" era campo de texto. Voltava "uns
 *    10 mil cada". Ninguém sabia o capital total nem a participação de cada um,
 *    que é justamente o que vai no contrato social.
 *  - "Quem irá exercer a administração da sociedade?" era texto livre, e aceitava
 *    um nome que não era de nenhum sócio declarado, um apelido, ou "eu".
 */

import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  capitalTotal,
  chaveSocio,
  moedaDeCentavos,
  percentualDoSocio,
  type Erros,
  type FormularioAbertura,
  type Socio,
} from "@/lib/formulario-abertura";
import { Cartao, Nota, TituloSecao } from "../componentes/Base";
import { CampoMoeda, EscolhaCartao } from "../componentes/Campos";

export function PassoSociedade({
  dados,
  erros,
  onMudarSocio,
  onMudar,
}: {
  dados: FormularioAbertura;
  erros: Erros;
  onMudarSocio: (indice: number, parcial: Partial<Socio>) => void;
  onMudar: (parcial: Partial<FormularioAbertura>) => void;
}) {
  const total = capitalTotal(dados.socios);
  const umSocio = dados.socios.length === 1;
  const administradores = dados.socios.filter((s) => s.administrador);

  const nomeDo = (s: Socio, i: number) => s.nome.trim() || `Sócio ${i + 1}`;

  return (
    <div className="space-y-5">
      <TituloSecao
        nivel={2}
        icone="Handshake"
        titulo="A sociedade"
        descricao="Quanto cada um investe e quem assina pela empresa."
      />

      {/* ---------------------------- Capital ---------------------------------- */}
      <Cartao className="p-4 sm:p-6">
        <TituloSecao
          icone="Wallet"
          titulo="Capital social"
          descricao="Valor aproximado para iniciar a empresa: aporte em dinheiro, valor de maquinário, veículos ou outros ativos. Não precisa ser exato."
        />

        <div className="mt-5 space-y-5">
          {dados.socios.map((socio, i) => (
            <div
              key={i}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-start"
            >
              <div className="flex items-center gap-2.5 sm:pt-[2.4rem]">
                <span
                  aria-hidden="true"
                  className="cz-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#FFDCC4] bg-[#FFF4EC] text-[0.75rem] font-bold text-[#D9500A]"
                >
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold leading-5 text-[#101828]">
                  {nomeDo(socio, i)}
                </p>
                {/* Percentual DERIVADO, nunca perguntado. Recalcula a cada
                    dígito. Com um sócio só é 100%, e mostrar isso é ruído. */}
                {!umSocio && (
                  <span
                    className="cz-num shrink-0 rounded-full bg-[#FFF4EC] px-2.5 py-1 text-[0.8125rem] font-bold text-[#C2410C]"
                    aria-label={`Participação de ${nomeDo(socio, i)}`}
                  >
                    {percentualDoSocio(socio, total)}
                  </span>
                )}
              </div>

              <CampoMoeda
                rotulo="Valor investido"
                required
                centavos={socio.capitalCentavos}
                onMudar={(capitalCentavos) => onMudarSocio(i, { capitalCentavos })}
                erro={erros[chaveSocio(i, "capitalCentavos")] ?? null}
              />
            </div>
          ))}
        </div>

        {/* Total sempre visível enquanto a pessoa digita. Com um sócio, dizer
            "total: X" embaixo de "X" não informa nada. */}
        {!umSocio && (
          <div className="mt-6 flex items-baseline justify-between gap-4 rounded-[12px] bg-[#F7F8FA] px-4 py-3.5">
            <p className="text-[0.9375rem] font-semibold text-[#344054]">
              Capital social total
            </p>
            <p className="cz-num text-[1.375rem] font-bold tracking-[-0.02em] text-[#101828]">
              {moedaDeCentavos(total)}
            </p>
          </div>
        )}
      </Cartao>

      {/* -------------------------- Administração ------------------------------ */}
      <Cartao className="p-4 sm:p-6">
        <TituloSecao
          icone="ShieldCheck"
          titulo="Administração"
          descricao="Quem pode assinar pela empresa, abrir conta e representar a sociedade."
        />

        {umSocio ? (
          // Com um sócio a administração é dele. Perguntar seria pedir para
          // confirmar o óbvio, e a resposta já está no estado.
          <Nota tom="marca" className="mt-5">
            A administração fica com{" "}
            <strong className="font-bold">{nomeDo(dados.socios[0], 0)}</strong>,
            único sócio da empresa.
          </Nota>
        ) : (
          <div className="mt-5 space-y-5">
            <fieldset>
              <legend className="flex items-baseline gap-1.5 text-[0.9375rem] font-semibold leading-5 text-[#101828]">
                Quem vai administrar a sociedade?
                <span className="text-[#F04438]" aria-hidden="true">
                  *
                </span>
              </legend>
              <p className="mt-1 text-[0.8125rem] leading-5 text-[#667085]">
                Marque todos que vão assinar pela empresa. Pode ser mais de um.
              </p>

              {/* Seleção entre os sócios PREENCHIDOS. Impossível informar quem
                  não é sócio; e se a pessoa voltar e mudar um nome, a caixa
                  acompanha, porque o rótulo lê do mesmo estado. */}
              <div className="mt-3 space-y-3">
                {dados.socios.map((socio, i) => (
                  <label
                    key={i}
                    className={`cz-campo-foco flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3 transition-colors duration-150 ${
                      socio.administrador
                        ? "border-[#F26212] bg-[#FFF4EC] shadow-[inset_0_0_0_1px_#F26212]"
                        : "border-[#D8DDE5] bg-white hover:border-[#B4BCC9]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={socio.administrador}
                      onChange={(e) =>
                        onMudarSocio(i, { administrador: e.target.checked })
                      }
                      className="h-5 w-5 shrink-0 accent-[#F26212]"
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-[0.9375rem] font-semibold leading-5 ${
                        socio.administrador ? "text-[#C2410C]" : "text-[#101828]"
                      }`}
                    >
                      {nomeDo(socio, i)}
                    </span>
                    <span className="cz-num shrink-0 text-[0.8125rem] font-semibold text-[#98A2B3]">
                      {percentualDoSocio(socio, total)}
                    </span>
                  </label>
                ))}
              </div>

              {erros["administradores"] && (
                <p className="mt-2 flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-5 text-[#B42318]">
                  <Icone
                    nome="AlertTriangle"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{erros["administradores"]}</span>
                </p>
              )}
            </fieldset>

            {/* Pergunta que o Google Forms não fazia e o contrato social exige.
                Só aparece com dois ou mais administradores: com um, não há o que
                combinar. */}
            {administradores.length > 1 && (
              <div className="border-t border-[#E7EAEF] pt-5">
                <EscolhaCartao
                  rotulo="Como os administradores assinam?"
                  valor={
                    dados.assinaturaConjunta === null
                      ? ""
                      : dados.assinaturaConjunta
                      ? "CONJUNTA"
                      : "ISOLADA"
                  }
                  onMudar={(v) => onMudar({ assinaturaConjunta: v === "CONJUNTA" })}
                  erro={erros["assinaturaConjunta"] ?? null}
                  opcoes={[
                    {
                      valor: "ISOLADA",
                      texto: "Isoladamente",
                      descricao: "Qualquer um deles assina sozinho pela empresa.",
                    },
                    {
                      valor: "CONJUNTA",
                      texto: "Em conjunto",
                      descricao: "Todo ato precisa da assinatura de todos eles.",
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </Cartao>
    </div>
  );
}
