"use client";

/**
 * Campos compostos do formulário de abertura: pergunta de duas opções, escolha
 * em cartão, moeda, endereço com CEP e slot de documento.
 *
 * Todos montados sobre `Base.tsx`, o kit próprio desta tela. O kit do painel
 * (`ui/tarefas/Campos.tsx`) não serve aqui: ele é de densidade — rótulo de 13px
 * cravado num span interno, campo de 40px, seis filtros por fileira. Ver o
 * comentário de cabeçalho de `Base.tsx`.
 */

import { useEffect, useId, useRef, useState } from "react";
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
import {
  CampoDocumento,
  CampoSelect,
  CampoTexto,
  Nota,
} from "./Base";

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
 * `null` é estado legítimo e diferente de "Não": significa "não respondeu". O
 * formulário antigo perguntava "Sócio(s) possui(em) Conta GOV?" uma vez para o
 * grupo inteiro — com dois sócios e só um tendo, não havia resposta certa.
 */
export function Binaria({
  rotulo,
  ajuda,
  valor,
  onMudar,
  erro,
  textoSim = "Sim",
  textoNao = "Não",
  className = "",
}: {
  rotulo: string;
  ajuda?: string;
  valor: boolean | null;
  onMudar: (valor: boolean) => void;
  erro?: string | null;
  textoSim?: string;
  textoNao?: string;
  className?: string;
}) {
  const id = useId();

  const base =
    "cz-campo-foco inline-flex min-h-[3.25rem] flex-1 items-center justify-center gap-2 rounded-[12px] border px-5 text-[0.9375rem] font-semibold transition-colors duration-150 sm:max-w-[10rem]";
  const marcado =
    "border-[#F26212] bg-[#FFF4EC] text-[#C2410C] shadow-[inset_0_0_0_1px_#F26212]";
  const inerte =
    "border-[#D8DDE5] bg-white text-[#475467] hover:border-[#B4BCC9] hover:text-[#101828]";

  return (
    <div className={className}>
      {/* `radiogroup` e não dois botões soltos: é uma pergunta com duas
          respostas mutuamente exclusivas, e o leitor de tela precisa ouvir isso. */}
      <div
        role="radiogroup"
        aria-labelledby={`${id}-rotulo`}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
      >
        <p
          id={`${id}-rotulo`}
          className="flex items-baseline gap-1.5 text-[0.9375rem] font-semibold leading-5 text-[#101828]"
        >
          {rotulo}
          <span
            className="text-[0.9375rem] font-semibold text-[#F04438]"
            aria-hidden="true"
          >
            *
          </span>
        </p>

        <div className="mt-2 flex gap-3">
          {[
            { v: true, texto: textoSim },
            { v: false, texto: textoNao },
          ].map(({ v, texto }) => (
            <button
              key={texto}
              type="button"
              role="radio"
              aria-checked={valor === v}
              onClick={() => onMudar(v)}
              className={`${base} ${valor === v ? marcado : inerte}`}
            >
              {valor === v && (
                <Icone nome="CheckCircle2" className="h-[1.125rem] w-[1.125rem]" />
              )}
              {texto}
            </button>
          ))}
        </div>
      </div>

      {erro ? (
        <p
          id={`${id}-erro`}
          className="mt-2 flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-5 text-[#B42318]"
        >
          <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </p>
      ) : ajuda ? (
        <p
          id={`${id}-ajuda`}
          className="mt-2 text-[0.8125rem] leading-5 text-[#667085]"
        >
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Escolha em cartão                             */
/* -------------------------------------------------------------------------- */

/** Escolha de 2 ou 3 itens em que cada opção precisa de explicação. */
export function EscolhaCartao<T extends string>({
  rotulo,
  ajuda,
  opcoes,
  valor,
  onMudar,
  erro,
}: {
  rotulo: string;
  ajuda?: string;
  opcoes: { valor: T; texto: string; descricao?: string }[];
  valor: T | "";
  onMudar: (valor: T) => void;
  erro?: string | null;
}) {
  const id = useId();
  return (
    <div>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`}>
        <p
          id={`${id}-rotulo`}
          className="flex items-baseline gap-1.5 text-[0.9375rem] font-semibold leading-5 text-[#101828]"
        >
          {rotulo}
          <span
            className="text-[0.9375rem] font-semibold text-[#F04438]"
            aria-hidden="true"
          >
            *
          </span>
        </p>
        {ajuda && (
          <p className="mt-1 text-[0.8125rem] leading-5 text-[#667085]">{ajuda}</p>
        )}

        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          {opcoes.map((o) => {
            const marcada = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => onMudar(o.valor)}
                className={`cz-campo-foco flex items-start gap-3 rounded-[12px] border p-4 text-left transition-colors duration-150 ${
                  marcada
                    ? "border-[#F26212] bg-[#FFF4EC] shadow-[inset_0_0_0_1px_#F26212]"
                    : "border-[#D8DDE5] bg-white hover:border-[#B4BCC9]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    marcada ? "border-[#F26212]" : "border-[#C6CCD6]"
                  }`}
                >
                  {marcada && (
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F26212]" />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[0.9375rem] font-semibold leading-5 ${
                      marcada ? "text-[#C2410C]" : "text-[#101828]"
                    }`}
                  >
                    {o.texto}
                  </span>
                  {o.descricao && (
                    <span className="mt-1 block text-[0.8125rem] leading-5 text-[#667085]">
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
        <p className="mt-2 flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-5 text-[#B42318]">
          <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
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
 * O valor no estado é INTEIRO em centavos e o texto do campo é derivado. Guardar
 * decimal faria a soma dos sócios não fechar com o total mostrado embaixo, e é o
 * total que vai no contrato social.
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
    <CampoTexto
      rotulo={rotulo}
      required={required}
      erro={erro}
      ajuda={ajuda}
      wrapperClassName={wrapperClassName}
      inputMode="numeric"
      autoComplete="off"
      placeholder="0,00"
      // O recuo do "R$" vem de `cz-campo-icone`, aplicado pelo `CampoTexto` por
      // causa do `prefixoTexto`. Utilitária `pl-*` aqui perderia para o
      // `padding-inline` do bloco global, que não está em `@layer`.
      className="cz-num font-semibold tracking-[0.01em]"
      value={textoDeCentavos(centavos)}
      onChange={(e) => onMudar(centavosDeTexto(mascaraMoeda(e.target.value)))}
      prefixoTexto="R$"
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
 * O formulário antigo tinha "Endereço Completo com CEP" num campo de texto só.
 * Voltavam endereços sem número, sem bairro, e com o CEP do bairro em vez do da
 * rua — o dado que vai para a JUCESP.
 *
 * Decisões que valem registrar:
 *
 *   - dispara no 8º dígito, sem esperar sair do campo: quem digita CEP já espera
 *     que algo aconteça, e esperar o blur parece que não funcionou;
 *   - o foco vai para NÚMERO ao encontrar, o único campo que a busca não sabe.
 *     Sem isso a pessoa procura o campo certo no meio de sete;
 *   - os campos preenchidos continuam EDITÁVEIS. O ViaCEP erra em loteamento
 *     novo, e travar transformaria endereço errado em endereço impossível de
 *     corrigir;
 *   - número e complemento sobrevivem a uma nova busca: são da pessoa, não do CEP;
 *   - nada aqui bloqueia o avanço. Com a API fora, o endereço vai à mão.
 *
 * GRADE: 12 colunas com `span` explícito.
 *
 * A versão anterior usava `sm:grid-cols-4` com um grid ANINHADO na última célula
 * para Cidade + UF. Na largura do cartão isso estourava, e a UF saía cortada
 * fora da borda — foi o "texto cortado" que apareceu no teste. Grade única
 * resolve porque nenhuma célula depende da sobra de outra.
 */
export function CampoEndereco({
  valor,
  onMudar,
  erros,
  prefixo,
}: {
  valor: Endereco;
  onMudar: (endereco: Endereco) => void;
  erros: Erros;
  /** Prefixo das chaves de erro: `socios.0.endereco` ou `empresa`. */
  prefixo: string;
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
   * Os dois trocam de identidade a cada tecla do formulário inteiro. Nas
   * dependências do efeito, ele reexecutaria sem parar; lidos do closure sem
   * ref, a resposta da busca aplicaria o endereço sobre um estado velho e
   * apagaria o que a pessoa digitou enquanto a requisição estava em voo.
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
      {/* 12 colunas, spans explícitos. Nada aninhado. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
        <CampoDocumento
          tipo="cep"
          rotulo="CEP"
          icone="MapPin"
          required
          value={valor.cep}
          onChange={campo("cep")}
          erro={erro("cep")}
          autoComplete="postal-code"
          wrapperClassName="sm:col-span-4"
          ajuda={estado === "ok" ? "Endereço encontrado." : undefined}
          sufixo={
            estado === "buscando" ? (
              <Icone
                nome="Loader"
                className="h-[1.125rem] w-[1.125rem] animate-spin text-[#98A2B3]"
              />
            ) : estado === "ok" && !erro("cep") ? (
              <Icone
                nome="CheckCircle2"
                className="h-[1.125rem] w-[1.125rem] text-[#D9500A]"
              />
            ) : undefined
          }
        />

        <CampoTexto
          rotulo="Rua"
          required
          wrapperClassName="sm:col-span-8"
          value={valor.logradouro}
          onChange={(e) => campo("logradouro")(e.target.value)}
          erro={erro("logradouro")}
          autoComplete="address-line1"
          placeholder={
            estado === "buscando" ? "Buscando…" : "Preenchido pelo CEP"
          }
        />

        <div ref={refNumero} className="sm:col-span-3">
          <CampoTexto
            rotulo="Número"
            required
            value={valor.numero}
            onChange={(e) => campo("numero")(e.target.value)}
            erro={erro("numero")}
            inputMode="numeric"
            autoComplete="off"
            placeholder="123"
            className="cz-num"
          />
        </div>

        <CampoTexto
          rotulo="Complemento"
          opcional
          wrapperClassName="sm:col-span-4"
          value={valor.complemento}
          onChange={(e) => campo("complemento")(e.target.value)}
          placeholder="Apto, sala, fundos"
          autoComplete="off"
        />

        <CampoTexto
          rotulo="Bairro"
          required
          wrapperClassName="sm:col-span-5"
          value={valor.bairro}
          onChange={(e) => campo("bairro")(e.target.value)}
          erro={erro("bairro")}
          autoComplete="address-level3"
          placeholder="Preenchido pelo CEP"
        />

        {/* Cidade e UF são células IRMÃS da mesma grade, não um grid dentro de
            uma célula. Era o grid aninhado que cortava a UF fora do cartão. */}
        <CampoTexto
          rotulo="Cidade"
          required
          wrapperClassName="sm:col-span-8"
          value={valor.cidade}
          onChange={(e) => campo("cidade")(e.target.value)}
          erro={erro("cidade")}
          autoComplete="address-level2"
          placeholder="Preenchido pelo CEP"
        />

        <CampoSelect
          rotulo="UF"
          required
          vazio="—"
          opcoes={UF_OPCOES}
          wrapperClassName="sm:col-span-4"
          value={valor.uf}
          onChange={(e) => campo("uf")(e.target.value)}
          erro={erro("uf")}
        />
      </div>

      {aviso && <Nota tom="atencao">{aviso}</Nota>}
    </div>
  );
}

/** Endereço em leitura, para quando é copiado de outro lugar. */
export function EnderecoEmLeitura({
  titulo,
  linha,
}: {
  titulo: string;
  linha: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-[#E7EAEF] bg-[#F7F8FA] px-4 py-3.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[#E7EAEF] bg-white text-[#667085]"
      >
        <Icone nome="MapPin" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-semibold text-[#667085]">{titulo}</p>
        <p className="mt-0.5 text-[0.9375rem] leading-6 text-[#101828]">{linha}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Slot de documento                               */
/* -------------------------------------------------------------------------- */

/**
 * Área de upload de UM documento, de UMA pessoa.
 *
 * O Google Forms pedia "RG ou CNH do(s) Sócio(s) — até 5 arquivos aceitos, o
 * tamanho máximo é de 100 MB por item": chegavam quatro fotos `IMG_2841.jpg` e
 * ninguém sabia de quem era nenhuma, e ninguém precisa de 100 MB para fotografar
 * um RG.
 *
 * Aqui o slot sabe o que é e de quem é, o teto é 20 MB
 * (`TAMANHO_MAXIMO_BYTES`, o mesmo dos anexos de tarefa) e a lista branca é a de
 * `tarefa-anexo.ts`. Arquivo recusado não derruba os outros do mesmo lote —
 * recusar cinco porque um era `.zip` é o tipo de coisa que faz desistir.
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
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-baseline gap-1.5 text-[0.9375rem] font-semibold leading-5 text-[#101828]">
          {rotulo}
          {obrigatorio ? (
            <span className="text-[#F04438]" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="text-[0.8125rem] font-medium text-[#98A2B3]">
              opcional
            </span>
          )}
        </p>
        {!vazio && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4EC] px-2.5 py-1 text-[0.75rem] font-bold text-[#C2410C]">
            <Icone nome="CheckCircle2" className="h-3.5 w-3.5" />
            <span className="cz-num">
              {arquivos.length} {arquivos.length === 1 ? "arquivo" : "arquivos"}
            </span>
          </span>
        )}
      </div>

      {ajuda && (
        <p className="mt-1 text-[0.8125rem] leading-5 text-[#667085]">{ajuda}</p>
      )}

      {!vazio && (
        <ul className="mt-3 space-y-2">
          {arquivos.map((arquivo, i) => (
            <li
              key={`${arquivo.name}-${arquivo.lastModified}-${i}`}
              className="flex items-center gap-3 rounded-[12px] border border-[#E7EAEF] bg-white py-2.5 pl-3 pr-2"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F7F8FA] text-[#667085]"
              >
                <Icone
                  nome={iconeDoAnexo(arquivo.type)}
                  className="h-[1.125rem] w-[1.125rem]"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] font-semibold text-[#101828]">
                  {arquivo.name}
                </span>
                <span className="cz-num block text-[0.75rem] text-[#667085]">
                  {tamanhoLegivel(arquivo.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onMudar(arquivos.filter((_, j) => j !== i))}
                aria-label={`Remover ${arquivo.name}`}
                // Sem confirmação: nada foi enviado ainda, e confirmar a remoção
                // de algo que só existe na memória do navegador é atrito puro.
                className="cz-campo-foco flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#98A2B3] transition-colors hover:bg-[#FEF3F2] hover:text-[#B42318]"
              >
                <Icone nome="Trash2" className="h-[1.125rem] w-[1.125rem]" />
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
        className={`mt-3 flex min-h-[3.75rem] cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border border-dashed px-4 py-3 text-center transition-colors duration-150 ${
          arrastando
            ? "border-[#F26212] bg-[#FFF4EC]"
            : erro
            ? "border-[#FDA29B] bg-[#FFFBFA] hover:border-[#F04438]"
            : "border-[#CFD6E0] bg-[#FBFCFD] hover:border-[#F26212] hover:bg-[#FFF4EC]"
        }`}
      >
        <Icone
          nome={vazio ? "Upload" : "Plus"}
          className={`h-[1.125rem] w-[1.125rem] shrink-0 ${
            erro ? "text-[#B42318]" : "text-[#667085]"
          }`}
        />
        <span
          className={`text-[0.9375rem] font-semibold ${
            erro ? "text-[#B42318]" : "text-[#475467]"
          }`}
        >
          {/* "Toque" antes de "arraste": no celular arrastar não existe, e o
              celular é o caso principal desta tela. */}
          {vazio ? "Toque para escolher ou arraste aqui" : "Adicionar outro"}
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
        <p className="mt-2 flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-5 text-[#B42318]">
          <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </p>
      )}

      {recusados.length > 0 && (
        <ul className="mt-2 space-y-1">
          {recusados.map((texto) => (
            <li
              key={texto}
              className="flex items-start gap-1.5 text-[0.8125rem] font-medium leading-5 text-[#B54708]"
            >
              <Icone nome="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
