"use client";

/**
 * Lista dos formulários de abertura recebidos em `/formulario`.
 *
 * Substitui abrir o Google Drive e caçar respostas numa planilha. A régua aqui é
 * outra que a da tela pública: quem olha é operador, com mouse, dezenas de vezes
 * por dia — então usa o kit denso do painel (`ui/tarefas/`), e não o kit de campo
 * grande do formulário.
 *
 * A busca aceita protocolo, nome, CPF, telefone, razão social e e-mail no MESMO
 * campo. Seis filtros separados numa barra é o que faz o operador não usar
 * nenhum; e o protocolo é normalizado no servidor, porque quem digita está lendo
 * de um papel ou de um print.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Aviso,
  Cabecalho,
  Carregando,
  Paginacao,
  Painel,
  Vazio,
} from "./ui/tarefas/Base";
import { Botao, Entrada, Escolha } from "./ui/tarefas/Campos";
import Icone from "./ui/tarefas/Icone";
import { apiGet, mensagemDeErro, query } from "./ui/tarefas/api";
import { dataHora } from "./ui/tarefas/formato";
import { formatarCpf, formatarTelefone } from "@/lib/documento";
import {
  SITUACAO_FORMULARIO_ICONE,
  SITUACAO_FORMULARIO_LABEL,
  SITUACAO_FORMULARIO_OPCOES,
  moedaDeCentavos,
} from "@/lib/formulario-abertura";

type Item = {
  id: string;
  protocolo: string;
  razaoSocialPretendida: string;
  nomeFantasia: string;
  socioPrincipalNome: string;
  socioPrincipalCpf: string;
  socioPrincipalEmail: string;
  socioPrincipalTelefone: string;
  quantidadeSocios: number;
  capitalTotalCentavos: number;
  situacao: string;
  createdAt: string;
  _count: { documentos: number };
};

type Resposta = {
  formularios: Item[];
  total: number;
  pagina: number;
  totalPaginas: number;
};

/**
 * Cor do selo por situação.
 *
 * Só "Devolvido" é vermelho: é o único estado que exige ação de alguém. Se
 * "Recebido" também gritasse, nada gritaria.
 */
const COR_SITUACAO: Record<string, string> = {
  RECEBIDO: "border-[#FFD9BF] bg-[#FFF2E9] text-[#C2410C]",
  EM_ANALISE: "border-[#DCE0E7] bg-[#F8F9FB] text-[#475467]",
  APROVADO: "border-[#FFD9BF] bg-[#FFF2E9] text-[#C2410C]",
  DEVOLVIDO: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
};

export default function FormularioListaView() {
  return (
    <Suspense
      fallback={
        <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
          <Carregando texto="Carregando formulários" />
        </div>
      }
    >
      <Conteudo />
    </Suspense>
  );
}

function Conteudo() {
  const router = useRouter();
  const params = useSearchParams();

  const paginaUrl = Math.max(1, Number(params.get("pagina")) || 1);
  const buscaUrl = params.get("busca") ?? "";
  const situacaoUrl = params.get("situacao") ?? "";

  // Campo de texto local, separado da URL: sincronizar a cada tecla empilharia
  // uma entrada no histórico do navegador por caractere digitado.
  const [busca, setBusca] = useState(buscaUrl);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => setBusca(buscaUrl), [buscaUrl]);

  const filtroAtivo = !!buscaUrl || !!situacaoUrl;

  function limpar() {
    setBusca("");
    router.push("/admin/formulario");
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await apiGet<Resposta>(
        `/api/formulario${query({
          pagina: paginaUrl,
          busca: buscaUrl,
          situacao: situacaoUrl,
        })}`
      );
      setDados(r);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }, [paginaUrl, buscaUrl, situacaoUrl]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function navegar(mudancas: Record<string, string | number>) {
    const atual = new URLSearchParams(params.toString());
    Object.entries(mudancas).forEach(([chave, valor]) => {
      if (valor === "" || valor === 0) atual.delete(chave);
      else atual.set(chave, String(valor));
    });
    // Mudar filtro volta para a página 1: senão a pessoa filtra, cai na página 4
    // de um resultado de 2 páginas e vê a lista vazia.
    if (!("pagina" in mudancas)) atual.delete("pagina");
    router.push(`/admin/formulario?${atual.toString()}`);
  }

  const lista = dados?.formularios ?? [];

  /** Vai na descrição do painel de filtros, como nas outras telas do módulo. */
  const resumoLista = dados
    ? `${dados.total} ${dados.total === 1 ? "formulário recebido" : "formulários recebidos"}`
    : "Carregando";

  return (
    <div className="cz-tarefas mx-auto max-w-[1800px] space-y-6 p-6">
      {/* `compacto`: o cabeçalho do admin já escreve "Formulários de abertura" e
          o subtítulo da rota. Repetir aqui gastaria a área mais visível da tela
          com a informação que a pessoa acabou de ler. */}
      <Cabecalho
        compacto
        titulo="Formulários de abertura"
        descricao="O que os clientes enviaram pela tela pública /formulario. Nada aqui pode ser excluído, nem por administrador."
        acoes={
          <Botao
            variante="secundario"
            icone="RefreshCw"
            onClick={carregar}
            carregando={carregando}
          >
            Atualizar
          </Botao>
        }
      />

      {/* ------------------------------- Filtros -------------------------------
          Mesma forma do painel de filtros das outras telas do módulo (`Painel`
          com título, `acoes` para limpar, e grade de campos no corpo). A primeira
          versão inventava um `<form>` em linha com `flex`, e o resultado era uma
          barra que não se parecia com nenhuma outra tela do admin. */}
      <Painel
        titulo="Filtros"
        descricao={resumoLista}
        acoes={
          filtroAtivo ? (
            <Botao variante="secundario" icone="X" onClick={limpar}>
              Limpar filtros
            </Botao>
          ) : undefined
        }
      >
        <form
          className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            navegar({ busca });
          }}
        >
          <Entrada
            rotulo="Buscar"
            type="search"
            wrapperClassName="lg:col-span-2"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Protocolo, nome do sócio, CPF, telefone, razão social ou e-mail"
            ajuda="O protocolo pode ser digitado com ou sem o CZ-. Enter para buscar."
          />
          <Escolha
            rotulo="Situação"
            vazio="Todas as situações"
            opcoes={SITUACAO_FORMULARIO_OPCOES}
            value={situacaoUrl}
            onChange={(e) => navegar({ situacao: e.target.value })}
            ajuda="Andamento da análise do escritório."
          />
          {/* O submit existe para o Enter funcionar; o botão fica escondido do
              layout porque a busca também dispara ao trocar a situação, e dois
              gatilhos visíveis para a mesma coisa confundem. */}
          <button type="submit" className="sr-only">
            Buscar
          </button>
        </form>
      </Painel>

      {/* ------------------------------ Estados -------------------------------- */}
      {erro && (
        <div className="space-y-3">
          <Aviso mensagem={erro} onFechar={() => setErro("")} />
          <Botao variante="secundario" icone="RefreshCw" onClick={carregar}>
            Tentar novamente
          </Botao>
        </div>
      )}

      {!erro && carregando && !dados && (
        <Carregando texto="Carregando formulários" />
      )}

      {/* `Vazio` solto, sem `Painel` em volta: ele já traz a moldura e o respiro,
          e envolver dava borda dentro de borda — foi o quadro duplo do teste. */}
      {!erro && dados && lista.length === 0 && (
        filtroAtivo ? (
          <Vazio
            icone="Filter"
            titulo="Nenhum formulário encontrado com os filtros atuais."
            descricao="Os filtros aplicados não retornaram nenhum formulário. Ajuste ou limpe para ver o restante."
            acao={
              <Botao variante="secundario" icone="X" onClick={limpar}>
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <Vazio
            icone="ClipboardCheck"
            titulo="Nenhum formulário recebido ainda."
            descricao="Envie o endereço app.contazoom.com.br/formulario para o cliente preencher. O que ele mandar aparece aqui, com os documentos de cada sócio."
          />
        )
      )}

      {!erro && lista.length > 0 && (
        <Painel
          titulo={`${dados?.total ?? lista.length} ${
            (dados?.total ?? 0) === 1 ? "formulário" : "formulários"
          }`}
          rodape={
            dados && dados.totalPaginas > 1 ? (
              <Paginacao
                pagina={dados.pagina}
                totalPaginas={dados.totalPaginas}
                total={dados.total}
                rotulo="formulários"
                onMudar={(p) => navegar({ pagina: p })}
              />
            ) : undefined
          }
        >
          {/* Tabela no desktop, cartão no celular. Tabela com scroll horizontal em
              390px não se lê, e o operador às vezes confere pelo telefone. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--cz-hairline)]">
                  {[
                    "Protocolo",
                    "Sócio principal",
                    "Empresa pretendida",
                    "Sócios",
                    "Capital",
                    "Docs.",
                    "Situação",
                    "Recebido",
                    "",
                  ].map((titulo) => (
                    <th
                      key={titulo}
                      className="px-4 py-3 text-[12.5px] font-semibold text-[var(--cz-texto-suave)]"
                    >
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--cz-hairline)] transition-colors last:border-b-0 hover:bg-[var(--cz-fundo)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/formulario/${item.id}`}
                        className="cz-num text-[13.5px] font-bold text-[var(--cz-laranja-forte)] hover:underline"
                      >
                        {item.protocolo}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13.5px] font-semibold text-[var(--cz-texto)]">
                        {item.socioPrincipalNome}
                      </p>
                      <p className="cz-num text-[12px] text-[var(--cz-texto-suave)]">
                        {formatarCpf(item.socioPrincipalCpf)}
                        {" · "}
                        {formatarTelefone(item.socioPrincipalTelefone)}
                      </p>
                    </td>
                    <td className="max-w-[18rem] px-4 py-3">
                      <p className="truncate text-[13.5px] font-medium text-[var(--cz-texto)]">
                        {item.nomeFantasia}
                      </p>
                      <p className="truncate text-[12px] text-[var(--cz-texto-suave)]">
                        {item.razaoSocialPretendida}
                      </p>
                    </td>
                    <td className="cz-num px-4 py-3 text-[13.5px] text-[var(--cz-texto)]">
                      {item.quantidadeSocios}
                    </td>
                    <td className="cz-num px-4 py-3 text-[13.5px] font-semibold text-[var(--cz-texto)]">
                      {moedaDeCentavos(item.capitalTotalCentavos)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="cz-num inline-flex items-center gap-1 text-[13px] text-[var(--cz-texto-suave)]">
                        <Icone nome="Paperclip" className="h-3.5 w-3.5" />
                        {item._count.documentos}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SeloSituacao situacao={item.situacao} />
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-[var(--cz-texto-suave)]">
                      {dataHora(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/formulario/${item.id}`}
                        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--cz-laranja-forte)] hover:text-[var(--cz-laranja)]"
                      >
                        Abrir
                        <Icone nome="ChevronRight" className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-[var(--cz-hairline)] lg:hidden">
            {lista.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/formulario/${item.id}`}
                  className="block p-4 transition-colors hover:bg-[var(--cz-fundo)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="cz-num text-[13.5px] font-bold text-[var(--cz-laranja-forte)]">
                      {item.protocolo}
                    </span>
                    <SeloSituacao situacao={item.situacao} />
                  </div>
                  <p className="mt-1.5 text-[14px] font-semibold text-[var(--cz-texto)]">
                    {item.socioPrincipalNome}
                  </p>
                  <p className="text-[12.5px] text-[var(--cz-texto-suave)]">
                    {item.nomeFantasia}
                  </p>
                  <p className="cz-num mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-[var(--cz-texto-suave)]">
                    <span>
                      {item.quantidadeSocios}{" "}
                      {item.quantidadeSocios === 1 ? "sócio" : "sócios"}
                    </span>
                    <span>{moedaDeCentavos(item.capitalTotalCentavos)}</span>
                    <span>{item._count.documentos} docs.</span>
                    <span>{dataHora(item.createdAt)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Painel>
      )}
    </div>
  );
}

function SeloSituacao({ situacao }: { situacao: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${
        COR_SITUACAO[situacao] ?? COR_SITUACAO.EM_ANALISE
      }`}
    >
      <Icone
        nome={SITUACAO_FORMULARIO_ICONE[situacao] ?? "Circle"}
        className="h-3.5 w-3.5"
      />
      {SITUACAO_FORMULARIO_LABEL[situacao] ?? situacao}
    </span>
  );
}
