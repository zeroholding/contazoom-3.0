"use client";

/**
 * Passo 2: nomes, atividades e endereço da empresa.
 *
 * Dois defeitos do formulário antigo morrem aqui:
 *
 *  - "Três opções de nome para a Razão Social [Sim, precisam ser 03]" era UM
 *    campo de texto. O enunciado implorava por três e o campo aceitava uma ou
 *    sete. Vinham duas, alguém ligava de volta, e o processo esperava.
 *  - "Endereço da empresa COMPLETO, com CEP" era texto livre, sem busca.
 */

import { Area, Entrada, Escolha } from "@/app/components/views/ui/tarefas/Campos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  MINIMO_ATIVIDADES,
  enderecoEmLinha,
  enderecoEfetivoDoSocio,
  type Erros,
  type FormularioAbertura,
} from "@/lib/formulario-abertura";
import {
  Binaria,
  CampoEndereco,
  EnderecoEmLeitura,
  EscolhaCartao,
} from "../componentes/Campos";
import { CabecalhoPasso } from "./PassoSocios";

export function PassoEmpresa({
  dados,
  erros,
  onMudar,
}: {
  dados: FormularioAbertura;
  erros: Erros;
  onMudar: (parcial: Partial<FormularioAbertura>) => void;
}) {
  const umSocio = dados.socios.length === 1;
  const atividades = dados.atividades.trim();

  function mudarRazao(indice: number, texto: string) {
    const novas = [...dados.razaoSocialOpcoes] as typeof dados.razaoSocialOpcoes;
    novas[indice] = texto;
    onMudar({ razaoSocialOpcoes: novas });
  }

  return (
    <div className="space-y-6">
      <CabecalhoPasso
        icone="Building2"
        titulo="A empresa"
        descricao="Nome, atividade e onde ela vai funcionar."
      />

      {/* --------------------------- Razão social ------------------------------ */}
      <section className="rounded-[14px] border border-[#EDEFF3] bg-white p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
            <Icone nome="ScrollText" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-semibold leading-5 text-[#14161B]">
              Três opções de razão social
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">
              A razão social é o nome oficial no registro, usado em contratos,
              nota fiscal e documentos. A Junta Comercial pode recusar um nome já
              registrado, então enviamos três para não recomeçar o processo.
            </p>
          </div>
        </div>

        {/* Três campos, os três obrigatórios. Não dá para mandar duas nem cinco. */}
        <div className="mt-4 space-y-4">
          {(["1ª opção", "2ª opção", "3ª opção"] as const).map((rotulo, i) => (
            <Entrada
              key={rotulo}
              rotulo={rotulo}
              required
              value={dados.razaoSocialOpcoes[i]}
              onChange={(e) => mudarRazao(i, e.target.value)}
              erro={erros[`razaoSocial.${i}`] ?? null}
              autoComplete="off"
              placeholder={
                i === 0 ? "Nome preferido" : "Alternativa, caso a anterior seja recusada"
              }
            />
          ))}
        </div>
      </section>

      {/* --------------------------- Nome fantasia ----------------------------- */}
      <Entrada
        rotulo="Nome fantasia"
        required
        value={dados.nomeFantasia}
        onChange={(e) => onMudar({ nomeFantasia: e.target.value })}
        erro={erros["nomeFantasia"] ?? null}
        ajuda="Como a empresa vai ser conhecida pelo público. Pode ser diferente da razão social."
        autoComplete="off"
        placeholder="O nome da fachada, do site, do Instagram"
      />

      {/* ---------------------------- Atividades ------------------------------- */}
      <div>
        <Area
          rotulo="Quais atividades a empresa vai desenvolver?"
          required
          rows={6}
          value={dados.atividades}
          onChange={(e) => onMudar({ atividades: e.target.value })}
          erro={erros["atividades"] ?? null}
          ajuda="Descreva com detalhe os produtos comercializados, o nicho ou os serviços prestados. É isso que define os CNAEs do CNPJ."
          placeholder="Ex.: venda de roupas femininas pela internet, com estoque próprio, e também confecção sob encomenda para lojistas."
        />
        {/* Contador só depois de a pessoa começar a digitar: "0 de 30" num campo
            vazio parece cobrança antes da hora. */}
        {atividades.length > 0 && atividades.length < MINIMO_ATIVIDADES && (
          <p className="cz-num mt-1.5 text-xs font-medium text-[#B54708]">
            {atividades.length} de {MINIMO_ATIVIDADES} caracteres — quanto mais
            detalhe, mais preciso o CNAE.
          </p>
        )}
      </div>

      {/* ------------------------ Endereço da empresa -------------------------- */}
      <section className="space-y-4 rounded-[14px] border border-[#EDEFF3] bg-white p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FFD9BF] bg-[#FFF2E9] text-[#D9500A]">
            <Icone nome="Store" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[0.9375rem] font-semibold leading-5 text-[#14161B]">
              Onde a empresa vai funcionar
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">
              É o endereço que vai para a Junta Comercial e para o CNPJ.
            </p>
          </div>
        </div>

        {/* Pergunta antes de sete campos: muita abertura usa o endereço
            residencial do sócio, e nesse caso o endereço já foi digitado. */}
        <EscolhaCartao
          rotulo="Local da empresa"
          valor={dados.localEmpresa}
          onMudar={(localEmpresa) => onMudar({ localEmpresa })}
          erro={erros["localEmpresa"] ?? null}
          opcoes={[
            {
              valor: "SOCIO",
              texto: umSocio ? "No endereço do sócio" : "No endereço de um dos sócios",
              descricao: "Usa o endereço residencial já informado.",
            },
            {
              valor: "OUTRO",
              texto: "Em outro endereço",
              descricao: "Loja, sala comercial, galpão.",
            },
          ]}
        />

        {dados.localEmpresa === "SOCIO" && (
          <div className="space-y-3">
            {/* Com um sócio só, é dele — perguntar "de qual?" com uma opção é
                atrito puro. */}
            {!umSocio && (
              <Escolha
                rotulo="De qual sócio?"
                required
                vazio="Selecione"
                opcoes={dados.socios.map((s, i) => ({
                  valor: String(i),
                  texto: s.nome.trim() || `Sócio ${i + 1}`,
                }))}
                value={
                  dados.socioDoEndereco === null
                    ? ""
                    : String(dados.socioDoEndereco)
                }
                onChange={(e) =>
                  onMudar({
                    socioDoEndereco: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                erro={erros["socioDoEndereco"] ?? null}
              />
            )}

            {dados.socioDoEndereco !== null && (
              <EnderecoEmLeitura
                titulo={`Endereço de ${
                  dados.socios[dados.socioDoEndereco]?.nome.trim() ||
                  `Sócio ${dados.socioDoEndereco + 1}`
                }`}
                linha={enderecoEmLinha(
                  enderecoEfetivoDoSocio(dados, dados.socioDoEndereco)
                )}
              />
            )}
          </div>
        )}

        {dados.localEmpresa === "OUTRO" && (
          <CampoEndereco
            valor={dados.enderecoEmpresa}
            onMudar={(enderecoEmpresa) => onMudar({ enderecoEmpresa })}
            erros={erros}
            prefixo="empresa"
          />
        )}

        <div className="border-t border-[#EDEFF3] pt-4">
          <Binaria
            rotulo="Você tem o IPTU desse endereço?"
            ajuda="Se tiver, pedimos o arquivo no passo de documentos. Não é obrigatório."
            valor={dados.temIptu}
            onMudar={(temIptu) => onMudar({ temIptu })}
            erro={erros["temIptu"] ?? null}
          />
          {/* Avisa, mas não bloqueia: hoje o formulário do escritório também
              trata o IPTU como opcional. */}
          {dados.temIptu === false && (
            <p
              role="status"
              className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#EDEFF3] bg-[#F8F9FB] px-3 py-2.5 text-xs font-medium leading-5 text-[#6B7280]"
            >
              <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Sem problema, você pode enviar depois. O processo de viabilidade
                pode precisar dele.
              </span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
