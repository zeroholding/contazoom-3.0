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
import { CampoMoeda, EscolhaCartao } from "../componentes/Campos";
import { CabecalhoPasso } from "./PassoSocios";

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
    <div className="space-y-6">
      <CabecalhoPasso
        icone="Handshake"
        titulo="A sociedade"
        descricao="Quanto cada um investe e quem assina pela empresa."
      />

      {/* ---------------------------- Capital ---------------------------------- */}
      <section className="rounded-[14px] border border-[#EDEFF3] bg-white p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
            <Icone nome="Wallet" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-semibold leading-5 text-[#14161B]">
              Capital social
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">
              Valor aproximado para iniciar a empresa: aporte em dinheiro, valor
              de maquinário, veículos ou outros ativos. Não precisa ser exato.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {dados.socios.map((socio, i) => (
            <div
              key={i}
              className="grid gap-3 sm:grid-cols-[1fr_11rem_4.5rem] sm:items-end"
            >
              <p className="truncate text-[0.9375rem] font-semibold leading-5 text-[#14161B] sm:pb-2.5">
                {nomeDo(socio, i)}
              </p>

              <CampoMoeda
                rotulo="Valor investido"
                required
                centavos={socio.capitalCentavos}
                onMudar={(capitalCentavos) => onMudarSocio(i, { capitalCentavos })}
                erro={erros[chaveSocio(i, "capitalCentavos")] ?? null}
              />

              {/* Percentual DERIVADO, nunca perguntado. Recalcula a cada dígito.
                  Com um sócio só, é 100% e mostrar isso é ruído. */}
              {!umSocio && (
                <p
                  className="cz-num text-[0.9375rem] font-bold text-[#D9500A] sm:pb-2.5 sm:text-right"
                  aria-label={`Participação de ${nomeDo(socio, i)}`}
                >
                  {percentualDoSocio(socio, total)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Total sempre visível enquanto a pessoa digita. Com um sócio, dizer
            "total: X" embaixo de "X" não informa nada. */}
        {!umSocio && (
          <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-[#EDEFF3] pt-4">
            <p className="text-[0.9375rem] font-semibold text-[#14161B]">
              Capital social total
            </p>
            <p className="cz-num text-xl font-bold tracking-[-0.02em] text-[#14161B]">
              {moedaDeCentavos(total)}
            </p>
          </div>
        )}
      </section>

      {/* -------------------------- Administração ------------------------------ */}
      <section className="rounded-[14px] border border-[#EDEFF3] bg-white p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
            <Icone nome="ShieldCheck" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-semibold leading-5 text-[#14161B]">
              Administração
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">
              Quem pode assinar pela empresa, abrir conta e representar a
              sociedade.
            </p>
          </div>
        </div>

        {umSocio ? (
          // Com um sócio a administração é dele. Perguntar seria pedir para
          // confirmar o óbvio, e a resposta já está no estado.
          <p className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-[#FFD9BF] bg-[#FFF2E9] px-3.5 py-3 text-[0.875rem] font-medium leading-6 text-[#B54708]">
            <Icone nome="Info" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              A administração fica com{" "}
              <strong className="font-semibold">
                {nomeDo(dados.socios[0], 0)}
              </strong>
              , único sócio da empresa.
            </span>
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="mb-[0.4375rem] flex items-baseline gap-1 text-sm font-semibold leading-5 text-[#1F2430]">
                Quem vai administrar a sociedade?
                <span className="text-[#D92D20]" aria-hidden="true">
                  *
                </span>
              </legend>
              <p className="mb-2.5 text-xs leading-5 text-[#6B7280]">
                Marque todos que vão assinar pela empresa. Pode ser mais de um.
              </p>

              {/* Seleção entre os sócios PREENCHIDOS. Impossível informar quem
                  não é sócio; e se a pessoa voltar e mudar o nome de alguém, a
                  caixa acompanha, porque o rótulo lê do mesmo estado. */}
              <div className="space-y-2.5">
                {dados.socios.map((socio, i) => (
                  <label
                    key={i}
                    className={`flex min-h-[3rem] cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 transition-colors ${
                      socio.administrador
                        ? "border-[#F26212] bg-[#FFF2E9]"
                        : "border-[#DCE0E7] bg-white hover:border-[#B9C0CB]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={socio.administrador}
                      onChange={(e) =>
                        onMudarSocio(i, { administrador: e.target.checked })
                      }
                      className="h-[1.125rem] w-[1.125rem] shrink-0 accent-[#F26212]"
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-[0.9375rem] font-semibold leading-5 ${
                        socio.administrador ? "text-[#C2410C]" : "text-[#14161B]"
                      }`}
                    >
                      {nomeDo(socio, i)}
                    </span>
                    <span className="cz-num shrink-0 text-xs font-semibold text-[#9AA1AC]">
                      {percentualDoSocio(socio, total)}
                    </span>
                  </label>
                ))}
              </div>

              {erros["administradores"] && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]">
                  <Icone
                    nome="AlertTriangle"
                    className="mt-px h-3.5 w-3.5 shrink-0"
                  />
                  <span>{erros["administradores"]}</span>
                </p>
              )}
            </fieldset>

            {/* Pergunta que o Google Forms não fazia e o contrato social exige.
                Só aparece com dois ou mais administradores: com um, não há o que
                combinar. */}
            {administradores.length > 1 && (
              <div className="border-t border-[#EDEFF3] pt-4">
                <EscolhaCartao
                  rotulo="Como os administradores assinam?"
                  valor={
                    dados.assinaturaConjunta === null
                      ? ""
                      : dados.assinaturaConjunta
                      ? "CONJUNTA"
                      : "ISOLADA"
                  }
                  onMudar={(v) =>
                    onMudar({ assinaturaConjunta: v === "CONJUNTA" })
                  }
                  erro={erros["assinaturaConjunta"] ?? null}
                  opcoes={[
                    {
                      valor: "ISOLADA",
                      texto: "Isoladamente",
                      descricao:
                        "Qualquer um deles assina sozinho pela empresa.",
                    },
                    {
                      valor: "CONJUNTA",
                      texto: "Em conjunto",
                      descricao:
                        "Todo ato precisa da assinatura de todos eles.",
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
