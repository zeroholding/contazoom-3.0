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
 * Pior ainda: o estado civil era chumbado em DOIS sócios ("Informe o SEU estado
 * civil" + "Se houver sócio, informe o estado civil DELE(A)"). Com três sócios o
 * formulário não tinha onde colocar o terceiro.
 *
 * Cada campo carrega um ícone à esquerda. Não é enfeite: no teste da primeira
 * versão a reclamação foi literal — "nem dá para saber que é para preencher
 * e-mail". Envelope no e-mail, telefone no telefone e documento no CPF resolvem
 * isso antes de a pessoa ler o rótulo.
 */

import { useState } from "react";
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
  CampoDocumento,
  CampoSelect,
  CampoTexto,
  Nota,
  TituloSecao,
} from "../componentes/Base";
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
   * Com três sócios são mais de 40 campos numa rolagem só e a pessoa perde onde
   * está. Recolher o que já preencheu deixa o bloco atual inteiro na tela. O
   * primeiro nasce aberto porque é onde ela vai começar de qualquer jeito.
   */
  const [aberto, setAberto] = useState(true);

  const k = (campo: string) => erros[chaveSocio(indice, campo)] ?? null;
  const nome = socio.nome.trim();

  // Qualquer erro dentro do bloco força ele a aparecer: recolhido com erro
  // dentro, a pessoa lê "corrija os campos" e não acha o campo.
  const temErro = Object.keys(erros).some((chave) =>
    chave.startsWith(`socios.${indice}.`)
  );
  const expandido = aberto || temErro;

  const copiaEndereco = indice > 0 && socio.mesmoEnderecoDoPrimeiro;

  /** Preenchidos / total dos campos principais, para o selo do cabeçalho. */
  const prontos = [
    socio.nome,
    socio.cpf,
    socio.telefone,
    socio.email,
    socio.profissao,
    socio.estadoCivil,
  ].filter((v) => String(v).trim()).length;

  return (
    <section
      id={`bloco-socio-${indice}`}
      className={`overflow-hidden rounded-[16px] border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors ${
        temErro ? "border-[#FDA29B]" : "border-[#E7EAEF]"
      }`}
    >
      {/* ------------------------------ Cabeçalho ------------------------------ */}
      <div
        className={`flex items-center gap-3 px-4 py-4 sm:px-5 ${
          expandido ? "border-b border-[#E7EAEF]" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="cz-num flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFDCC4] bg-[#FFF4EC] text-[0.9375rem] font-bold text-[#D9500A]"
        >
          {indice + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.04em] text-[#98A2B3]">
            Sócio {indice + 1}
          </p>
          {/* O nome digitado vira o título do bloco. É a âncora que faz a pessoa
              ser referida pelo NOME no capital, na administração, nos documentos
              e na revisão — em vez de "Sócio 2". */}
          <p
            className={`truncate text-[1.0625rem] font-bold leading-6 tracking-[-0.015em] ${
              nome ? "text-[#101828]" : "text-[#A6ADBA]"
            }`}
          >
            {nome || "Preencha o nome"}
          </p>
        </div>

        {!expandido && (
          <span className="cz-num hidden shrink-0 rounded-full bg-[#F2F4F7] px-2.5 py-1 text-[0.75rem] font-bold text-[#475467] sm:inline">
            {prontos}/6
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1">
          {/* Recolher só do segundo em diante: recolher o primeiro deixaria a
              tela sem nenhum campo visível. */}
          {indice > 0 && (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-expanded={expandido}
              aria-controls={`campos-socio-${indice}`}
              className="cz-campo-foco inline-flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[0.8125rem] font-semibold text-[#667085] transition-colors hover:bg-[#F2F4F7] hover:text-[#101828]"
            >
              <Icone
                nome="ChevronRight"
                className={`h-4 w-4 transition-transform duration-150 ${
                  expandido ? "rotate-90" : ""
                }`}
              />
              <span className="hidden sm:inline">
                {expandido ? "Recolher" : "Abrir"}
              </span>
            </button>
          )}
          {onRemover && total > 1 && (
            <button
              type="button"
              onClick={onRemover}
              aria-label={`Remover sócio ${indice + 1}${nome ? ` (${nome})` : ""}`}
              className="cz-campo-foco flex h-10 w-10 items-center justify-center rounded-[10px] text-[#98A2B3] transition-colors hover:bg-[#FEF3F2] hover:text-[#B42318]"
            >
              <Icone nome="Trash2" className="h-[1.125rem] w-[1.125rem]" />
            </button>
          )}
        </div>
      </div>

      {/* Renderização condicional, não `display:none`. Campo escondido por CSS
          continua no DOM, continua validando e recebe foco no Tab — a pessoa
          aperta Tab e o cursor desaparece num campo invisível. */}
      {expandido && (
        <div id={`campos-socio-${indice}`} className="space-y-7 p-4 sm:p-6">
          {/* --------------------------- Identificação -------------------------- */}
          <div className="space-y-5">
            <CampoTexto
              rotulo="Nome completo"
              icone="User"
              required
              value={socio.nome}
              onChange={(e) => onMudar({ nome: e.target.value })}
              erro={k("nome")}
              ajuda="Como está no RG ou na CNH. É o nome que vai no contrato social."
              autoComplete="name"
              placeholder="Ex.: Maria Aparecida Silva"
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <CampoDocumento
                tipo="cpf"
                rotulo="CPF"
                icone="IdCard"
                required
                value={socio.cpf}
                onChange={(cpf) => onMudar({ cpf })}
                erro={k("cpf")}
              />
              <CampoDocumento
                tipo="telefone"
                rotulo="Telefone com DDD"
                icone="Phone"
                required
                value={socio.telefone}
                onChange={(telefone) => onMudar({ telefone })}
                erro={k("telefone")}
                autoComplete="tel"
                ajuda="Celular com WhatsApp, de preferência."
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <CampoTexto
                rotulo="E-mail"
                icone="Mail"
                required
                type="email"
                inputMode="email"
                value={socio.email}
                onChange={(e) => onMudar({ email: e.target.value })}
                erro={k("email")}
                autoComplete="email"
                placeholder="nome@email.com.br"
                ajuda="Onde o escritório envia os documentos oficiais."
              />
              <CampoTexto
                rotulo="Profissão"
                icone="Briefcase"
                required
                value={socio.profissao}
                onChange={(e) => onMudar({ profissao: e.target.value })}
                erro={k("profissao")}
                autoComplete="off"
                placeholder="Ex.: comerciante, engenheiro, autônomo"
              />
            </div>
          </div>

          {/* ---------------------------- Estado civil -------------------------- */}
          <div className="space-y-5 border-t border-[#E7EAEF] pt-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <CampoSelect
                rotulo="Estado civil"
                icone="Users"
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

              {/* Regime de bens é PERGUNTA SEPARADA, e só existe para casado. O
                  Google Forms fundia as duas em oito opções ("Casado [Regime:
                  COMUNHÃO UNIVERSAL DE BENS]"), o que virava lista longa que a
                  pessoa lê rápido e erra. */}
              {socio.estadoCivil === ESTADO_CIVIL.CASADO && (
                <CampoSelect
                  rotulo="Regime de bens"
                  icone="Handshake"
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
                  ajuda="Está na certidão de casamento ou no pacto antenupcial."
                />
              )}
            </div>

            <Binaria
              rotulo="Possui conta GOV.BR?"
              // Perguntado POR PESSOA. O formulário antigo perguntava uma vez para
              // o grupo ("Sócio(s) possui(em) Conta GOV?") — com dois sócios e só
              // um tendo, não havia resposta certa.
              ajuda="A conta nível prata ou ouro é usada para assinar o registro digital na Junta."
              valor={socio.contaGov}
              onMudar={(contaGov) => onMudar({ contaGov })}
              erro={k("contaGov")}
            />
          </div>

          {/* ------------------------- Endereço da pessoa ----------------------- */}
          <div className="space-y-5 border-t border-[#E7EAEF] pt-6">
            <TituloSecao
              nivel={4}
              icone="House"
              titulo="Endereço residencial"
              descricao="Digite o CEP e o resto é preenchido automaticamente."
            />

            {/* Do sócio 2 em diante: cônjuge e familiar sócios da mesma empresa
                quase sempre moram juntos, e digitar o mesmo endereço duas vezes é
                onde aparece divergência de um dígito. */}
            {indice > 0 && (
              // `cz-caixa` e não `flex`: o `label {}` global de `globals.css`
              // está fora de `@layer` e crava `display: block`, que vence a
              // utilitária do Tailwind. Era isso que colava a caixa no texto.
              <label
                className={`cz-caixa cz-campo-foco min-h-[3.25rem] rounded-[12px] border px-4 py-3 transition-colors ${
                  socio.mesmoEnderecoDoPrimeiro
                    ? "border-[#F26212] bg-[#FFF4EC]"
                    : "border-[#D8DDE5] bg-[#F7F8FA] hover:border-[#B4BCC9]"
                }`}
              >
                <input
                  type="checkbox"
                  className="cz-marca"
                  checked={socio.mesmoEnderecoDoPrimeiro}
                  onChange={(e) =>
                    onMudar({ mesmoEnderecoDoPrimeiro: e.target.checked })
                  }
                />
                <span
                  className={`text-[0.9375rem] font-semibold leading-5 ${
                    socio.mesmoEnderecoDoPrimeiro
                      ? "text-[#C2410C]"
                      : "text-[#101828]"
                  }`}
                >
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
          <div className="space-y-5 border-t border-[#E7EAEF] pt-6">
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
              <div className="space-y-5 rounded-[14px] border border-[#FFDCC4] bg-[#FFFBF7] p-4 sm:p-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <CampoDocumento
                    tipo="cnpj"
                    rotulo="CNPJ da outra empresa"
                    icone="Building2"
                    required
                    value={socio.outraEmpresaCnpj}
                    onChange={(outraEmpresaCnpj) => onMudar({ outraEmpresaCnpj })}
                    erro={k("outraEmpresaCnpj")}
                  />
                  <CampoSelect
                    rotulo="Enquadramento dela"
                    icone="Landmark"
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
                </div>
                <Nota tom="marca">
                  O contrato social dessa empresa vai ser pedido no passo de
                  documentos, no bloco de{" "}
                  <strong className="font-bold">
                    {nome || `Sócio ${indice + 1}`}
                  </strong>
                  .
                </Nota>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
