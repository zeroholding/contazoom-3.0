"use client";

/**
 * O bloco de UM sócio. É o coração da mudança em relação ao Google Forms.
 *
 * Lá tudo era pluralizado num campo só: "Nome(s) do(s) sócio(s)", "CPF do(s)
 * sócio(s)", "Profissão do(s) sócio(s)". A resposta voltava como blob de texto
 * ("João e Maria" / "111... e 222...") e alguém do escritório desembaralhava à
 * mão para descobrir qual CPF era de quem — errar o pareamento ali vira erro no
 * contrato social.
 *
 * Pior ainda: estado civil era chumbado em DOIS sócios ("Informe o SEU estado
 * civil" + "Se houver sócio, informe o estado civil DELE(A)"). Com três sócios o
 * formulário não tinha onde colocar o terceiro.
 *
 * Aqui o sócio é um registro repetido, e cada pessoa tem os campos dela.
 */

import { useState } from "react";
import {
  Entrada,
  EntradaDocumento,
  Escolha,
} from "@/app/components/views/ui/tarefas/Campos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  ESTADO_CIVIL,
  ESTADO_CIVIL_OPCOES,
  ENQUADRAMENTO_OPCOES,
  REGIME_BENS_OPCOES,
  chaveSocio,
  enderecoEmLinha,
  primeiroNome,
  type Erros,
  type Socio,
} from "@/lib/formulario-abertura";
import {
  Binaria,
  CampoEndereco,
  EnderecoEmLeitura,
} from "../componentes/Campos";

export function BlocoSocio({
  socio,
  indice,
  total,
  enderecoDoPrimeiro,
  erros,
  onMudar,
  onRemover,
}: {
  socio: Socio;
  indice: number;
  total: number;
  /** Endereço do sócio 1, para o atalho "mesmo endereço" a partir do sócio 2. */
  enderecoDoPrimeiro: Socio["endereco"];
  erros: Erros;
  onMudar: (parcial: Partial<Socio>) => void;
  onRemover?: () => void;
}) {
  /**
   * Blocos além do primeiro podem recolher.
   *
   * Com três sócios são mais de 40 campos numa rolagem só, e a pessoa perde onde
   * está. Recolher o que já preencheu deixa o bloco atual inteiro na tela. O
   * primeiro nasce aberto porque é onde ela vai começar de qualquer jeito.
   */
  const [aberto, setAberto] = useState(true);

  const k = (campo: string) => erros[chaveSocio(indice, campo)] ?? null;
  const nome = socio.nome.trim();

  // Qualquer erro dentro do bloco força ele a aparecer: recolhido com erro
  // dentro, a pessoa vê "corrija os campos" e não acha o campo.
  const temErro = Object.keys(erros).some((chave) =>
    chave.startsWith(`socios.${indice}.`)
  );
  const expandido = aberto || temErro;

  const copiaEndereco = indice > 0 && socio.mesmoEnderecoDoPrimeiro;

  return (
    <section
      id={`bloco-socio-${indice}`}
      className={`overflow-hidden rounded-[14px] border bg-white transition-colors ${
        temErro ? "border-[#FDA29B]" : "border-[#EDEFF3]"
      }`}
      style={{ boxShadow: "var(--cz-elev-1)" }}
    >
      {/* ------------------------------ Cabeçalho ------------------------------ */}
      <div
        className={`flex items-center gap-3 px-4 py-3.5 sm:px-5 ${
          expandido ? "border-b border-[#EDEFF3]" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="cz-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#FFD9BF] bg-[#FFF2E9] text-[0.8125rem] font-bold text-[#D9500A]"
        >
          {indice + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[#9AA1AC]">
            Sócio {indice + 1}
          </p>
          {/* O nome digitado vira o título do bloco. É a âncora que faz a pessoa
              ser referida pelo nome no capital, na administração, nos documentos
              e na revisão — em vez de "Sócio 2". */}
          <p className="truncate text-[0.9375rem] font-semibold leading-5 text-[#14161B]">
            {nome || "Sem nome ainda"}
          </p>
        </div>

        {total > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            {/* Recolher só faz sentido do segundo em diante: recolher o primeiro
                deixaria a tela sem nenhum campo visível. */}
            {indice > 0 && (
              <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                aria-expanded={expandido}
                aria-controls={`campos-socio-${indice}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold text-[#6B7280] transition-colors hover:bg-[#F4F5F7] hover:text-[#14161B]"
              >
                <Icone
                  nome={expandido ? "ChevronLeft" : "ChevronRight"}
                  className={`h-4 w-4 transition-transform ${
                    expandido ? "rotate-90" : ""
                  }`}
                />
                {expandido ? "Recolher" : "Abrir"}
              </button>
            )}
            {onRemover && (
              <button
                type="button"
                onClick={onRemover}
                aria-label={`Remover sócio ${indice + 1}${nome ? ` (${nome})` : ""}`}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#9AA1AC] transition-colors hover:bg-[#FEF2F2] hover:text-[#B42318]"
              >
                <Icone nome="Trash2" className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Renderização condicional, não `display:none`. Campo escondido por CSS
          continua no DOM, continua validando e recebe foco no Tab — a pessoa
          aperta Tab e o cursor desaparece num campo invisível. */}
      {expandido && (
        <div id={`campos-socio-${indice}`} className="space-y-6 p-4 sm:p-5">
          {/* --------------------------- Identificação -------------------------- */}
          <div className="space-y-4">
            <Entrada
              rotulo="Nome completo"
              required
              value={socio.nome}
              onChange={(e) => onMudar({ nome: e.target.value })}
              erro={k("nome")}
              ajuda="Como está no RG ou na CNH. É o nome que vai no contrato social."
              autoComplete="name"
              placeholder="Nome e sobrenome"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <EntradaDocumento
                tipo="cpf"
                rotulo="CPF"
                required
                value={socio.cpf}
                onChange={(cpf) => onMudar({ cpf })}
                erro={k("cpf")}
              />
              <EntradaDocumento
                tipo="telefone"
                rotulo="Telefone com DDD"
                required
                value={socio.telefone}
                onChange={(telefone) => onMudar({ telefone })}
                erro={k("telefone")}
                autoComplete="tel"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Entrada
                rotulo="E-mail"
                required
                type="email"
                inputMode="email"
                value={socio.email}
                onChange={(e) => onMudar({ email: e.target.value })}
                erro={k("email")}
                autoComplete="email"
                placeholder="nome@empresa.com.br"
              />
              <Entrada
                rotulo="Profissão"
                required
                value={socio.profissao}
                onChange={(e) => onMudar({ profissao: e.target.value })}
                erro={k("profissao")}
                autoComplete="off"
                placeholder="Comerciante, engenheiro, autônomo"
              />
            </div>
          </div>

          {/* ---------------------------- Estado civil -------------------------- */}
          <div className="space-y-4 border-t border-[#EDEFF3] pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Escolha
                rotulo="Estado civil"
                required
                vazio="Selecione"
                opcoes={ESTADO_CIVIL_OPCOES}
                value={socio.estadoCivil}
                onChange={(e) =>
                  onMudar({
                    estadoCivil: e.target.value as Socio["estadoCivil"],
                  })
                }
                erro={k("estadoCivil")}
              />

              {/* Regime de bens é PERGUNTA SEPARADA, e só existe para casado.
                  O Google Forms fundia as duas em oito opções ("Casado [Regime:
                  COMUNHÃO UNIVERSAL DE BENS]"), o que virava lista longa que a
                  pessoa lê rápido e erra. */}
              {socio.estadoCivil === ESTADO_CIVIL.CASADO && (
                <Escolha
                  rotulo="Regime de bens"
                  required
                  vazio="Selecione"
                  opcoes={REGIME_BENS_OPCOES}
                  value={socio.regimeBens}
                  onChange={(e) =>
                    onMudar({
                      regimeBens: e.target.value as Socio["regimeBens"],
                    })
                  }
                  erro={k("regimeBens")}
                  ajuda="Está no certidão de casamento ou no pacto antenupcial."
                />
              )}
            </div>

            <Binaria
              rotulo="Possui conta GOV.BR?"
              // Perguntado POR PESSOA. O formulário antigo perguntava uma vez
              // para o grupo ("Sócio(s) possui(em) Conta GOV?") — com dois sócios
              // e só um tendo, não havia resposta certa.
              ajuda="A conta GOV.BR nível prata ou ouro é usada para assinar o registro digital."
              valor={socio.contaGov}
              onMudar={(contaGov) => onMudar({ contaGov })}
              erro={k("contaGov")}
            />
          </div>

          {/* ------------------------- Endereço da pessoa ----------------------- */}
          <div className="space-y-4 border-t border-[#EDEFF3] pt-5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
                <Icone nome="House" className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h4 className="text-[0.875rem] font-semibold leading-5 text-[#14161B]">
                  Endereço residencial
                </h4>
                <p className="mt-0.5 text-xs leading-5 text-[#6B7280]">
                  Digite o CEP e o resto é preenchido automaticamente.
                </p>
              </div>
            </div>

            {/* Do sócio 2 em diante: cônjuge e familiar sócios da mesma empresa
                quase sempre moram juntos, e digitar o mesmo endereço duas vezes é
                onde aparece divergência de um dígito. */}
            {indice > 0 && (
              <label className="flex min-h-[2.75rem] cursor-pointer items-center gap-3 rounded-[10px] border border-[#DCE0E7] bg-[#F8F9FB] px-3.5 py-2.5 transition-colors hover:border-[#B9C0CB]">
                <input
                  type="checkbox"
                  checked={socio.mesmoEnderecoDoPrimeiro}
                  onChange={(e) =>
                    onMudar({ mesmoEnderecoDoPrimeiro: e.target.checked })
                  }
                  className="h-[1.125rem] w-[1.125rem] shrink-0 accent-[#F26212]"
                />
                <span className="text-[0.9375rem] font-medium leading-5 text-[#14161B]">
                  Mora no mesmo endereço do Sócio 1
                </span>
              </label>
            )}

            {copiaEndereco ? (
              <EnderecoEmLeitura
                titulo="Endereço copiado do Sócio 1"
                linha={enderecoEmLinha(enderecoDoPrimeiro)}
              />
            ) : (
              <CampoEndereco
                valor={socio.endereco}
                onMudar={(endereco) => onMudar({ endereco })}
                erros={erros}
                prefixo={`socios.${indice}.endereco`}
              />
            )}
          </div>

          {/* --------------------- Participação em outra empresa ---------------- */}
          <div className="space-y-4 border-t border-[#EDEFF3] pt-5">
            <Binaria
              rotulo={`${primeiroNome(socio.nome) || "Este sócio"} tem participação em outra empresa?`}
              // Perguntado POR SÓCIO. O Google Forms perguntava no genérico ("se
              // ALGUM dos sócios possuir participação societária em outra
              // empresa"), então com dois sócios em duas empresas diferentes
              // cabia um enquadramento só e nenhum CNPJ.
              ajuda="Sócio, titular ou MEI em qualquer outro CNPJ ativo."
              valor={socio.temParticipacaoOutraEmpresa}
              onMudar={(temParticipacaoOutraEmpresa) =>
                onMudar({ temParticipacaoOutraEmpresa })
              }
              erro={k("temParticipacaoOutraEmpresa")}
            />

            {socio.temParticipacaoOutraEmpresa === true && (
              <div className="grid gap-4 rounded-[12px] border border-[#FFD9BF] bg-[#FFF9F5] p-4 sm:grid-cols-2">
                <EntradaDocumento
                  tipo="cnpj"
                  rotulo="CNPJ da outra empresa"
                  required
                  value={socio.outraEmpresaCnpj}
                  onChange={(outraEmpresaCnpj) => onMudar({ outraEmpresaCnpj })}
                  erro={k("outraEmpresaCnpj")}
                />
                <Escolha
                  rotulo="Enquadramento tributário dela"
                  required
                  vazio="Selecione"
                  opcoes={ENQUADRAMENTO_OPCOES}
                  value={socio.outraEmpresaEnquadramento}
                  onChange={(e) =>
                    onMudar({
                      outraEmpresaEnquadramento: e.target
                        .value as Socio["outraEmpresaEnquadramento"],
                    })
                  }
                  erro={k("outraEmpresaEnquadramento")}
                />
                <p className="flex items-start gap-2 text-xs leading-5 text-[#B54708] sm:col-span-2">
                  <Icone
                    nome="Info"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  <span>
                    O contrato social dessa empresa vai ser pedido no passo de
                    documentos, no bloco de{" "}
                    <strong className="font-semibold">
                      {nome || `Sócio ${indice + 1}`}
                    </strong>
                    .
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
