"use client";

/**
 * Passo 5: tudo em leitura, com link para corrigir cada bloco.
 *
 * Cada grupo tem um "Editar" que volta ao passo certo. Sem isso, quem vê um erro
 * na revisão usa o botão Voltar do navegador, sai da página e perde tudo — não há
 * banco nesta fase.
 */

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
import { formatarCpf, formatarCnpj, formatarTelefone, somenteDigitos } from "@/lib/documento";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { CabecalhoPasso } from "./PassoSocios";

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
      <CabecalhoPasso
        icone="ClipboardCheck"
        titulo="Confira antes de enviar"
        descricao="Se algo estiver errado, use o Editar do bloco. Você volta exatamente onde precisa."
      />

      {/* ------------------------------- Sócios -------------------------------- */}
      <Grupo titulo="Sócios" icone="Users" onEditar={() => onIrParaPasso(0)}>
        <div className="divide-y divide-[#EDEFF3]">
          {dados.socios.map((socio, i) => (
            <div key={i} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="cz-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#FFD9BF] bg-[#FFF2E9] text-[0.6875rem] font-bold text-[#D9500A]"
                >
                  {i + 1}
                </span>
                <p className="min-w-0 truncate text-[0.9375rem] font-bold text-[#14161B]">
                  {socio.nome.trim() || `Sócio ${i + 1}`}
                </p>
                {socio.administrador && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF2E9] px-2 py-0.5 text-[0.6875rem] font-bold text-[#C2410C]">
                    <Icone nome="ShieldCheck" className="h-3 w-3" />
                    Administrador
                  </span>
                )}
              </div>

              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
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
                      informação é usada no contrato. Separado na PERGUNTA,
                      junto na LEITURA. */}
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
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Opções de razão social" largo>
            <ol className="list-inside list-decimal space-y-0.5">
              {dados.razaoSocialOpcoes.map((nome, i) => (
                <li key={i}>{nome.trim() || "—"}</li>
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
              <span className="mt-0.5 block text-xs font-normal text-[#6B7280]">
                Mesmo endereço de{" "}
                {dados.socios[dados.socioDoEndereco]?.nome.trim() ||
                  `Sócio ${dados.socioDoEndereco + 1}`}
              </span>
            )}
          </Dado>
          <Dado rotulo="Atividades" largo>
            <span className="font-normal leading-6">
              {dados.atividades.trim() || "—"}
            </span>
          </Dado>
        </dl>
      </Grupo>

      {/* ----------------------------- Sociedade ------------------------------- */}
      <Grupo titulo="A sociedade" icone="Handshake" onEditar={() => onIrParaPasso(2)}>
        <div className="space-y-3">
          {dados.socios.map((socio, i) => (
            <div
              key={i}
              className="flex items-baseline justify-between gap-4 border-b border-dashed border-[#EDEFF3] pb-2.5 last:border-b-0 last:pb-0"
            >
              <p className="min-w-0 truncate text-[0.875rem] font-medium text-[#14161B]">
                {socio.nome.trim() || `Sócio ${i + 1}`}
              </p>
              <p className="cz-num shrink-0 text-[0.875rem] font-semibold text-[#14161B]">
                {moedaDeCentavos(socio.capitalCentavos)}
                {!umSocio && (
                  <span className="ml-2 font-bold text-[#D9500A]">
                    {percentualDoSocio(socio, total)}
                  </span>
                )}
              </p>
            </div>
          ))}

          <div className="flex items-baseline justify-between gap-4 border-t border-[#EDEFF3] pt-3">
            <p className="text-[0.9375rem] font-semibold text-[#14161B]">
              Capital social total
            </p>
            <p className="cz-num text-lg font-bold tracking-[-0.02em] text-[#14161B]">
              {moedaDeCentavos(total)}
            </p>
          </div>

          <dl className="grid gap-x-6 gap-y-3 pt-1 sm:grid-cols-2">
            <Dado rotulo="Administração">
              {administradores.length
                ? administradores
                    .map((s, i) => s.nome.trim() || `Sócio ${i + 1}`)
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
      <Grupo titulo="Documentos" icone="Paperclip" onEditar={() => onIrParaPasso(3)}>
        <div className="space-y-3">
          {grupos.map((grupo) => (
            <div key={grupo.chave}>
              <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                {grupo.titulo}
              </p>
              <ul className="mt-1.5 space-y-1">
                {grupo.slots.map((slot) => {
                  const lista = arquivos[slot.chave] ?? [];
                  const falta = slot.obrigatorio && lista.length === 0;
                  return (
                    <li
                      key={slot.chave}
                      className="flex items-start gap-2 text-[0.875rem] leading-6"
                    >
                      <Icone
                        nome={falta ? "AlertTriangle" : "CheckCircle2"}
                        className={`mt-1 h-3.5 w-3.5 shrink-0 ${
                          falta ? "text-[#B42318]" : "text-[#D9500A]"
                        }`}
                      />
                      <span className={falta ? "text-[#B42318]" : "text-[#14161B]"}>
                        {slot.rotulo}
                        {lista.length > 0 && (
                          <span className="cz-num text-[#6B7280]">
                            {" "}
                            · {lista.length}{" "}
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
      <div
        className={`rounded-[14px] border p-4 sm:p-5 ${
          erros["confirmouVeracidade"]
            ? "border-[#FDA29B] bg-[#FEF2F2]"
            : "border-[#EDEFF3] bg-white"
        }`}
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={dados.confirmouVeracidade}
            onChange={(e) => onMudar({ confirmouVeracidade: e.target.checked })}
            className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 accent-[#F26212]"
            aria-describedby="confirmacao-erro"
          />
          <span className="text-[0.9375rem] font-medium leading-6 text-[#14161B]">
            Confirmo que os dados e documentos informados são verdadeiros e que
            autorizo a ContaZoom a usá-los para abrir o CNPJ.
          </span>
        </label>
        {erros["confirmouVeracidade"] && (
          <p
            id="confirmacao-erro"
            className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]"
          >
            <Icone nome="AlertTriangle" className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{erros["confirmouVeracidade"]}</span>
          </p>
        )}
      </div>
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
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-[14px] border border-[#EDEFF3] bg-white"
      style={{ boxShadow: "var(--cz-elev-1)" }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#EDEFF3] bg-[#FCFCFD] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]"
          >
            <Icone nome={icone} className="h-4 w-4" />
          </span>
          <h3 className="truncate text-[0.9375rem] font-bold text-[#14161B]">
            {titulo}
          </h3>
        </div>
        <button
          type="button"
          onClick={onEditar}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#DCE0E7] bg-white px-3 text-xs font-semibold text-[#4B5563] transition-colors hover:border-[#F26212] hover:text-[#C2410C]"
        >
          <Icone nome="Pencil" className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Dado({
  rotulo,
  children,
  largo = false,
  numerico = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
  numerico?: boolean;
}) {
  return (
    <div className={`min-w-0 ${largo ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <dt className="text-xs font-medium leading-[18px] text-[#6B7280]">
        {rotulo}
      </dt>
      <dd
        className={`mt-0.5 text-[0.875rem] font-semibold leading-6 text-[#14161B] ${
          numerico ? "cz-num" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}
