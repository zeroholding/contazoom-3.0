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

import {
  MINIMO_ATIVIDADES,
  enderecoEfetivoDoSocio,
  enderecoEmLinha,
  type Erros,
  type FormularioAbertura,
} from "@/lib/formulario-abertura";
import {
  CampoArea,
  CampoSelect,
  CampoTexto,
  Cartao,
  Nota,
  TituloSecao,
} from "../componentes/Base";
import {
  Binaria,
  CampoEndereco,
  EnderecoEmLeitura,
  EscolhaCartao,
} from "../componentes/Campos";

const ORDINAIS = ["1ª opção", "2ª opção", "3ª opção"] as const;

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
  const faltam = MINIMO_ATIVIDADES - atividades.length;

  function mudarRazao(indice: number, texto: string) {
    const novas = [...dados.razaoSocialOpcoes] as typeof dados.razaoSocialOpcoes;
    novas[indice] = texto;
    onMudar({ razaoSocialOpcoes: novas });
  }

  return (
    <div className="space-y-5">
      <TituloSecao
        nivel={2}
        icone="Building2"
        titulo="A empresa"
        descricao="Nome, atividade e onde ela vai funcionar."
      />

      {/* --------------------------- Razão social ------------------------------ */}
      <Cartao className="p-4 sm:p-6">
        <TituloSecao
          icone="ScrollText"
          titulo="Três opções de razão social"
          descricao="A razão social é o nome oficial no registro, usado em contratos, nota fiscal e documentos. A Junta Comercial pode recusar um nome já registrado, então enviamos três para não recomeçar o processo."
        />

        {/* Três campos, os três obrigatórios. Não dá para mandar duas nem cinco. */}
        <div className="mt-5 space-y-5">
          {ORDINAIS.map((rotulo, i) => (
            <CampoTexto
              key={rotulo}
              rotulo={rotulo}
              icone={i === 0 ? "BadgeCheck" : "Tag"}
              required
              value={dados.razaoSocialOpcoes[i]}
              onChange={(e) => mudarRazao(i, e.target.value)}
              erro={erros[`razaoSocial.${i}`] ?? null}
              autoComplete="off"
              placeholder={
                i === 0
                  ? "O nome que você prefere"
                  : "Alternativa, caso a anterior seja recusada"
              }
            />
          ))}
        </div>
      </Cartao>

      {/* --------------------- Nome fantasia e atividades ---------------------- */}
      <Cartao className="space-y-5 p-4 sm:p-6">
        <CampoTexto
          rotulo="Nome fantasia"
          icone="Store"
          required
          value={dados.nomeFantasia}
          onChange={(e) => onMudar({ nomeFantasia: e.target.value })}
          erro={erros["nomeFantasia"] ?? null}
          ajuda="Como a empresa vai ser conhecida pelo público. Pode ser diferente da razão social."
          autoComplete="off"
          placeholder="O nome da fachada, do site, do Instagram"
        />

        <CampoArea
          rotulo="Quais atividades a empresa vai desenvolver?"
          required
          rows={6}
          value={dados.atividades}
          onChange={(e) => onMudar({ atividades: e.target.value })}
          erro={erros["atividades"] ?? null}
          ajuda="Descreva com detalhe os produtos comercializados, o nicho ou os serviços prestados. É isso que define os CNAEs do CNPJ."
          placeholder="Ex.: venda de roupas femininas pela internet, com estoque próprio, e também confecção sob encomenda para lojistas da região."
          contador={
            // Só depois de começar a digitar: "0 de 30" num campo vazio parece
            // cobrança antes da hora.
            atividades.length > 0 && faltam > 0 ? (
              <p className="cz-num text-[0.8125rem] font-semibold text-[#B54708]">
                faltam {faltam}
              </p>
            ) : atividades.length >= MINIMO_ATIVIDADES ? (
              <p className="text-[0.8125rem] font-semibold text-[#D9500A]">ok</p>
            ) : null
          }
        />
      </Cartao>

      {/* ------------------------ Endereço da empresa -------------------------- */}
      <Cartao className="space-y-5 p-4 sm:p-6">
        <TituloSecao
          icone="MapPin"
          titulo="Onde a empresa vai funcionar"
          descricao="É o endereço que vai para a Junta Comercial e para o CNPJ."
        />

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
              texto: umSocio
                ? "No endereço do sócio"
                : "No endereço de um dos sócios",
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
          <div className="space-y-4">
            {/* Com um sócio só, é dele — perguntar "de qual?" com uma opção é
                atrito puro. */}
            {!umSocio && (
              <CampoSelect
                rotulo="De qual sócio?"
                icone="User"
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
                    socioDoEndereco:
                      e.target.value === "" ? null : Number(e.target.value),
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

        <div className="space-y-4 border-t border-[#E7EAEF] pt-5">
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
            <Nota tom="info">
              Sem problema, você pode enviar depois. O processo de viabilidade
              pode precisar dele.
            </Nota>
          )}
        </div>
      </Cartao>
    </div>
  );
}
