"use client";

/**
 * Leitura de um formulário JÁ ENVIADO, a partir do payload gravado.
 *
 * Usada em dois lugares diferentes, e é por isso que existe separada:
 *
 *  - `/formulario/recibo/<token>` — o cliente conferindo o que mandou;
 *  - `/admin/formulario/<id>` — o escritório lendo o que recebeu.
 *
 * As duas telas mostram o MESMO conteúdo, e duplicar isso em dois componentes
 * garantiria que um dia um mostrasse um campo que o outro não. O que muda entre
 * elas é a moldura e o que fica FORA daqui: o admin acrescenta download de
 * documento, situação e observação interna; o recibo não.
 *
 * Lê o payload de `payloadDeEnvio`, e não a árvore de estado do formulário: o que
 * foi gravado é a fonte da verdade, inclusive para um envio antigo feito quando a
 * tela tinha outras perguntas.
 */

import type { ReactNode } from "react";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  formatarCep,
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
} from "@/lib/documento";
import {
  ENQUADRAMENTO_LABEL,
  ESTADO_CIVIL_LABEL,
  REGIME_BENS_LABEL,
  moedaDeCentavos,
  type payloadDeEnvio,
} from "@/lib/formulario-abertura";
import { Cartao, TituloSecao } from "./Base";

/** O que a rota devolve em `dados`: exatamente o retorno de `payloadDeEnvio`. */
export type DadosEnviados = ReturnType<typeof payloadDeEnvio>;

export type DocumentoResumo = {
  slot: string;
  dono: string;
  rotulo: string;
  nomeOriginal: string;
  tamanhoBytes: number;
  /** Só o admin recebe. Sem isso, a lista mostra o nome e não oferece o arquivo. */
  url?: string;
  tamanhoLegivel?: string;
  icone?: string;
};

export function Resumo({
  dados,
  documentos,
  /** Renderizado no lugar da lista simples de documentos, quando há download. */
  blocoDocumentos,
}: {
  dados: DadosEnviados;
  documentos: DocumentoResumo[];
  blocoDocumentos?: ReactNode;
}) {
  const umSocio = dados.socios.length === 1;
  const administradores = dados.socios.filter((s) => s.administrador);

  /**
   * Documentos agrupados por DONO, e não por slot.
   *
   * O nome do dono foi congelado em cada linha justamente para isto: agrupar pelo
   * índice do slot daria o grupo errado se a ordem dos sócios no JSON mudasse.
   */
  const porDono = new Map<string, DocumentoResumo[]>();
  documentos.forEach((d) => {
    const lista = porDono.get(d.dono) ?? [];
    lista.push(d);
    porDono.set(d.dono, lista);
  });

  return (
    <div className="space-y-5">
      {/* ------------------------------- Sócios ------------------------------- */}
      <Cartao className="p-5 sm:p-6">
        <TituloSecao
          icone="Users"
          titulo={umSocio ? "Sócio" : `Sócios (${dados.socios.length})`}
        />

        <div className="mt-5 divide-y divide-[#E7EAEF]">
          {dados.socios.map((socio, i) => (
            <div key={i} className="space-y-4 py-5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="cz-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#FFDCC4] bg-[#FFF4EC] text-[0.75rem] font-bold text-[#D9500A]"
                >
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-[1rem] font-bold text-[#101828]">
                  {socio.nome || `Sócio ${i + 1}`}
                </p>
                {socio.administrador && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF4EC] px-2.5 py-1 text-[0.75rem] font-bold text-[#C2410C]">
                    <Icone nome="ShieldCheck" className="h-3.5 w-3.5" />
                    Administrador
                  </span>
                )}
              </div>

              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Dado rotulo="CPF" numerico>
                  {formatarCpf(socio.cpf) || "—"}
                </Dado>
                <Dado rotulo="Telefone" numerico>
                  {formatarTelefone(socio.telefone) || "—"}
                </Dado>
                <Dado rotulo="E-mail">{socio.email || "—"}</Dado>
                <Dado rotulo="Profissão">{socio.profissao || "—"}</Dado>
                <Dado rotulo="Estado civil">
                  {/* Regime junto do estado civil, porque é assim que a informação
                      é usada no contrato. Separado na PERGUNTA, junto na LEITURA. */}
                  {socio.estadoCivil
                    ? socio.regimeBens
                      ? `${ESTADO_CIVIL_LABEL[socio.estadoCivil]} — ${REGIME_BENS_LABEL[socio.regimeBens]}`
                      : ESTADO_CIVIL_LABEL[socio.estadoCivil]
                    : "—"}
                </Dado>
                <Dado rotulo="Conta GOV.BR">
                  {socio.contaGov === null ? "—" : socio.contaGov ? "Sim" : "Não"}
                </Dado>
                <Dado rotulo="Capital" numerico>
                  {moedaDeCentavos(socio.capitalCentavos)}
                  {!umSocio && (
                    <span className="ml-2 font-bold text-[#D9500A]">
                      {socio.participacao}
                    </span>
                  )}
                </Dado>
                <Dado rotulo="Endereço" largo>
                  {enderecoLinha(socio.endereco)}
                </Dado>
                {socio.temParticipacaoOutraEmpresa === true && (
                  <Dado rotulo="Participação em outra empresa" largo>
                    {formatarCnpj(socio.outraEmpresaCnpj) || "—"}
                    {socio.outraEmpresaEnquadramento
                      ? ` · ${ENQUADRAMENTO_LABEL[socio.outraEmpresaEnquadramento]}`
                      : ""}
                  </Dado>
                )}
              </dl>
            </div>
          ))}
        </div>
      </Cartao>

      {/* ------------------------------ Empresa ------------------------------- */}
      <Cartao className="p-5 sm:p-6">
        <TituloSecao icone="Building2" titulo="A empresa" />
        <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Dado rotulo="Opções de razão social" largo>
            <ol className="space-y-1">
              {dados.razaoSocialOpcoes.map((nome, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="cz-num text-[0.75rem] font-bold text-[#98A2B3]">
                    {i + 1}
                  </span>
                  <span>{nome || "—"}</span>
                </li>
              ))}
            </ol>
          </Dado>
          <Dado rotulo="Nome fantasia">{dados.nomeFantasia || "—"}</Dado>
          <Dado rotulo="IPTU do endereço">
            {dados.temIptu === null ? "—" : dados.temIptu ? "Tem" : "Não tem"}
          </Dado>
          <Dado rotulo="Endereço da empresa" largo>
            {enderecoLinha(dados.enderecoEmpresa)}
            {dados.enderecoEmpresaEhDeSocio && (
              <span className="mt-1 block text-[0.8125rem] font-normal text-[#667085]">
                É o endereço residencial de um dos sócios
              </span>
            )}
          </Dado>
          <Dado rotulo="Atividades declaradas" largo>
            <span className="font-normal leading-[1.6]">
              {dados.atividades || "—"}
            </span>
          </Dado>
        </dl>
      </Cartao>

      {/* ----------------------------- Sociedade ------------------------------ */}
      <Cartao className="p-5 sm:p-6">
        <TituloSecao icone="Handshake" titulo="A sociedade" />

        <div className="mt-5 flex items-baseline justify-between gap-4 rounded-[12px] bg-[#F7F8FA] px-4 py-3.5">
          <p className="text-[0.9375rem] font-semibold text-[#344054]">
            Capital social total
          </p>
          <p className="cz-num text-[1.375rem] font-bold tracking-[-0.02em] text-[#101828]">
            {moedaDeCentavos(dados.capitalTotalCentavos)}
          </p>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Dado rotulo="Administração">
            {administradores.length
              ? administradores.map((s) => s.nome || "Sócio sem nome").join(", ")
              : "—"}
          </Dado>
          {administradores.length > 1 && (
            <Dado rotulo="Forma de assinatura">
              {dados.assinaturaConjunta === null
                ? "—"
                : dados.assinaturaConjunta
                ? "Em conjunto"
                : "Isoladamente"}
            </Dado>
          )}
        </dl>
      </Cartao>

      {/* ---------------------------- Documentos ------------------------------ */}
      <Cartao className="p-5 sm:p-6">
        <TituloSecao
          icone="Paperclip"
          titulo={`Documentos (${documentos.length})`}
          descricao="Cada arquivo está identificado com a pessoa que o entregou."
        />

        {blocoDocumentos ?? (
          <div className="mt-5 space-y-5">
            {documentos.length === 0 ? (
              <p className="text-[0.9375rem] text-[#667085]">
                Nenhum documento anexado.
              </p>
            ) : (
              [...porDono.entries()].map(([dono, lista]) => (
                <div key={dono}>
                  <p className="text-[0.8125rem] font-bold text-[#667085]">
                    {dono}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {lista.map((d) => (
                      <li
                        key={d.slot + d.nomeOriginal}
                        className="flex items-start gap-2 text-[0.9375rem] leading-6"
                      >
                        <Icone
                          nome="CheckCircle2"
                          className="mt-1 h-4 w-4 shrink-0 text-[#D9500A]"
                        />
                        <span className="min-w-0 text-[#344054]">
                          <span className="font-semibold text-[#101828]">
                            {d.rotulo}
                          </span>
                          {" · "}
                          <span className="break-all">{d.nomeOriginal}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
      </Cartao>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Apoio                                     */
/* -------------------------------------------------------------------------- */

/**
 * Endereço em uma linha, a partir do que foi GRAVADO.
 *
 * Não reaproveita `enderecoEmLinha` de `formulario-abertura.ts` porque o payload
 * guarda o CEP só com dígitos, e ali a função espera o valor mascarado da tela.
 * Formatar aqui é mais honesto que mascarar de novo antes de chamar.
 */
function enderecoLinha(e: DadosEnviados["enderecoEmpresa"]): string {
  if (!e?.logradouro && !e?.cep) return "—";
  const inicio = [e.logradouro, e.numero].filter(Boolean).join(", ");
  return [
    e.complemento?.trim() ? `${inicio} — ${e.complemento.trim()}` : inicio,
    e.bairro,
    [e.cidade, e.uf].filter(Boolean).join("/"),
    formatarCep(e.cep),
  ]
    .filter((p) => p && String(p).trim())
    .join(" · ");
}

function Dado({
  rotulo,
  children,
  largo = false,
  numerico = false,
}: {
  rotulo: string;
  children: ReactNode;
  largo?: boolean;
  numerico?: boolean;
}) {
  return (
    <div className={`min-w-0 ${largo ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <dt className="text-[0.8125rem] font-medium leading-5 text-[#667085]">
        {rotulo}
      </dt>
      <dd
        className={`mt-0.5 text-[0.9375rem] font-semibold leading-6 text-[#101828] ${
          numerico ? "cz-num" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
