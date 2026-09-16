"use client";

/**
 * Faturamento (XML) — apuração do faturamento mensal a partir de nota fiscal.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTA TELA É FRONT-END SÓ. NADA AQUI FALA COM O SERVIDOR.
 *
 * O back-end não existe: não há model, rota nem migration. O plano está em
 * `docs/PLANO_XML_FATURAMENTO.md`. Ela foi montada para a decisão de LAYOUT ser
 * tomada olhando a tela em vez de um desenho, e para o desenho ser conferido
 * contra o dado real antes de existir código de servidor.
 *
 * OS NÚMEROS SÃO REAIS, e é o que torna a maquete útil. Saíram de
 * `scripts/diagnostico-xml.ts` rodado sobre os 822 XMLs de agosto/2026 da conta
 * CINGAPURA (NEXUS GROUP LTDA): 366 notas de venda, R$ 62.514,16. Números
 * bonitos e inventados esconderiam justamente o que a tela precisa mostrar — que
 * um mês tem 361 CT-e de frete no meio, que o cancelamento vem em arquivo
 * separado e que Shopee e TikTok ainda não têm XML importado.
 *
 * Toda interação escreve em estado local e nada mais: importar não importa,
 * salvar não salva. Onde a ação for de mentira, a tela DIZ que é.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DECISÕES DE DESENHO QUE DIVERGEM DA MAQUETE, E POR QUE
 *
 * 1. O NÚMERO DOS CARTÕES NÃO É COLORIDO. A maquete pinta os quatro (verde,
 *    azul, roxo, vermelho). `CartaoKpi` já resolveu isso no produto e escreveu o
 *    motivo: numa grade, todo número colorido disputa com o vizinho e nenhum
 *    vence. A cor fica no ÍCONE (`tom`) e na variação — onde ela informa. A
 *    divergência, que é a única com julgamento, mantém o sinal em vermelho pela
 *    `variacao`.
 *
 * 2. "CANAL DE VENDA" NÃO VEM DO XML. Isto é achado do diagnóstico, não escolha
 *    estética: a NF-e não tem campo de marketplace. Nesta base a série é sempre
 *    2 e tudo saiu da pasta do Mercado Livre. O canal só pode vir do MAPA
 *    série -> canal, que é o que o botão "Configurar séries/canais" configura. A
 *    tela diz isso na cara, em vez de exibir uma coluna que parece dado da nota.
 *
 * 3. AS ABAS QUE AINDA NÃO TÊM CONTEÚDO DIZEM "em breve" NO PRÓPRIO RÓTULO, e o
 *    clique nelas não faz nada. `Abas` não tem estado desabilitado, e inventar um
 *    aqui mexeria num componente compartilhado por causa de uma maquete. Aba que
 *    parece clicável e não muda a tela é pior que aba marcada como pendente.
 */

import { useMemo, useState } from "react";

import {
  Cabecalho,
  CartaoKpi,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import { Abas, Area, Botao, Escolha } from "@/app/components/views/ui/tarefas/Campos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { Selo } from "@/app/components/views/comum/shell";

/* -------------------------------------------------------------------------- */
/*                          Dado da maquete (real)                            */
/* -------------------------------------------------------------------------- */

/** Empresa e competência do diagnóstico. Ver o cabeçalho do arquivo. */
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
 * Canais. `notas: 0` em três deles é a verdade de hoje: Shopee e TikTok seguem
 * em `.zip` e "Site próprio" não existe nesta operação.
 *
 * A cor é a da marca do canal, e não uma paleta sequencial: é o que faz achar a
 * linha do Mercado Livre sem ler o rótulo. Mesma regra do menu do NEXUS.
 */
const CANAIS = [
  { chave: "ml", rotulo: "Mercado Livre", cor: "#FFE600", aro: "#E6CF00", notas: 366, valor: 62514.16, series: ["2"] },
  { chave: "shopee", rotulo: "Shopee", cor: "#EE4D2D", aro: "#EE4D2D", notas: 0, valor: 0, series: [] },
  { chave: "tiktok", rotulo: "TikTok Shop", cor: "#111827", aro: "#111827", notas: 0, valor: 0, series: [] },
  { chave: "outros", rotulo: "Outros / sem série mapeada", cor: "#D1D5DB", aro: "#D1D5DB", notas: 0, valor: 0, series: [] },
];

const APURADO = 62514.16;
const DECLARADO_INICIAL = "62.514,16";
const NOTAS_TOTAL = 372; // 366 autorizadas + 3 canceladas + 3 eventos
const NOTAS_VALIDAS = 366;
const NOTAS_CANCELADAS = 3;

/** O que o diagnóstico recusou, e por quê. É a coluna de honestidade da tela. */
const IGNORADOS = [
  { rotulo: "CT-e de frete (modelo 57)", quantos: 361, valor: 12569, motivo: "Emitido pelo Mercado Livre contra a empresa. É custo, não receita." },
  { rotulo: "Retorno simbólico do FULL", quantos: 63, valor: 3026.8, motivo: "Entrada. Mercadoria voltando do depósito." },
  { rotulo: "Remessa para o FULL", quantos: 21, valor: 756.7, motivo: "Saída autorizada, mas CFOP fora da faixa de venda (5949/6949/6905)." },
  { rotulo: "Devolução", quantos: 5, valor: 2182, motivo: "finNFe = 4. Entrada de mercadoria devolvida." },
  { rotulo: "Canceladas", quantos: 3, valor: 697.8, motivo: "Evento 110111 em arquivo separado. O XML da nota ainda diz cStat 100." },
];

/**
 * Cinco linhas da tabela, com os dados de notas reais da amostra.
 *
 * Cinco e não trinta: a maquete mostra cinco, a paginação diz o total, e trinta
 * linhas de mentira no arquivo não ensinariam nada a mais sobre o layout.
 */
const NOTAS = [
  { chave: "35260850506775000101550020000077861819229697", emissao: "01/08/2026", numero: "7786", serie: "2", canal: "ml", cfop: "6108", destinatario: "Everaldo dos Santos", documento: "CPF", situacao: "AUTORIZADA", valor: 32.9, pedido: "6643625021" },
  { chave: "35260850506775000101550020000077881277486064", emissao: "01/08/2026", numero: "7788", serie: "2", canal: "ml", cfop: "6108", destinatario: "Consumidor final", documento: "CPF", situacao: "AUTORIZADA", valor: 79.9, pedido: "6648929887" },
  { chave: "35260850506775000101550020000079671618921416", emissao: "04/08/2026", numero: "7967", serie: "2", canal: "ml", cfop: "6108", destinatario: "Consumidor final", documento: "CPF", situacao: "CANCELADA", valor: 249.9, pedido: "6745636266" },
  { chave: "35260850506775000101550020000082021580921602", emissao: "11/08/2026", numero: "8202", serie: "2", canal: "ml", cfop: "5102", destinatario: "Comércio Xpto Ltda", documento: "CNPJ", situacao: "CANCELADA", valor: 159, pedido: "6849521636" },
  { chave: "35260850506775000101550020000082391128857934", emissao: "12/08/2026", numero: "8239", serie: "2", canal: "ml", cfop: "6106", destinatario: "Consumidor final", documento: "CPF", situacao: "AUTORIZADA", valor: 320, pedido: "6876605759" },
];

const HISTORICO = [
  { icone: "CheckCircle2", tom: "text-emerald-600", texto: "Importação de XML concluída", quando: "822 arquivos · hoje 15:20" },
  { icone: "FileText", tom: "text-[var(--cz-texto-suave)]", texto: "Faturamento declarado atualizado", quando: "R$ 62.514,16 · hoje 14:10" },
  { icone: "UploadCloud", tom: "text-sky-600", texto: "3 XMLs de cancelamento importados", quando: "hoje 11:32" },
  { icone: "Settings", tom: "text-[var(--cz-texto-suave)]", texto: "Série 2 mapeada para Mercado Livre", quando: "ontem 16:45" },
];

/* -------------------------------------------------------------------------- */
/*                                 Formatação                                 */
/* -------------------------------------------------------------------------- */

const real = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const inteiro = (v: number) => v.toLocaleString("pt-BR");

/** "62.514,16" -> 62514.16. Aceita o campo vazio e o meio-caminho da digitação. */
function paraNumero(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------------------------- */
/*                              Peças da tela                                 */
/* -------------------------------------------------------------------------- */

/** Bolinha da marca do canal. Fio próprio porque o amarelo do ML some no branco. */
function PontoCanal({ chave }: { chave: string }) {
  const canal = CANAIS.find((c) => c.chave === chave);
  if (!canal) return null;
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset"
      style={{ backgroundColor: canal.cor, boxShadow: `inset 0 0 0 1px ${canal.aro}` }}
    />
  );
}

function NomeCanal({ chave }: { chave: string }) {
  const canal = CANAIS.find((c) => c.chave === chave);
  return (
    <span className="inline-flex items-center gap-2">
      <PontoCanal chave={chave} />
      <span className="truncate">{canal?.rotulo ?? "—"}</span>
    </span>
  );
}

/**
 * Rosca de participação por canal.
 *
 * SVG à mão, ~30 linhas, em vez de biblioteca: são quatro fatias sem interação e
 * `Graficos.tsx` só tem roscas amarradas a status de competência. `RoscaStatus`
 * ali não aceita fatia arbitrária.
 *
 * `strokeDasharray` sobre um círculo, com `rotate(-90)` para a primeira fatia
 * começar no topo — é a mesma técnica do donut do NEXUS.
 */
function Rosca({ fatias }: { fatias: { rotulo: string; valor: number; cor: string }[] }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const raio = 54;
  const circunferencia = 2 * Math.PI * raio;

  if (total <= 0) {
    return (
      <p className="py-6 text-center text-[12.5px] text-[var(--cz-texto-suave)]">
        Sem faturamento apurado na competência.
      </p>
    );
  }

  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <svg viewBox="0 0 140 140" width={140} height={140} role="img" aria-label="Participação por canal">
          <circle cx={70} cy={70} r={raio} fill="none" stroke="#EEF1F4" strokeWidth={20} />
          {fatias.map((f) => {
            const fracao = f.valor / total;
            const traco = fracao * circunferencia;
            const deslocamento = -acumulado * circunferencia;
            acumulado += fracao;
            if (f.valor <= 0) return null;
            return (
              <circle
                key={f.rotulo}
                cx={70}
                cy={70}
                r={raio}
                fill="none"
                stroke={f.cor}
                strokeWidth={20}
                strokeDasharray={`${traco} ${circunferencia - traco}`}
                strokeDashoffset={deslocamento}
                transform="rotate(-90 70 70)"
                strokeLinecap={fatias.filter((x) => x.valor > 0).length > 1 ? "butt" : "round"}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="cz-valor text-[15px] leading-none">{real(total)}</span>
          <span className="mt-1 text-[10.5px] text-[var(--cz-texto-suave)]">apurado</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2 text-[12.5px]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: f.cor }}
            />
            <span className="min-w-0 flex-1 truncate text-[var(--cz-texto-suave)]">{f.rotulo}</span>
            <span className="cz-num shrink-0 font-bold text-[var(--cz-texto)]">
              {total > 0 ? `${((f.valor / total) * 100).toFixed(1)}%` : "0%"}
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

/** Abas sem conteúdo ainda. Ver a decisão 3 no topo do arquivo. */
const ABAS_PENDENTES = new Set(["canais", "ajustes", "historico", "declaracao"]);

const ABAS = [
  { chave: "geral", texto: "Visão geral" },
  { chave: "notas", texto: "Notas fiscais", contagem: NOTAS_VALIDAS },
  { chave: "canais", texto: "Faturamento por canal/série" },
  { chave: "ajustes", texto: "Ajustes manuais" },
  { chave: "historico", texto: "Histórico" },
  { chave: "declaracao", texto: "Declaração de faturamento" },
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

  const canaisComValor = CANAIS.filter((c) => c.valor > 0);
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
    <div className="cz-tarefas mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6">
      {/* `compacto`: o cabeçalho do admin já escreve "Faturamento (XML)" e o
          subtítulo da rota. Aqui entram só as ações. */}
      <Cabecalho
        compacto
        titulo="Faturamento (XML)"
        acoes={
          <>
            <Botao variante="secundario" icone="History" tamanho="sm">
              Histórico (12 meses)
            </Botao>
            <Botao variante="secundario" icone="Settings" tamanho="sm">
              Configurar séries/canais
            </Botao>
            <Botao icone="UploadCloud">Importar XMLs</Botao>
          </>
        }
      />

      {/* ---------------------- Contexto: empresa + mês --------------------- */}

      <Painel denso>
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
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
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--cz-texto-suave)]">
                <span className="cz-num">CNPJ {EMPRESA.cnpj}</span>
                <span aria-hidden="true">·</span>
                <span>{EMPRESA.regime}</span>
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[26rem]">
            <Escolha
              rotulo="Empresa"
              opcoes={[{ valor: "nexus", texto: EMPRESA.razaoSocial }]}
              value="nexus"
              onChange={() => undefined}
              ajuda="Maquete: uma empresa só"
            />
            <Escolha
              rotulo="Competência"
              opcoes={COMPETENCIAS}
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
        </div>
      </Painel>

      <Abas abas={ABAS} ativa={aba} onMudar={(c) => !ABAS_PENDENTES.has(c) && setAba(c)} />

      {/* A faixa NÃO é decoração: é o que impede alguém de olhar esta tela e
          concluir que o módulo está pronto. */}
      <div className="flex items-start gap-3 rounded-[14px] border border-dashed border-[var(--cz-laranja-borda)] bg-[var(--cz-laranja-suave)] px-4 py-3">
        <Icone
          nome="Info"
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cz-laranja-forte)]"
        />
        <p className="text-[12.5px] leading-relaxed text-[#7C3A0B]">
          <strong>Maquete de layout, sem back-end.</strong> Importar e salvar não
          gravam nada. Os números são reais, apurados por{" "}
          <code className="cz-num rounded bg-white/70 px-1">scripts/diagnostico-xml.ts</code>{" "}
          sobre os 822 XMLs de {rotuloCompetencia} da conta CINGAPURA. Plano do
          back-end em <code className="cz-num rounded bg-white/70 px-1">docs/PLANO_XML_FATURAMENTO.md</code>.
        </p>
      </div>

      {/* ------------------------------ Cartões ---------------------------- */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          titulo="Faturamento apurado (XMLs)"
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
          titulo="Documentos no período"
          valor={inteiro(NOTAS_TOTAL)}
          icone="Files"
          tom="laranja"
          detalhe={`${inteiro(NOTAS_VALIDAS)} válidas · ${NOTAS_CANCELADAS} canceladas`}
        />
        <CartaoKpi
          titulo="Divergência"
          valor={real(divergencia)}
          icone="AlertTriangle"
          tom={Math.abs(divergencia) < 0.01 ? "cinza" : "vermelho"}
          detalhe="declarado − apurado"
          variacao={
            Math.abs(divergencia) < 0.01
              ? undefined
              : { valor: Number(divergenciaPct.toFixed(1)), positivoEhBom: false }
          }
        />
      </div>

      {/* ------------------------------- Corpo ----------------------------- */}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* ----------------------- Importar ------------------------- */}
            <Painel titulo="Importar XMLs" descricao="Arquivos individuais ou .zip">
              <div className="space-y-4 p-5">
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
                  className={`flex flex-col items-center justify-center rounded-[14px] border border-dashed px-5 py-8 text-center transition-colors ${
                    arrastando
                      ? "border-[var(--cz-laranja)] bg-[var(--cz-laranja-suave)]"
                      : "border-[var(--cz-hairline-forte)] bg-[#FCFCFD]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="mb-3 grid h-14 w-14 place-items-center rounded-full border border-[var(--cz-hairline)] bg-[var(--cz-superficie)] text-[var(--cz-laranja-forte)]"
                  >
                    <Icone nome="UploadCloud" className="h-6 w-6" />
                  </span>
                  <p className="text-[14px] font-bold text-[var(--cz-texto)]">
                    Arraste os arquivos aqui
                  </p>
                  <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                    XML de NF-e e NFC-e, soltos ou dentro de .zip. Reenviar o mesmo
                    arquivo não duplica nada.
                  </p>
                  <div className="mt-4">
                    <Botao variante="secundario" icone="FolderOpen" tamanho="sm">
                      Selecionar arquivos
                    </Botao>
                  </div>
                </div>

                <ul className="space-y-2">
                  {[
                    "Lê chave, série, número, emissão, CFOP e valor",
                    "Casa o CNPJ do emitente com a carteira",
                    "Recusa duplicata pela chave de acesso",
                    "Cancelamento vem em arquivo separado e é aplicado à nota",
                  ].map((texto) => (
                    <li
                      key={texto}
                      className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[var(--cz-texto-suave)]"
                    >
                      <Icone
                        nome="CheckCircle2"
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
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
              descricao="O valor que vai para a apuração contábil e para a declaração de 12 meses."
            >
              <div className="space-y-4 p-5">
                <div className="rounded-[12px] border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <p className="text-[12px] font-medium text-emerald-900">
                    Apurado pelos XMLs
                  </p>
                  <p className="cz-valor mt-1 text-[22px] leading-none text-emerald-800">
                    {real(APURADO)}
                  </p>
                </div>

                <fieldset className="space-y-2">
                  <legend className="sr-only">Origem do faturamento declarado</legend>
                  {[
                    { valor: "xml" as const, texto: "Usar o faturamento apurado pelos XMLs" },
                    { valor: "manual" as const, texto: "Informar manualmente" },
                  ].map((opcao) => (
                    <label
                      key={opcao.valor}
                      className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--cz-texto)]"
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

                {/* O campo só aparece quando é ele que manda. Campo editável ao
                    lado de um rádio que o ignora é o convite a digitar um valor
                    que não será usado. */}
                {origem === "manual" && (
                  <div className="space-y-3 rounded-[12px] border border-[var(--cz-hairline)] bg-[#FCFCFD] p-4">
                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--cz-texto-suave)]">
                        Valor a declarar
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-[var(--cz-texto-suave)]">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={declarado}
                          onChange={(e) => setDeclarado(e.target.value)}
                          className="cz-num w-full rounded-[10px]"
                        />
                      </div>
                    </label>

                    <Area
                      rotulo="Justificativa"
                      rows={3}
                      maxLength={500}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Receita de serviço em NFS-e, ainda não importada pelo sistema."
                      ajuda={`Obrigatória quando o valor difere do apurado. ${observacao.length}/500`}
                    />
                  </div>
                )}

                {origem === "manual" && Math.abs(divergencia) >= 0.01 && (
                  <div className="flex items-start gap-2.5 rounded-[12px] border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                    <Icone
                      nome="AlertTriangle"
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    />
                    <p className="text-[12.5px] leading-relaxed text-amber-900">
                      O valor declarado difere do apurado em{" "}
                      <strong className="cz-num">{real(divergencia)}</strong> (
                      {divergenciaPct.toFixed(1)}%). A diferença fica registrada com a
                      justificativa e aparece no histórico.
                    </p>
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
            descricao={`${inteiro(NOTAS_VALIDAS)} notas de venda em ${rotuloCompetencia}. Canceladas aparecem na lista e não entram na soma.`}
            acoes={
              <Botao variante="secundario" icone="Download" tamanho="sm">
                Exportar
              </Botao>
            }
          >
            <div className="grid gap-3 border-b border-[var(--cz-hairline)] p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="relative sm:col-span-2 lg:col-span-2">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--cz-texto-suave)]">
                  Buscar
                </span>
                <Icone
                  nome="Search"
                  className="pointer-events-none absolute bottom-[0.7rem] left-3 h-4 w-4 text-[var(--cz-texto-fraco)]"
                />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nº da nota, chave, destinatário ou pedido"
                  className="w-full rounded-[10px] pl-9"
                />
              </label>

              <Escolha
                rotulo="Canal"
                vazio="Todos os canais"
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
            </div>

            {visiveis.length === 0 ? (
              <div className="p-5">
                <Vazio
                  icone="Search"
                  titulo="Nenhuma nota com esses filtros"
                  descricao="A maquete carrega cinco notas de exemplo. Limpe os filtros para vê-las."
                  acao={
                    <Botao
                      variante="secundario"
                      icone="RotateCcw"
                      tamanho="sm"
                      onClick={() => {
                        setBusca("");
                        setCanalFiltro("");
                        setSituacaoFiltro("");
                      }}
                    >
                      Limpar filtros
                    </Botao>
                  }
                />
              </div>
            ) : (
              <div className="cz-rolagem overflow-x-auto">
                <table className="w-full min-w-[62rem] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--cz-hairline)] bg-[var(--cz-fundo)] text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                      <th scope="col" className="w-10 px-4 py-3">
                        <span className="sr-only">Selecionar</span>
                      </th>
                      <th scope="col" className="px-3 py-3">Emissão</th>
                      <th scope="col" className="px-3 py-3">Nº / Série</th>
                      <th scope="col" className="px-3 py-3">Canal</th>
                      <th scope="col" className="px-3 py-3">CFOP</th>
                      <th scope="col" className="px-3 py-3">Destinatário</th>
                      <th scope="col" className="px-3 py-3">Situação</th>
                      <th scope="col" className="px-3 py-3 text-right">Valor</th>
                      <th scope="col" className="px-3 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cz-hairline)]">
                    {visiveis.map((nota) => {
                      const cancelada = nota.situacao === "CANCELADA";
                      return (
                        <tr
                          key={nota.chave}
                          className="transition-colors hover:bg-[var(--cz-laranja-suave)]/40"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={marcadas.has(nota.chave)}
                              onChange={() => alternarMarcada(nota.chave)}
                              aria-label={`Selecionar a nota ${nota.numero}`}
                              className="h-4 w-4 accent-[var(--cz-laranja)]"
                            />
                          </td>
                          <td className="cz-num whitespace-nowrap px-3 py-3 text-[var(--cz-texto-suave)]">
                            {nota.emissao}
                          </td>
                          <td className="px-3 py-3">
                            <span className="cz-num font-bold text-[var(--cz-texto)]">
                              {nota.numero}
                            </span>
                            <span className="cz-num ml-1.5 text-[11.5px] text-[var(--cz-texto-fraco)]">
                              / {nota.serie}
                            </span>
                            {/* O pedido do marketplace vem do NOME do arquivo, e é
                                a única ponte entre nota e venda. Ver seção 12.4 do
                                plano. */}
                            <span className="cz-num mt-0.5 block text-[11px] text-[var(--cz-texto-fraco)]">
                              pedido {nota.pedido}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <NomeCanal chave={nota.canal} />
                          </td>
                          <td className="cz-num px-3 py-3 text-[var(--cz-texto-suave)]">
                            {nota.cfop}
                          </td>
                          <td className="max-w-[14rem] px-3 py-3">
                            <span className="block truncate text-[var(--cz-texto)]">
                              {nota.destinatario}
                            </span>
                            <span className="text-[11px] text-[var(--cz-texto-fraco)]">
                              {nota.documento}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <Selo tom={cancelada ? "critico" : "bom"}>
                              {cancelada ? "Cancelada" : "Autorizada"}
                            </Selo>
                          </td>
                          <td
                            className={`cz-num whitespace-nowrap px-3 py-3 text-right font-bold ${
                              cancelada
                                ? "text-[var(--cz-texto-fraco)] line-through"
                                : "text-[var(--cz-texto)]"
                            }`}
                          >
                            {real(nota.valor)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">
                            <span className="inline-flex items-center gap-1">
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cz-hairline)] bg-[var(--cz-fundo)] px-5 py-2.5 text-[12.5px] text-[var(--cz-texto-suave)]">
              <span>
                Mostrando{" "}
                <strong className="cz-num text-[var(--cz-texto)]">{visiveis.length}</strong> de{" "}
                <strong className="cz-num text-[var(--cz-texto)]">{inteiro(NOTAS_VALIDAS)}</strong>{" "}
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
              <span className="text-[var(--cz-texto-fraco)]">
                Paginação entra com a rota — a maquete traz cinco notas
              </span>
            </div>
          </Painel>
        </div>

        {/* ------------------------------ Coluna ----------------------------- */}

        <div className="space-y-5">
          <Painel
            titulo="Resumo por canal"
            descricao="O canal vem do mapa série → canal, não do XML."
            denso
          >
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--cz-hairline)] text-left text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cz-texto-suave)]">
                  <th scope="col" className="px-4 py-2.5">Canal</th>
                  <th scope="col" className="px-2 py-2.5 text-right">Notas</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Faturamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cz-hairline)]">
                {CANAIS.map((canal) => (
                  <tr key={canal.chave} className={canal.notas === 0 ? "opacity-60" : ""}>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <PontoCanal chave={canal.chave} />
                        <span className="truncate">{canal.rotulo}</span>
                      </span>
                      {canal.series.length > 0 && (
                        <span className="cz-num mt-0.5 block text-[11px] text-[var(--cz-texto-fraco)]">
                          série {canal.series.join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="cz-num px-2 py-2.5 text-right">{inteiro(canal.notas)}</td>
                    <td className="cz-num px-4 py-2.5 text-right font-bold text-[var(--cz-texto)]">
                      {real(canal.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--cz-hairline-forte)] bg-[var(--cz-fundo)] text-[12.5px] font-bold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="cz-num px-2 py-2.5 text-right">{inteiro(NOTAS_VALIDAS)}</td>
                  <td className="cz-num px-4 py-2.5 text-right">{real(APURADO)}</td>
                </tr>
              </tfoot>
            </table>
          </Painel>

          <Painel titulo="Participação por canal" denso>
            <div className="p-4">
              <Rosca
                fatias={canaisComValor.map((c) => ({
                  rotulo: c.rotulo,
                  valor: c.valor,
                  cor: c.cor,
                }))}
              />
            </div>
          </Painel>

          {/* Esta é a coluna que a maquete não tem, e é a mais importante da
              tela: sem ela, "366 de 822 arquivos" parece arquivo perdido. */}
          <Painel
            titulo="Fora do faturamento"
            descricao="822 arquivos importados, 366 somam. O resto tem motivo."
            denso
          >
            <ul className="divide-y divide-[var(--cz-hairline)]">
              {IGNORADOS.map((item) => (
                <li key={item.rotulo} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-semibold text-[var(--cz-texto)]">
                      {item.rotulo}
                    </span>
                    <span className="cz-num shrink-0 text-[12px] text-[var(--cz-texto-suave)]">
                      {item.quantos} · {real(item.valor)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--cz-texto-suave)]">
                    {item.motivo}
                  </p>
                </li>
              ))}
            </ul>
          </Painel>

          <Painel titulo="Histórico recente" denso verTudo={{ href: "/admin/tarefas/auditoria" }}>
            <ul className="divide-y divide-[var(--cz-hairline)]">
              {HISTORICO.map((linha) => (
                <li key={linha.texto} className="flex items-start gap-2.5 px-4 py-3">
                  <Icone nome={linha.icone} className={`mt-0.5 h-4 w-4 shrink-0 ${linha.tom}`} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium leading-snug text-[var(--cz-texto)]">
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

          <Painel titulo="Ações rápidas" denso>
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
        </div>
      </div>
    </div>
  );
}
