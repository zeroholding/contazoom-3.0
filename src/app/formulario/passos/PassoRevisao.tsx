"use client";

/**
 * Passo 5: tudo em leitura, com link para corrigir cada bloco.
 *
 * Cada grupo tem um "Editar" que volta ao passo certo. Sem isso, quem vê um erro
 * na revisão usa o botão Voltar do navegador, sai da página e perde tudo — não há
 * banco nesta fase.
 */

import type { ReactNode } from "react";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
  somenteDigitos,
} from "@/lib/documento";
import {
  ENQUADRAMENTO_LABEL,
  ESTADO_CIVIL_LABEL,
  REGIME_BENS_LABEL,
  capitalTotal,
  enderecoEfetivoDaEmpresa,
  enderecoEfetivoDoSocio,
  enderecoEmLinha,
  gruposDeDocumentos,
  moedaDeCentavos,
  percentualDoSocio,
  type Erros,
  type FormularioAbertura,
} from "@/lib/formulario-abertura";
import { Cartao, TituloSecao } from "../componentes/Base";

export function PassoRevisao({
  dados,
  erros,
  arquivos,
  onIrParaPasso,
  onMudar,
}: {
  dados: FormularioAbertura;
  erros: Erros;
  arquivos: Record<string, File[]>;
  onIrParaPasso: (passo: number) => void;
  onMudar: (parcial: Partial<FormularioAbertura>) => void;
}) {
  const total = capitalTotal(dados.socios);
  const umSocio = dados.socios.length === 1;
  const administradores = dados.socios.filter((s) => s.administrador);
  const grupos = gruposDeDocumentos(dados);

  return (
    <div className="space-y-5">
      <TituloSecao
        nivel={2}
        icone="ClipboardCheck"
        titulo="Confira antes de enviar"
        descricao="Se algo estiver errado, use o Editar do bloco. Você volta exatamente onde precisa."
      />

      {/* ------------------------------- Sócios -------------------------------- */}
      <Grupo titulo="Sócios" icone="Users" onEditar={() => onIrParaPasso(0)}>
        <div className="divide-y divide-[#E7EAEF]">
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
                  {socio.nome.trim() || `Sócio ${i + 1}`}
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
                  {formatarCpf(somenteDigitos(socio.cpf)) || "—"}
                </Dado>
                <Dado rotulo="Telefone" numerico>
                  {formatarTelefone(somenteDigitos(socio.telefone)) || "—"}
                </Dado>
                <Dado rotulo="E-mail">{socio.email.trim() || "—"}</Dado>
                <Dado rotulo="Profissão">{socio.profissao.trim() || "—"}</Dado>
                <Dado rotulo="Estado civil">
                  {/* Regime junto do estado civil, porque é assim que a
                      informação é usada no contrato. Separado na PERGUNTA, junto
                      na LEITURA. */}
                  {socio.estadoCivil
                    ? socio.regimeBens
                      ? `${ESTADO_CIVIL_LABEL[socio.estadoCivil]} — ${REGIME_BENS_LABEL[socio.regimeBens]}`
                      : ESTADO_CIVIL_LABEL[socio.estadoCivil]
                    : "—"}
                </Dado>
                <Dado rotulo="Conta GOV.BR">
                  {socio.contaGov === null ? "—" : socio.contaGov ? "Sim" : "Não"}
                </Dado>
                <Dado rotulo="Endereço" largo>
                  {enderecoEmLinha(enderecoEfetivoDoSocio(dados, i))}
                </Dado>
                {socio.temParticipacaoOutraEmpresa === true && (
                  <Dado rotulo="Participação em outra empresa" largo>
                    {formatarCnpj(somenteDigitos(socio.outraEmpresaCnpj)) || "—"}
                    {socio.outraEmpresaEnquadramento
                      ? ` · ${ENQUADRAMENTO_LABEL[socio.outraEmpresaEnquadramento]}`
                      : ""}
                  </Dado>
                )}
              </dl>
            </div>
          ))}
        </div>
      </Grupo>

      {/* ------------------------------ Empresa -------------------------------- */}
      <Grupo titulo="A empresa" icone="Building2" onEditar={() => onIrParaPasso(1)}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Dado rotulo="Opções de razão social" largo>
            <ol className="space-y-1">
              {dados.razaoSocialOpcoes.map((nome, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="cz-num text-[0.75rem] font-bold text-[#98A2B3]">
                    {i + 1}
                  </span>
                  <span>{nome.trim() || "—"}</span>
                </li>
              ))}
            </ol>
          </Dado>
          <Dado rotulo="Nome fantasia">{dados.nomeFantasia.trim() || "—"}</Dado>
          <Dado rotulo="IPTU do endereço">
            {dados.temIptu === null ? "—" : dados.temIptu ? "Tem" : "Não tem"}
          </Dado>
          <Dado rotulo="Endereço da empresa" largo>
            {enderecoEmLinha(enderecoEfetivoDaEmpresa(dados))}
            {dados.localEmpresa === "SOCIO" && dados.socioDoEndereco !== null && (
              <span className="mt-1 block text-[0.8125rem] font-normal text-[#667085]">
                Mesmo endereço de{" "}
                {dados.socios[dados.socioDoEndereco]?.nome.trim() ||
                  `Sócio ${dados.socioDoEndereco + 1}`}
              </span>
            )}
          </Dado>
          <Dado rotulo="Atividades" largo>
            <span className="font-normal leading-[1.6]">
              {dados.atividades.trim() || "—"}
            </span>
          </Dado>
        </dl>
      </Grupo>

      {/* ----------------------------- Sociedade ------------------------------- */}
      <Grupo
        titulo="A sociedade"
        icone="Handshake"
        onEditar={() => onIrParaPasso(2)}
      >
        <div className="space-y-4">
          {dados.socios.map((socio, i) => (
            <div
              key={i}
              className="flex items-baseline justify-between gap-4 border-b border-dashed border-[#E7EAEF] pb-3 last:border-b-0 last:pb-0"
            >
              <p className="min-w-0 truncate text-[0.9375rem] font-medium text-[#344054]">
                {socio.nome.trim() || `Sócio ${i + 1}`}
              </p>
              <p className="cz-num shrink-0 text-[0.9375rem] font-semibold text-[#101828]">
                {moedaDeCentavos(socio.capitalCentavos)}
                {!umSocio && (
                  <span className="ml-2.5 font-bold text-[#D9500A]">
                    {percentualDoSocio(socio, total)}
                  </span>
                )}
              </p>
            </div>
          ))}

          <div className="flex items-baseline justify-between gap-4 rounded-[12px] bg-[#F7F8FA] px-4 py-3">
            <p className="text-[0.9375rem] font-semibold text-[#344054]">
              Capital social total
            </p>
            <p className="cz-num text-[1.25rem] font-bold tracking-[-0.02em] text-[#101828]">
              {moedaDeCentavos(total)}
            </p>
          </div>

          <dl className="grid gap-x-6 gap-y-4 pt-1 sm:grid-cols-2">
            <Dado rotulo="Administração">
              {administradores.length
                ? administradores
                    .map((s) => s.nome.trim() || "Sócio sem nome")
                    .join(", ")
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
        </div>
      </Grupo>

      {/* ---------------------------- Documentos ------------------------------- */}
      <Grupo
        titulo="Documentos"
        icone="Paperclip"
        onEditar={() => onIrParaPasso(3)}
      >
        <div className="space-y-5">
          {grupos.map((grupo) => (
            <div key={grupo.chave}>
              <p className="text-[0.8125rem] font-bold text-[#667085]">
                {grupo.titulo}
              </p>
              <ul className="mt-2 space-y-1.5">
                {grupo.slots.map((slot) => {
                  const lista = arquivos[slot.chave] ?? [];
                  const falta = slot.obrigatorio && lista.length === 0;
                  return (
                    <li
                      key={slot.chave}
                      className="flex items-start gap-2 text-[0.9375rem] leading-6"
                    >
                      <Icone
                        nome={falta ? "AlertTriangle" : "CheckCircle2"}
                        className={`mt-1 h-4 w-4 shrink-0 ${
                          falta ? "text-[#F04438]" : "text-[#D9500A]"
                        }`}
                      />
                      <span
                        className={falta ? "text-[#B42318]" : "text-[#344054]"}
                      >
                        {slot.rotulo}
                        {lista.length > 0 && (
                          <span className="cz-num text-[#667085]">
                            {" · "}
                            {lista.length}{" "}
                            {lista.length === 1 ? "arquivo" : "arquivos"}
                          </span>
                        )}
                        {falta && (
                          <span className="font-semibold"> · faltando</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Grupo>

      {/* ---------------------------- Confirmação ------------------------------ */}
      <Cartao
        className={`p-4 sm:p-5 ${
          erros["confirmouVeracidade"] ? "border-[#FDA29B]! bg-[#FFFBFA]" : ""
        }`}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={dados.confirmouVeracidade}
            onChange={(e) => onMudar({ confirmouVeracidade: e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#F26212]"
            aria-describedby="confirmacao-erro"
          />
          <span className="text-[0.9375rem] font-medium leading-[1.6] text-[#344054]">
            Confirmo que os dados e documentos informados são verdadeiros e
            autorizo a ContaZoom a usá-los para abrir o CNPJ.
          </span>
        </label>
        {erros["confirmouVeracidade"] && (
          <p
            id="confirmacao-erro"
            className="mt-2.5 flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-5 text-[#B42318]"
          >
            <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erros["confirmouVeracidade"]}</span>
          </p>
        )}
      </Cartao>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Apoio                                     */
/* -------------------------------------------------------------------------- */

function Grupo({
  titulo,
  icone,
  onEditar,
  children,
}: {
  titulo: string;
  icone: string;
  onEditar: () => void;
  children: ReactNode;
}) {
  return (
    <Cartao className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[#E7EAEF] bg-[#FBFCFD] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#FFDCC4] bg-[#FFF4EC] text-[#D9500A]"
          >
            <Icone nome={icone} className="h-[1.125rem] w-[1.125rem]" />
          </span>
          <h3 className="truncate text-[1rem] font-bold tracking-[-0.01em] text-[#101828]">
            {titulo}
          </h3>
        </div>
        <button
          type="button"
          onClick={onEditar}
          className="cz-campo-foco inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#D8DDE5] bg-white px-3.5 text-[0.8125rem] font-semibold text-[#475467] transition-colors hover:border-[#F26212] hover:text-[#C2410C]"
        >
          <Icone nome="Pencil" className="h-4 w-4" />
          Editar
        </button>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </Cartao>
  );
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
