"use client";

/**
 * Faturamento (XML) — apuração do faturamento mensal a partir de nota fiscal.
 *
 * Ainda sem back-end: não há model, rota nem migration. O plano está em
 * `docs/PLANO_XML_FATURAMENTO.md`. Importar e salvar não gravam.
 *
 * Os números vêm de `scripts/diagnostico-xml.ts` rodado sobre os 822 XMLs de
 * agosto/2026 da conta CINGAPURA: 366 notas de venda, R$ 62.514,16. São reais de
 * propósito — número inventado esconderia o que a tela precisa mostrar, que é o
 * mês vindo com 361 CT-e de frete no meio e o cancelamento em arquivo separado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS DEFEITOS QUE A PRIMEIRA VERSÃO TINHA, E O QUE OS CAUSAVA
 *
 * 1. SCROLL DUPLO. A tabela tinha `min-w-[62rem]` dentro de `overflow-x-auto`,
 *    e esse conjunto estava numa COLUNA DE GRID. Item de grid tem
 *    `min-width: auto`, então a coluna não encolhe abaixo da largura mínima do
 *    conteúdo: os 992px da tabela empurravam a grade além da janela. Com
 *    `html, body { overflow-x: hidden }` (globals.css), overflow horizontal faz o
 *    `overflow-y` do body COMPUTAR PARA AUTO — e aparece a segunda barra de
 *    rolagem, ao lado da do `<main>`.
 *
 *    O conserto tem duas partes, e as duas são necessárias: `min-w-0` em toda
 *    coluna de grid e em todo filho de flex que contenha a tabela, e uma tabela
 *    que caiba de verdade (colunas juntadas, de nove para sete).
 *
 * 2. FILTROS DESALINHADOS. O campo de busca era `<label>` + `<input>` escritos à
 *    mão ao lado de dois `Escolha`. Rótulo, altura e raio saíam de dois lugares
 *    diferentes e a linha ficava serrilhada. Agora os três passam por `Entrada`/
 *    `Escolha`, que descem do mesmo `Campo`.
 *
 * 3. CANAL COMO BOLINHA COLORIDA. O produto já tem os logos em SVG
 *    (`comum/logos.tsx`), e bolinha exige legenda enquanto o logo é reconhecido
 *    antes de ser lido. O TikTok não existia lá e foi acrescentado.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DUAS DIVERGÊNCIAS DELIBERADAS DA MAQUETE
 *
 * O número dos cartões não é colorido: `CartaoKpi` já decidiu isso no produto e
 * escreveu o motivo — numa grade, todo número colorido disputa com o vizinho e
 * nenhum vence. A cor fica no ícone e na variação, onde informa.
 *
 * A rosca virou BARRA DE PARTICIPAÇÃO. Com um canal em 100% a rosca é um anel
 * sólido: gasta 140px de altura para dizer "tudo de um lugar". A barra diz o mesmo
 * em 8px e continua legível quando os três canais entrarem.
 */

import { useMemo, useState } from "react";

import {
  Cabecalho,
  CartaoKpi,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Abas,
  Area,
  Botao,
  Entrada,
  Escolha,
} from "@/app/components/views/ui/tarefas/Campos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { Selo } from "@/app/components/views/comum/shell";
import { LogoCanal, type CanalLogo } from "@/app/components/views/comum/logos";

/* -------------------------------------------------------------------------- */
/*                          Dado da tela (real)                               */
/* -------------------------------------------------------------------------- */

const EMPRESA = {
  razaoSocial: "NEXUS GROUP LTDA",
  cnpj: "50.506.775/0001-01",
  regime: "Simples Nacional",
};

const COMPETENCIAS = [
  { valor: "2026-08", texto: "Agosto/2026" },
  { valor: "2026-07", texto: "Julho/2026" },
  { valor: "2026-06", texto: "Junho/2026" },
];

/**
 * Canais, com a chave do logo do produto.
 *
 * "Outros" não tem logo — é o balde de série não mapeada, e inventar um desenho
 * para ele daria a impressão de ser um marketplace. Fica com ícone genérico.
 */
type Canal = {
  chave: string;
  rotulo: string;
  logo: CanalLogo | null;
  cor: string;
  notas: number;
  valor: number;
  series: string[];
};

const CANAIS: Canal[] = [
  { chave: "ml", rotulo: "Mercado Livre", logo: "ML", cor: "#F8D135", notas: 366, valor: 62514.16, series: ["2"] },
  { chave: "shopee", rotulo: "Shopee", logo: "SP", cor: "#EE4D2D", notas: 0, valor: 0, series: [] },
  { chave: "tiktok", rotulo: "TikTok Shop", logo: "TT", cor: "#111827", notas: 0, valor: 0, series: [] },
  { chave: "outros", rotulo: "Sem série mapeada", logo: null, cor: "#D1D5DB", notas: 0, valor: 0, series: [] },
];

const APURADO = 62514.16;
const DECLARADO_INICIAL = "62.514,16";
const ARQUIVOS_LIDOS = 822;
const NOTAS_VALIDAS = 366;
const NOTAS_CANCELADAS = 3;

/** O que foi lido e NÃO entrou, com o motivo. É a coluna de honestidade da tela. */
const IGNORADOS = [
  { rotulo: "CT-e de frete (modelo 57)", quantos: 361, valor: 12569, motivo: "Emitido pelo Mercado Livre contra a empresa. É custo, não receita." },
  { rotulo: "Retorno simbólico do FULL", quantos: 63, valor: 3026.8, motivo: "Entrada: mercadoria voltando do depósito." },
  { rotulo: "Remessa para o FULL", quantos: 21, valor: 756.7, motivo: "Saída autorizada, mas CFOP fora da faixa de venda (5949 / 6949 / 6905)." },
  { rotulo: "Devolução", quantos: 5, valor: 2182, motivo: "finNFe = 4. Entrada de mercadoria devolvida." },
  { rotulo: "Canceladas", quantos: 3, valor: 697.8, motivo: "Evento 110111 em arquivo separado — o XML da nota ainda diz cStat 100." },
];

const NOTAS = [
  { chave: "35260850506775000101550020000077861819229697", emissao: "01/08/2026", numero: "7786", serie: "2", canal: "ml", cfop: "6108", destinatario: "Everaldo dos Santos", documento: "CPF", situacao: "AUTORIZADA", valor: 32.9, pedido: "6643625021" },
  { chave: "35260850506775000101550020000077881277486064", emissao: "01/08/2026", numero: "7788", serie: "2", canal: "ml", cfop: "6108", destinatario: "Consumidor final", documento: "CPF", situacao: "AUTORIZADA", valor: 79.9, pedido: "6648929887" },
  { chave: "35260850506775000101550020000079671618921416", emissao: "04/08/2026", numero: "7967", serie: "2", canal: "ml", cfop: "6108", destinatario: "Consumidor final", documento: "CPF", situacao: "CANCELADA", valor: 249.9, pedido: "6745636266" },
  { chave: "35260850506775000101550020000082021580921602", emissao: "11/08/2026", numero: "8202", serie: "2", canal: "ml", cfop: "5102", destinatario: "Comércio Xpto Ltda", documento: "CNPJ", situacao: "CANCELADA", valor: 159, pedido: "6849521636" },
  { chave: "35260850506775000101550020000082391128857934", emissao: "12/08/2026", numero: "8239", serie: "2", canal: "ml", cfop: "6106", destinatario: "Consumidor final", documento: "CPF", situacao: "AUTORIZADA", valor: 320, pedido: "6876605759" },
];

const HISTORICO = [
  { icone: "CheckCircle2", tom: "text-emerald-600", texto: "Importação concluída", quando: `${ARQUIVOS_LIDOS} arquivos · hoje 15:20` },
  { icone: "FileText", tom: "text-[var(--cz-texto-suave)]", texto: "Faturamento declarado atualizado", quando: "R$ 62.514,16 · hoje 14:10" },
  { icone: "UploadCloud", tom: "text-sky-600", texto: "3 cancelamentos aplicados", quando: "hoje 11:32" },
  { icone: "Settings", tom: "text-[var(--cz-texto-suave)]", texto: "Série 2 mapeada para Mercado Livre", quando: "ontem 16:45" },
];

/* -------------------------------------------------------------------------- */
/*                                 Formatação                                 */
/* -------------------------------------------------------------------------- */

const real = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const inteiro = (v: number) => v.toLocaleString("pt-BR");

/** "62.514,16" -> 62514.16. Aceita vazio e o meio-caminho da digitação. */
function paraNumero(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

const canalPor = (chave: string) => CANAIS.find((c) => c.chave === chave) ?? null;

/* -------------------------------------------------------------------------- */
/*                              Peças da tela                                 */
/* -------------------------------------------------------------------------- */

/**
 * Canal como logo.
 *
 * Caixa de tamanho fixo em volta do SVG: os três desenhos têm proporções
 * diferentes, e sem a caixa comum uma linha de Mercado Livre e outra de Shopee
 * ficariam com alturas visivelmente distintas e a coluna pareceria torta. É a
 * mesma razão do `SeloCanal` de `logos.tsx`.
 */
function Canal({ chave, comNome = true }: { chave: string; comNome?: boolean }) {
  const canal = canalPor(chave);
  if (!canal) return <span className="text-[var(--cz-texto-fraco)]">—</span>;

  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={canal.rotulo}>
      <span className="grid size-6 shrink-0 place-items-center rounded-md border border-[var(--cz-hairline)] bg-[var(--cz-superficie)]">
        {canal.logo ? (
          <LogoCanal canal={canal.logo} />
        ) : (
          <Icone nome="Store" className="h-3 w-3 text-[var(--cz-texto-fraco)]" />
        )}
      </span>
      {comNome && <span className="truncate">{canal.rotulo}</span>}
    </span>
  );
}

/**
 * Participação por canal, em barra.
 *
 * Substituiu a rosca. Com um canal em 100% a rosca vira um anel sólido e gasta
 * 140px de altura para dizer "veio tudo do mesmo lugar"; a barra diz isso em 8px
 * e continua legível com três ou quatro canais.
 */
function BarraParticipacao({ canais, total }: { canais: Canal[]; total: number }) {
  const comValor = canais.filter((c) => c.valor > 0);
  if (total <= 0 || comValor.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--cz-fundo)]">
        {comValor.map((c) => (
          <span
            key={c.chave}
            title={`${c.rotulo}: ${real(c.valor)}`}
            style={{ width: `${(c.valor / total) * 100}%`, backgroundColor: c.cor }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {comValor.map((c) => (
          <li key={c.chave} className="flex items-center gap-1.5 text-[11.5px]">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: c.cor }}
            />
            <span className="text-[var(--cz-texto-suave)]">{c.rotulo}</span>
            <span className="cz-num font-bold text-[var(--cz-texto)]">
              {((c.valor / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Tela                                     */
/* -------------------------------------------------------------------------- */

/** Abas sem conteúdo ainda: dizem no rótulo, e o clique não finge navegar. */
const ABAS_PENDENTES = new Set(["canais", "ajustes", "historico", "declaracao"]);

const ABAS = [
  { chave: "geral", texto: "Visão geral" },
  { chave: "notas", texto: "Notas fiscais", contagem: NOTAS_VALIDAS },
  { chave: "canais", texto: "Canal e série" },
  { chave: "ajustes", texto: "Ajustes manuais" },
  { chave: "historico", texto: "Histórico" },
  { chave: "declaracao", texto: "Declaração" },
].map((aba) =>
  ABAS_PENDENTES.has(aba.chave) ? { ...aba, texto: `${aba.texto} · em breve` } : aba,
);

export default function FaturamentoXmlView() {
  const [competencia, setCompetencia] = useState("2026-08");
  const [aba, setAba] = useState("geral");

  const [origem, setOrigem] = useState<"xml" | "manual">("xml");
  const [declarado, setDeclarado] = useState(DECLARADO_INICIAL);
  const [observacao, setObservacao] = useState("");
  const [arrastando, setArrastando] = useState(false);

  const [busca, setBusca] = useState("");
  const [canalFiltro, setCanalFiltro] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const valorDeclarado = origem === "xml" ? APURADO : paraNumero(declarado);
  const divergencia = valorDeclarado - APURADO;
  const divergenciaPct = APURADO > 0 ? (divergencia / APURADO) * 100 : 0;
  const semDivergencia = Math.abs(divergencia) < 0.01;

  const visiveis = useMemo(
    () =>
      NOTAS.filter((n) => {
        if (canalFiltro && n.canal !== canalFiltro) return false;
        if (situacaoFiltro && n.situacao !== situacaoFiltro) return false;
        if (busca) {
          const t = busca.trim().toLowerCase();
          const casa =
            n.numero.includes(t) ||
            n.chave.includes(t.replace(/\D/g, "")) ||
            n.destinatario.toLowerCase().includes(t) ||
            n.pedido.includes(t);
          if (!casa) return false;
        }
        return true;
      }),
    [busca, canalFiltro, situacaoFiltro],
  );

  const temFiltro = Boolean(busca || canalFiltro || situacaoFiltro);
  const limparFiltros = () => {
    setBusca("");
    setCanalFiltro("");
    setSituacaoFiltro("");
  };

  const rotuloCompetencia =
    COMPETENCIAS.find((c) => c.valor === competencia)?.texto ?? competencia;

  const alternarMarcada = (chave: string) =>
    setMarcadas((m) => {
      const proximo = new Set(m);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  return (
    // `min-w-0` na raiz: a tela inteira é filha do `<main>` do admin, e sem isso a
    // largura mínima do conteúdo vaza para fora da janela. Ver o defeito 1 no topo.
    <div className="cz-tarefas mx-auto min-w-0 max-w-[1760px] space-y-4 p-4 sm:p-5">
      <Cabecalho
        compacto
        titulo="Faturamento (XML)"
        acoes={
          <>
            <Botao variante="secundario" icone="History" tamanho="sm">
              Histórico (12 meses)
            </Botao>
            <Botao variante="secundario" icone="Settings" tamanho="sm">
              Séries e canais
            </Botao>
            <Botao icone="UploadCloud">Importar XMLs</Botao>
          </>
        }
      />

      {/* ------------------- Contexto: empresa + competência ----------------- */}

      <div className="flex flex-col gap-4 rounded-[14px] border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] px-5 py-4 shadow-[var(--cz-elev-1)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[var(--cz-laranja-suave)] text-[var(--cz-laranja-forte)] ring-1 ring-inset ring-[var(--cz-laranja-borda)]"
          >
            <Icone nome="Landmark" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold leading-tight text-[var(--cz-texto)]">
              {EMPRESA.razaoSocial}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--cz-texto-suave)]">
              <span className="cz-num">{EMPRESA.cnpj}</span>
              <span aria-hidden="true">·</span>
              <span>{EMPRESA.regime}</span>
              <span aria-hidden="true">·</span>
              <span>{rotuloCompetencia}</span>
            </p>
          </div>
        </div>

        {/* Largura fixa nos dois campos: sem ela, "Empresa" e "Competência"
            ficam com larguras diferentes porque o conteúdo das opções difere. */}
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:w-[24rem]">
          <Escolha
            rotulo="Empresa"
            opcoes={[{ valor: "nexus", texto: EMPRESA.razaoSocial }]}
            value="nexus"
            onChange={() => undefined}
          />
          <Escolha
            rotulo="Competência"
            opcoes={COMPETENCIAS}
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </div>
      </div>

      <Abas abas={ABAS} ativa={aba} onMudar={(c) => !ABAS_PENDENTES.has(c) && setAba(c)} />

      {/* ------------------------------ Cartões ----------------------------- */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          titulo="Apurado pelos XMLs"
          valor={real(APURADO)}
          icone="FileSpreadsheet"
          tom="verde"
          detalhe={`${inteiro(NOTAS_VALIDAS)} notas de venda`}
        />
        <CartaoKpi
          titulo="Faturamento declarado"
          valor={real(valorDeclarado)}
          icone="Landmark"
          tom="azul"
          detalhe={origem === "xml" ? "Igual ao apurado" : "Informado manualmente"}
        />
        <CartaoKpi
          titulo="Arquivos lidos"
          valor={inteiro(ARQUIVOS_LIDOS)}
          icone="Files"
          tom="laranja"
          detalhe={`${inteiro(NOTAS_VALIDAS)} somam · ${NOTAS_CANCELADAS} canceladas`}
        />
        <CartaoKpi
          titulo="Divergência"
          valor={real(divergencia)}
          icone="AlertTriangle"
          tom={semDivergencia ? "cinza" : "vermelho"}
          detalhe="declarado − apurado"
          variacao={
            semDivergencia
              ? undefined
              : { valor: Number(divergenciaPct.toFixed(1)), positivoEhBom: false }
          }
        />
      </div>

      {/* ------------------------------- Corpo ------------------------------ */}

      {/* `min-w-0` nas DUAS colunas. É a parte do conserto do scroll duplo que
          não dá para esquecer: item de grid tem `min-width: auto` e não encolhe
          abaixo da largura mínima do conteúdo. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-4">
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {/* ------------------------ Importar ------------------------- */}
            <Painel titulo="Importar XMLs" descricao="Arquivos soltos ou .zip" denso>
              <div className="min-w-0 space-y-3 p-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastando(true);
                  }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastando(false);
                  }}
                  className={`flex flex-col items-center justify-center rounded-[12px] border border-dashed px-4 py-6 text-center transition-colors ${
                    arrastando
                      ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)]"
                      : "border-[var(--cz-hairline-forte)] bg-[#FCFCFD]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="mb-2.5 grid h-12 w-12 place-items-center rounded-full border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] text-[var(--cz-laranja-forte)]"
                  >
                    <Icone nome="UploadCloud" className="h-5 w-5" />
                  </span>
                  <p className="text-[13.5px] font-bold text-[var(--cz-texto)]">
                    Arraste os arquivos aqui
                  </p>
                  <p className="mt-1 max-w-[17rem] text-[12px] leading-relaxed text-[var(--cz-texto-suave)]">
                    NF-e e NFC-e. Reenviar o mesmo arquivo não duplica nada.
                  </p>
                  <div className="mt-3">
                    <Botao variante="secundario" icone="FolderOpen" tamanho="sm">
                      Selecionar arquivos
                    </Botao>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {[
                    "Lê chave, série, número, emissão, CFOP e valor",
                    "Casa o CNPJ do emitente com a carteira",
                    "Recusa duplicata pela chave de acesso",
                    "Aplica o cancelamento, que vem em arquivo separado",
                  ].map((texto) => (
                    <li
                      key={texto}
                      className="flex items-start gap-2 text-[12px] leading-snug text-[var(--cz-texto-suave)]"
                    >
                      <Icone
                        nome="CheckCircle2"
                        className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600"
                      />
                      <span>{texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Painel>

            {/* ------------------ Faturamento declarado ------------------ */}
            <Painel
              titulo="Faturamento declarado"
              descricao="O valor que vai para a apuração e para a declaração de 12 meses."
              denso
            >
              <div className="min-w-0 space-y-3 p-4">
                <div className="rounded-[12px] border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-emerald-900">
                    Apurado pelos XMLs
                  </p>
                  <p className="cz-valor mt-1 text-[22px] leading-none text-emerald-800">
                    {real(APURADO)}
                  </p>
                </div>

                <fieldset className="space-y-1.5">
                  <legend className="sr-only">Origem do faturamento declarado</legend>
                  {[
                    { valor: "xml" as const, texto: "Usar o apurado pelos XMLs" },
                    { valor: "manual" as const, texto: "Informar manualmente" },
                  ].map((opcao) => (
                    <label
                      key={opcao.valor}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-1 py-1 text-[13px] text-[var(--cz-texto)] transition-colors hover:bg-[var(--cz-fundo)]"
                    >
                      <input
                        type="radio"
                        name="origem-faturamento"
                        checked={origem === opcao.valor}
                        onChange={() => setOrigem(opcao.valor)}
                        className="h-4 w-4 accent-[var(--cz-laranja)]"
                      />
                      <span>{opcao.texto}</span>
                    </label>
                  ))}
                </fieldset>

                {/* O campo só existe quando é ele que manda: campo editável ao
                    lado de um rádio que o ignora convida a digitar um valor que
                    não será usado. */}
                {origem === "manual" && (
                  <div className="min-w-0 space-y-3 rounded-[12px] border border-[var(--cz-hairline)] bg-[#FCFCFD] p-3.5">
                    <Entrada
                      rotulo="Valor a declarar"
                      inputMode="decimal"
                      value={declarado}
                      onChange={(e) => setDeclarado(e.target.value)}
                      className="cz-num"
                    />
                    <Area
                      rotulo="Justificativa"
                      rows={3}
                      maxLength={500}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Receita de serviço em NFS-e, ainda não importada."
                      ajuda={`Obrigatória quando difere do apurado · ${observacao.length}/500`}
                    />
                    {!semDivergencia && (
                      <p className="flex items-start gap-2 text-[12px] leading-snug text-amber-900">
                        <Icone
                          nome="AlertTriangle"
                          className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600"
                        />
                        <span>
                          Difere do apurado em{" "}
                          <strong className="cz-num">{real(divergencia)}</strong> (
                          {divergenciaPct.toFixed(1)}%). Fica registrado com a
                          justificativa.
                        </span>
                      </p>
                    )}
                  </div>
                )}

                <Botao
                  icone="Save"
                  larguraCheia
                  disabled={origem === "manual" && !observacao.trim()}
                  title={
                    origem === "manual" && !observacao.trim()
                      ? "Valor manual exige justificativa"
                      : undefined
                  }
                >
                  Salvar faturamento declarado
                </Botao>
              </div>
            </Painel>
          </div>

          {/* ----------------------- Notas da competência ------------------ */}

          <Painel
            titulo="Notas fiscais da competência"
            descricao={`${inteiro(NOTAS_VALIDAS)} notas de venda. Canceladas aparecem na lista e não entram na soma.`}
            acoes={
              <Botao variante="secundario" icone="Download" tamanho="sm">
                Exportar
              </Botao>
            }
          >
            {/* Os três campos descem do mesmo `Campo`, então rótulo, altura e
                raio saem de um lugar só. Ver o defeito 2 no topo do arquivo. */}
            <div className="grid min-w-0 items-end gap-3 border-b border-[var(--cz-hairline)] p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Entrada
                rotulo="Buscar"
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nº, chave, destinatário ou pedido"
              />
              <Escolha
                rotulo="Canal"
                vazio="Todos"
                opcoes={CANAIS.map((c) => ({ valor: c.chave, texto: c.rotulo }))}
                value={canalFiltro}
                onChange={(e) => setCanalFiltro(e.target.value)}
              />
              <Escolha
                rotulo="Situação"
                vazio="Todas"
                opcoes={[
                  { valor: "AUTORIZADA", texto: "Autorizada" },
                  { valor: "CANCELADA", texto: "Cancelada" },
                ]}
                value={situacaoFiltro}
                onChange={(e) => setSituacaoFiltro(e.target.value)}
              />
              {/* `mb-px` alinha o botão com a BASE dos campos: `items-end` alinha
                  as caixas, e o campo tem um rótulo acima que o botão não tem. */}
              <Botao
                variante="secundario"
                icone="RotateCcw"
                onClick={limparFiltros}
                disabled={!temFiltro}
                className="mb-px"
              >
                Limpar
              </Botao>
            </div>

            {visiveis.length === 0 ? (
              <div className="p-4">
                <Vazio
                  icone="Search"
                  titulo="Nenhuma nota com esses filtros"
                  descricao="Limpe os filtros para ver as notas da competência."
                  acao={
                    <Botao
                      variante="secundario"
                      icone="RotateCcw"
                      tamanho="sm"
                      onClick={limparFiltros}
                    >
                      Limpar filtros
                    </Botao>
                  }
                />
              </div>
            ) : (
              // `min-w-0` no rolador e tabela de SETE colunas em vez de nove: o
              // scroll horizontal fica DENTRO daqui em telas estreitas em vez de
              // empurrar a página. Ver o defeito 1 no topo.
              <div className="cz-rolagem min-w-0 overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                      <th scope="col" className="w-9 px-3 py-2.5">
                        <span className="sr-only">Selecionar</span>
                      </th>
                      <th scope="col" className="px-3 py-2.5">Nota</th>
                      <th scope="col" className="px-3 py-2.5">Canal</th>
                      <th scope="col" className="px-3 py-2.5">Destinatário</th>
                      <th scope="col" className="px-3 py-2.5">Situação</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Valor</th>
                      <th scope="col" className="w-20 px-3 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cz-hairline)]">
                    {visiveis.map((nota) => {
                      const cancelada = nota.situacao === "CANCELADA";
                      return (
                        <tr
                          key={nota.chave}
                          className="transition-colors hover:bg-[#FCFCFD]"
                        >
                          <td className="px-3 py-2.5 align-top">
                            <input
                              type="checkbox"
                              checked={marcadas.has(nota.chave)}
                              onChange={() => alternarMarcada(nota.chave)}
                              aria-label={`Selecionar a nota ${nota.numero}`}
                              className="mt-0.5 h-4 w-4 accent-[var(--cz-laranja)]"
                            />
                          </td>

                          {/* Número, série, data e pedido na MESMA célula. Eram
                              quatro colunas, e quatro colunas de dado curto é o
                              que fazia a tabela pedir 992px de largura. */}
                          <td className="whitespace-nowrap px-3 py-2.5 align-top">
                            <span className="cz-num font-bold text-[var(--cz-texto)]">
                              {nota.numero}
                            </span>
                            <span className="cz-num text-[11.5px] text-[var(--cz-texto-fraco)]">
                              {" "}/ {nota.serie}
                            </span>
                            <span className="cz-num mt-0.5 block text-[11px] text-[var(--cz-texto-suave)]">
                              {nota.emissao} · CFOP {nota.cfop}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <Canal chave={nota.canal} />
                            {/* O pedido vem do NOME do arquivo e é a única ponte
                                entre nota e venda de marketplace. Seção 12.4 do
                                plano. */}
                            <span className="cz-num mt-0.5 block text-[11px] text-[var(--cz-texto-fraco)]">
                              pedido {nota.pedido}
                            </span>
                          </td>

                          <td className="min-w-0 max-w-[15rem] px-3 py-2.5 align-top">
                            <span className="block truncate text-[var(--cz-texto)]">
                              {nota.destinatario}
                            </span>
                            <span className="text-[11px] text-[var(--cz-texto-fraco)]">
                              {nota.documento}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <Selo tom={cancelada ? "critico" : "bom"}>
                              {cancelada ? "Cancelada" : "Autorizada"}
                            </Selo>
                          </td>

                          <td
                            className={`cz-num whitespace-nowrap px-3 py-2.5 text-right align-top font-bold ${
                              cancelada
                                ? "text-[var(--cz-texto-fraco)] line-through"
                                : "text-[var(--cz-texto)]"
                            }`}
                          >
                            {real(nota.valor)}
                          </td>

                          <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                            <span className="inline-flex items-center gap-0.5">
                              <Botao
                                variante="fantasma"
                                tamanho="sm"
                                icone="Download"
                                aria-label={`Baixar o XML da nota ${nota.numero}`}
                              />
                              <Botao
                                variante="fantasma"
                                tamanho="sm"
                                icone="MoreHorizontal"
                                aria-label={`Mais ações da nota ${nota.numero}`}
                              />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-4 py-2.5 text-[12.5px] text-[var(--cz-texto-suave)]">
              <span>
                <strong className="cz-num text-[var(--cz-texto)]">{visiveis.length}</strong>{" "}
                de{" "}
                <strong className="cz-num text-[var(--cz-texto)]">
                  {inteiro(NOTAS_VALIDAS)}
                </strong>{" "}
                notas
                {marcadas.size > 0 && (
                  <>
                    {" · "}
                    <strong className="text-[var(--cz-laranja-forte)]">
                      {marcadas.size} selecionada{marcadas.size > 1 ? "s" : ""}
                    </strong>
                  </>
                )}
              </span>
            </div>
          </Painel>
        </div>

        {/* ------------------------------ Coluna ----------------------------- */}

        <div className="min-w-0 space-y-4">
          <Painel
            titulo="Por canal"
            descricao="O canal vem do mapa série → canal, não do XML."
            denso
          >
            <div className="min-w-0 space-y-3 p-4">
              <BarraParticipacao canais={CANAIS} total={APURADO} />

              <ul className="divide-y divide-[var(--cz-hairline)] border-t border-[var(--cz-hairline)]">
                {CANAIS.map((canal) => (
                  <li
                    key={canal.chave}
                    className={`flex items-center gap-3 py-2.5 ${
                      canal.notas === 0 ? "opacity-55" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <Canal chave={canal.chave} />
                      <span className="cz-num mt-0.5 block pl-8 text-[11px] text-[var(--cz-texto-fraco)]">
                        {canal.series.length > 0
                          ? `série ${canal.series.join(", ")} · ${inteiro(canal.notas)} notas`
                          : "sem série mapeada"}
                      </span>
                    </div>
                    <span className="cz-num shrink-0 text-[12.5px] font-bold text-[var(--cz-texto)]">
                      {real(canal.valor)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-[var(--cz-hairline-forte)] pt-2.5 text-[12.5px] font-bold">
                <span>Total</span>
                <span className="cz-num">{real(APURADO)}</span>
              </div>
            </div>
          </Painel>

          {/* Painel que a maquete não tem, e é o que impede "366 de 822" de
              parecer arquivo perdido. */}
          <Painel
            titulo="Fora do faturamento"
            descricao={`${inteiro(ARQUIVOS_LIDOS)} arquivos lidos, ${inteiro(NOTAS_VALIDAS)} somam.`}
            denso
          >
            <ul className="divide-y divide-[var(--cz-hairline)]">
              {IGNORADOS.map((item) => (
                <li key={item.rotulo} className="min-w-0 px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--cz-texto)]">
                      {item.rotulo}
                    </span>
                    <span className="cz-num shrink-0 text-[11.5px] text-[var(--cz-texto-suave)]">
                      {item.quantos} · {real(item.valor)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--cz-texto-suave)]">
                    {item.motivo}
                  </p>
                </li>
              ))}
            </ul>
          </Painel>

          <Painel titulo="Ações" denso>
            <div className="space-y-2 p-4">
              <Botao variante="secundario" icone="FileText" larguraCheia>
                Gerar declaração (12 meses)
              </Botao>
              <Botao variante="secundario" icone="Download" larguraCheia>
                Baixar XMLs da competência
              </Botao>
              <Botao variante="secundario" icone="Settings" larguraCheia>
                Mapear séries e canais
              </Botao>
            </div>
          </Painel>

          <Painel
            titulo="Histórico recente"
            denso
            verTudo={{ href: "/admin/tarefas/auditoria" }}
          >
            <ul className="divide-y divide-[var(--cz-hairline)]">
              {HISTORICO.map((linha) => (
                <li key={linha.texto} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Icone nome={linha.icone} className={`mt-px h-3.5 w-3.5 shrink-0 ${linha.tom}`} />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium leading-snug text-[var(--cz-texto)]">
                      {linha.texto}
                    </p>
                    <p className="cz-num mt-0.5 text-[11px] text-[var(--cz-texto-fraco)]">
                      {linha.quando}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Painel>
        </div>
      </div>
    </div>
  );
}
