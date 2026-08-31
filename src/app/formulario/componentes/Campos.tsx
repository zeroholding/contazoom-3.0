"use client";

/**
 * Campos próprios do formulário público de abertura de CNPJ.
 *
 * O que já existe em `ui/tarefas/Campos.tsx` é reaproveitado direto. Aqui só
 * entra o que não existia: endereço com busca por CEP, moeda em centavos,
 * pergunta de duas opções com alvo grande, e slot de upload com dono.
 *
 * Ficam nesta pasta, e não em `ui/tarefas/`, porque hoje só esta tela usa. Subir
 * para o compartilhado antes de existir um segundo uso é abstrair no escuro —
 * quando a segunda tela precisar, o formato certo já vai estar claro.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Entrada, EntradaDocumento, Escolha } from "@/app/components/views/ui/tarefas/Campos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import { somenteDigitos } from "@/lib/documento";
import {
  ACCEPT_ANEXO,
  TAMANHO_MAXIMO_BYTES,
  iconeDoAnexo,
  tamanhoLegivel,
  validarTipo,
} from "@/lib/tarefa-anexo";
import { buscarCep, cepEmCache } from "@/lib/cep";
import {
  UF_OPCOES,
  centavosDeTexto,
  mascaraMoeda,
  textoDeCentavos,
  type Endereco,
  type Erros,
} from "@/lib/formulario-abertura";

/* -------------------------------------------------------------------------- */
/*                            Pergunta de duas opções                         */
/* -------------------------------------------------------------------------- */

/**
 * Sim/Não como par de botões, não como `select`.
 *
 * Duas opções num `select` custam três toques no celular (abrir, escolher,
 * fechar) e escondem a resposta atual atrás de um clique. Como botão, a resposta
 * fica visível e o toque é um só.
 *
 * `null` é estado legítimo: significa "não respondeu", e é diferente de "Não".
 * O formulário antigo perguntava "Sócio(s) possui(em) Conta GOV?" uma única vez
 * para o grupo inteiro — com dois sócios e só um tendo conta, não havia resposta
 * certa. Aqui a pergunta é de cada pessoa.
 */
export function Binaria({
  rotulo,
  ajuda,
  valor,
  onMudar,
  erro,
  textoSim = "Sim",
  textoNao = "Não",
  obrigatorio = true,
  className = "",
}: {
  rotulo: string;
  ajuda?: string;
  valor: boolean | null;
  onMudar: (valor: boolean) => void;
  erro?: string | null;
  textoSim?: string;
  textoNao?: string;
  obrigatorio?: boolean;
  className?: string;
}) {
  const id = useId();

  const base =
    "inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-[10px] border px-4 text-[0.9375rem] font-semibold transition-colors sm:flex-none sm:min-w-[7rem]";
  const ativo = "border-[#F26212] bg-[#FFF2E9] text-[#C2410C]";
  const inerte =
    "border-[#DCE0E7] bg-white text-[#4B5563] hover:border-[#B9C0CB] hover:text-[#14161B]";

  return (
    <div className={className}>
      {/* `role="group"` com rótulo próprio: não é um `label` de campo único, são
          dois botões que respondem à mesma pergunta. */}
      <div
        role="group"
        aria-labelledby={`${id}-rotulo`}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
      >
        <p
          id={`${id}-rotulo`}
          className="mb-[0.4375rem] flex items-baseline gap-1 text-sm font-semibold leading-5 text-[#1F2430]"
        >
          {rotulo}
          {obrigatorio && (
            <span className="text-[#D92D20]" aria-hidden="true">
              *
            </span>
          )}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            aria-pressed={valor === true}
            onClick={() => onMudar(true)}
            className={`${base} ${valor === true ? ativo : inerte}`}
          >
            {valor === true && <Icone nome="CheckCircle2" className="h-4 w-4" />}
            {textoSim}
          </button>
          <button
            type="button"
            aria-pressed={valor === false}
            onClick={() => onMudar(false)}
            className={`${base} ${valor === false ? ativo : inerte}`}
          >
            {valor === false && <Icone nome="CheckCircle2" className="h-4 w-4" />}
            {textoNao}
          </button>
        </div>
      </div>
      {erro ? (
        <p
          id={`${id}-erro`}
          className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]"
        >
          <Icone nome="AlertTriangle" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{erro}</span>
        </p>
      ) : ajuda ? (
        <p id={`${id}-ajuda`} className="mt-1.5 text-xs leading-5 text-[#6B7280]">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Escolha em cartão                             */
/* -------------------------------------------------------------------------- */

/** Opção em cartão, para escolha de 2 a 3 itens com explicação em cada um. */
export function EscolhaCartao<T extends string>({
  rotulo,
  opcoes,
  valor,
  onMudar,
  erro,
  obrigatorio = true,
}: {
  rotulo: string;
  opcoes: { valor: T; texto: string; descricao?: string; icone?: string }[];
  valor: T | "";
  onMudar: (valor: T) => void;
  erro?: string | null;
  obrigatorio?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`}>
        <p
          id={`${id}-rotulo`}
          className="mb-[0.4375rem] flex items-baseline gap-1 text-sm font-semibold leading-5 text-[#1F2430]"
        >
          {rotulo}
          {obrigatorio && (
            <span className="text-[#D92D20]" aria-hidden="true">
              *
            </span>
          )}
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {opcoes.map((o) => {
            const marcada = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => onMudar(o.valor)}
                className={`flex min-h-[3.25rem] items-start gap-3 rounded-[12px] border p-3.5 text-left transition-colors ${
                  marcada
                    ? "border-[#F26212] bg-[#FFF2E9]"
                    : "border-[#DCE0E7] bg-white hover:border-[#B9C0CB]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full border-2 ${
                    marcada ? "border-[#F26212]" : "border-[#C6CCD6]"
                  }`}
                >
                  {marcada && (
                    <span className="h-2 w-2 rounded-full bg-[#F26212]" />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[0.9375rem] font-semibold leading-5 ${
                      marcada ? "text-[#C2410C]" : "text-[#14161B]"
                    }`}
                  >
                    {o.texto}
                  </span>
                  {o.descricao && (
                    <span className="mt-0.5 block text-xs leading-5 text-[#6B7280]">
                      {o.descricao}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {erro && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]">
          <Icone nome="AlertTriangle" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{erro}</span>
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Campo de moeda                                */
/* -------------------------------------------------------------------------- */

/**
 * Capital em centavos, mascarado da direita para a esquerda.
 *
 * O valor no estado é INTEIRO em centavos; o texto do campo é derivado. Guardar
 * `number` decimal faria a soma dos sócios não fechar com o total mostrado
 * embaixo, e é o total que vai no contrato social.
 */
export function CampoMoeda({
  rotulo,
  centavos,
  onMudar,
  erro,
  required,
  ajuda,
  wrapperClassName,
}: {
  rotulo: string;
  centavos: number;
  onMudar: (centavos: number) => void;
  erro?: string | null;
  required?: boolean;
  ajuda?: string;
  wrapperClassName?: string;
}) {
  return (
    <Entrada
      rotulo={rotulo}
      required={required}
      erro={erro}
      ajuda={ajuda}
      wrapperClassName={wrapperClassName}
      inputMode="numeric"
      autoComplete="off"
      placeholder="0,00"
      // `cz-num` para o dígito não dançar de largura enquanto a pessoa digita.
      className="cz-num"
      value={textoDeCentavos(centavos)}
      onChange={(e) => onMudar(centavosDeTexto(mascaraMoeda(e.target.value)))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                          Endereço com busca de CEP                         */
/* -------------------------------------------------------------------------- */

type EstadoBusca = "parado" | "buscando" | "ok" | "falhou";

/**
 * Endereço estruturado, com o CEP preenchendo o resto.
 *
 * O formulário antigo tinha "Endereço Completo com CEP" num campo de texto. O
 * resultado eram endereços sem número, sem bairro, e CEP de bairro no lugar do
 * CEP da rua — o dado que vai para a JUCESP.
 *
 * Decisões que valem registrar:
 *
 *   - dispara no 8º dígito, sem esperar sair do campo: quem digita CEP já
 *     espera que algo aconteça, e esperar o blur parece que não funcionou;
 *   - o foco vai para NÚMERO ao encontrar, que é o único campo que a busca não
 *     sabe. Sem isso a pessoa precisa achar o campo certo no meio de sete;
 *   - os campos preenchidos continuam EDITÁVEIS. O ViaCEP erra em loteamento
 *     novo, e travar transformaria endereço errado em endereço impossível de
 *     corrigir;
 *   - número e complemento sobrevivem a uma nova busca: são da pessoa, não do
 *     CEP;
 *   - nada aqui bloqueia o avanço. Com a API fora, o endereço vai à mão.
 */
export function CampoEndereco({
  valor,
  onMudar,
  erros,
  prefixo,
  autoCompletePrefixo = "",
}: {
  valor: Endereco;
  onMudar: (endereco: Endereco) => void;
  erros: Erros;
  /** Prefixo das chaves de erro: `socios.0.endereco` ou `empresa`. */
  prefixo: string;
  autoCompletePrefixo?: string;
}) {
  const [estado, setEstado] = useState<EstadoBusca>("parado");
  const [aviso, setAviso] = useState("");

  const refNumero = useRef<HTMLDivElement>(null);

  // Guarda o último CEP buscado para não repetir a busca a cada re-render do
  // pai, que acontece a cada tecla em qualquer campo do formulário.
  const ultimoBuscado = useRef("");

  /**
   * `valor` e `onMudar` em refs.
   *
   * Os dois trocam de identidade a cada tecla do formulário inteiro. Se
   * entrassem nas dependências do efeito, ele reexecutaria sem parar; se fossem
   * lidos do closure sem ref, a busca aplicaria o endereço sobre um estado velho
   * e apagaria o que a pessoa digitou enquanto a requisição estava em voo.
   */
  const valorRef = useRef(valor);
  valorRef.current = valor;
  const mudarRef = useRef(onMudar);
  mudarRef.current = onMudar;

  const digitos = somenteDigitos(valor.cep);

  useEffect(() => {
    if (digitos.length !== 8) {
      ultimoBuscado.current = "";
      setEstado("parado");
      setAviso("");
      return;
    }
    if (ultimoBuscado.current === digitos) return;
    ultimoBuscado.current = digitos;

    /** Só o que vem do CEP. Número e complemento são da pessoa, ficam intactos. */
    const aplicar = (
      logradouro: string,
      bairro: string,
      cidade: string,
      uf: string
    ) => {
      const atual = valorRef.current;
      mudarRef.current({
        ...atual,
        logradouro: logradouro || atual.logradouro,
        bairro: bairro || atual.bairro,
        cidade: cidade || atual.cidade,
        uf: uf || atual.uf,
      });
    };

    const cacheado = cepEmCache(digitos);
    if (cacheado) {
      aplicar(cacheado.logradouro, cacheado.bairro, cacheado.cidade, cacheado.uf);
      setEstado("ok");
      setAviso("");
      return;
    }

    // Sem abortar a busca anterior, digitar um CEP, apagar e digitar outro deixa
    // duas requisições correndo, e a primeira pode responder DEPOIS da segunda —
    // preenchendo o endereço errado, sem nenhum sinal na tela.
    const controlador = new AbortController();

    setEstado("buscando");
    setAviso("");

    buscarCep(digitos, controlador.signal).then((r) => {
      if (controlador.signal.aborted) return;
      if (r.ok) {
        aplicar(
          r.endereco.logradouro,
          r.endereco.bairro,
          r.endereco.cidade,
          r.endereco.uf
        );
        setEstado("ok");
        setAviso("");
        // O foco vai para Número, o único campo que a busca não sabe preencher.
        refNumero.current?.querySelector<HTMLInputElement>("input")?.focus();
      } else {
        setEstado("falhou");
        setAviso(r.mensagem);
      }
    });

    return () => controlador.abort();
  }, [digitos]);

  const campo = (chave: keyof Endereco) => (novo: string) =>
    onMudar({ ...valor, [chave]: novo });

  const erro = (nome: string) => erros[`${prefixo}.${nome}`] ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="relative">
          <EntradaDocumento
            tipo="cep"
            rotulo="CEP"
            required
            value={valor.cep}
            onChange={campo("cep")}
            erro={erro("cep")}
            autoComplete={`${autoCompletePrefixo}postal-code`}
          />
          {estado === "buscando" && (
            // O spinner fica DENTRO do campo, alinhado com o input e não com o
            // bloco: o rótulo tem altura própria, e centralizar no bloco jogaria
            // o spinner para cima do rótulo.
            <span
              className="pointer-events-none absolute right-3 top-[2.4rem] text-[#9AA1AC]"
              aria-hidden="true"
            >
              <Icone nome="Loader" className="h-4 w-4 animate-spin" />
            </span>
          )}
          {estado === "ok" && !erro("cep") && (
            <span
              className="pointer-events-none absolute right-3 top-[2.4rem] text-[#D9500A]"
              aria-hidden="true"
            >
              <Icone nome="CheckCircle2" className="h-4 w-4" />
            </span>
          )}
        </div>

        <Entrada
          rotulo="Rua"
          required
          wrapperClassName="sm:col-span-2"
          value={valor.logradouro}
          onChange={(e) => campo("logradouro")(e.target.value)}
          erro={erro("logradouro")}
          autoComplete={`${autoCompletePrefixo}address-line1`}
          placeholder="Preenchido pelo CEP"
        />
      </div>

      {aviso && (
        // `role="status"` e não `alert`: é informação de apoio, e o formulário
        // continua funcionando com o endereço digitado à mão.
        <p
          role="status"
          className="flex items-start gap-2 rounded-[10px] border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs font-medium leading-5 text-[#B54708]"
        >
          <Icone nome="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{aviso}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <div ref={refNumero}>
          <Entrada
            rotulo="Número"
            required
            value={valor.numero}
            onChange={(e) => campo("numero")(e.target.value)}
            erro={erro("numero")}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <Entrada
          rotulo="Complemento"
          value={valor.complemento}
          onChange={(e) => campo("complemento")(e.target.value)}
          placeholder="Apto, sala, fundos"
          autoComplete="off"
        />
        <Entrada
          rotulo="Bairro"
          required
          value={valor.bairro}
          onChange={(e) => campo("bairro")(e.target.value)}
          erro={erro("bairro")}
          autoComplete={`${autoCompletePrefixo}address-level2`}
        />
        <div className="grid grid-cols-[1fr_5.5rem] gap-3">
          <Entrada
            rotulo="Cidade"
            required
            value={valor.cidade}
            onChange={(e) => campo("cidade")(e.target.value)}
            erro={erro("cidade")}
            autoComplete={`${autoCompletePrefixo}address-level2`}
          />
          <Escolha
            rotulo="UF"
            required
            vazio="—"
            opcoes={UF_OPCOES}
            value={valor.uf}
            onChange={(e) => campo("uf")(e.target.value)}
            erro={erro("uf")}
          />
        </div>
      </div>
    </div>
  );
}

/** Endereço em leitura, para quando é copiado de outro lugar. */
export function EnderecoEmLeitura({
  titulo,
  linha,
  acao,
}: {
  titulo: string;
  linha: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-[#EDEFF3] bg-[#F8F9FB] px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-[#9AA1AC]">
          <Icone nome="MapPin" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            {titulo}
          </p>
          <p className="mt-0.5 text-[0.9375rem] leading-6 text-[#14161B]">
            {linha}
          </p>
        </div>
      </div>
      {acao}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Slot de documento                               */
/* -------------------------------------------------------------------------- */

/**
 * Área de upload de UM documento, de UMA pessoa.
 *
 * O Google Forms pedia "RG ou CNH do(s) Sócio(s) — até 5 arquivos, 100 MB por
 * item": chegavam quatro fotos `IMG_2841.jpg` e ninguém sabia de quem era
 * nenhuma, e ninguém precisa de 100 MB para fotografar um RG.
 *
 * Aqui o slot sabe o que é e de quem é, o teto é 20 MB (`TAMANHO_MAXIMO_BYTES`,
 * o mesmo dos anexos de tarefa) e a lista branca é a de `tarefa-anexo.ts`.
 * Arquivo recusado não derruba os outros do mesmo lote — recusar cinco arquivos
 * porque um era `.zip` é o tipo de coisa que faz a pessoa desistir.
 */
export function SlotDocumento({
  rotulo,
  ajuda,
  obrigatorio,
  arquivos,
  onMudar,
  erro,
}: {
  rotulo: string;
  ajuda?: string;
  obrigatorio: boolean;
  arquivos: File[];
  onMudar: (arquivos: File[]) => void;
  erro?: string | null;
}) {
  const id = useId();
  const [arrastando, setArrastando] = useState(false);
  const [recusados, setRecusados] = useState<string[]>([]);

  function receber(lista: FileList | null) {
    if (!lista?.length) return;
    const aceitos: File[] = [];
    const negados: string[] = [];

    Array.from(lista).forEach((arquivo) => {
      if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
        negados.push(
          `${arquivo.name}: ${tamanhoLegivel(arquivo.size)}, acima do limite de ${tamanhoLegivel(TAMANHO_MAXIMO_BYTES)}`
        );
        return;
      }
      const tipo = validarTipo(arquivo.type, arquivo.name);
      if (!tipo.ok) {
        negados.push(`${arquivo.name}: ${tipo.erro}`);
        return;
      }
      aceitos.push(arquivo);
    });

    setRecusados(negados);
    if (aceitos.length) onMudar([...arquivos, ...aceitos]);
  }

  const vazio = arquivos.length === 0;

  return (
    <div className="border-t border-[#EDEFF3] pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-baseline gap-1 text-sm font-semibold leading-5 text-[#1F2430]">
          {rotulo}
          {obrigatorio ? (
            <span className="text-[#D92D20]" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="text-xs font-medium text-[#9AA1AC]">(opcional)</span>
          )}
        </p>
        {!vazio && (
          <span className="cz-num text-xs font-semibold text-[#D9500A]">
            {arquivos.length}{" "}
            {arquivos.length === 1 ? "arquivo" : "arquivos"}
          </span>
        )}
      </div>

      {ajuda && (
        <p className="mt-1 text-xs leading-5 text-[#6B7280]">{ajuda}</p>
      )}

      {!vazio && (
        <ul className="mt-2.5 space-y-2">
          {arquivos.map((arquivo, i) => (
            <li
              key={`${arquivo.name}-${arquivo.lastModified}-${i}`}
              className="flex items-center gap-3 rounded-[10px] border border-[#EDEFF3] bg-white px-3 py-2.5"
            >
              <span className="shrink-0 text-[#6B7280]" aria-hidden="true">
                <Icone
                  nome={iconeDoAnexo(arquivo.type)}
                  className="h-[1.125rem] w-[1.125rem]"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] font-medium text-[#14161B]">
                  {arquivo.name}
                </span>
                <span className="cz-num block text-xs text-[#6B7280]">
                  {tamanhoLegivel(arquivo.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onMudar(arquivos.filter((_, j) => j !== i))}
                aria-label={`Remover ${arquivo.name}`}
                // Sem confirmação: nada foi enviado ainda, e confirmar remoção
                // de algo que só existe na memória do navegador é atrito puro.
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#9AA1AC] transition-colors hover:bg-[#FEF2F2] hover:text-[#B42318]"
              >
                <Icone nome="Trash2" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          receber(e.dataTransfer.files);
        }}
        className={`mt-2.5 flex min-h-[3.5rem] cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-dashed px-4 py-3 text-center transition-colors ${
          arrastando
            ? "border-[#F26212] bg-[#FFF2E9]"
            : erro
            ? "border-[#FDA29B] bg-[#FEF2F2] hover:border-[#F97066]"
            : "border-[#C6CCD6] bg-[#F8F9FB] hover:border-[#F26212] hover:bg-[#FFF2E9]"
        }`}
      >
        <Icone
          nome="Upload"
          className={`h-4 w-4 shrink-0 ${erro ? "text-[#B42318]" : "text-[#6B7280]"}`}
        />
        <span
          className={`text-[0.875rem] font-medium ${erro ? "text-[#B42318]" : "text-[#4B5563]"}`}
        >
          {/* "toque" antes de "arraste": no celular arrastar não existe, e o
              celular é o caso principal desta tela. */}
          {vazio ? "Toque para escolher ou arraste aqui" : "Adicionar outro arquivo"}
        </span>
        <input
          id={id}
          type="file"
          multiple
          accept={ACCEPT_ANEXO}
          className="sr-only"
          onChange={(e) => {
            receber(e.target.files);
            // Zera o input: sem isso, escolher o MESMO arquivo de novo depois de
            // removê-lo não dispara `change`, porque o valor não mudou.
            e.target.value = "";
          }}
        />
      </label>

      {erro && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]">
          <Icone nome="AlertTriangle" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{erro}</span>
        </p>
      )}

      {recusados.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {recusados.map((texto) => (
            <li
              key={texto}
              className="flex items-start gap-1.5 text-xs font-medium text-[#B54708]"
            >
              <Icone nome="AlertTriangle" className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
