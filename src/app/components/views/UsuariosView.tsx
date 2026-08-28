"use client";

/**
 * Usuários e níveis de acesso do administrador.
 *
 * Substitui a aba de usuários do `AdminPanel` por três motivos concretos:
 *
 * 1. O select de cadastro oferecia só "USER" e "ADMIN". Os três papéis do meio
 *    (comercial, contábil, assistente contábil) existiam no guard e nas rotas do
 *    módulo, mas não havia nenhuma tela capaz de atribuí-los — na prática o
 *    sistema tinha cinco níveis e usava dois.
 *
 * 2. Não havia como mudar o papel de quem já estava cadastrado. Errar na criação
 *    obrigava a apagar e recriar a pessoa, perdendo o vínculo com as contas de
 *    marketplace.
 *
 * 3. Ninguém sabia o que cada papel permite. Por isso o painel "O que cada perfil
 *    permite" fica na tela, aberto por padrão, e não escondido num tooltip: a
 *    decisão de dar acesso é o momento em que a informação importa.
 *
 * O filtro é todo no cliente porque `GET /api/admin/users` devolve o array
 * inteiro sem paginação. Enquanto a base é de dezenas de usuários isso é mais
 * rápido do que uma ida ao servidor por tecla digitada; se passar de alguns
 * milhares, a rota precisa ganhar paginação antes desta tela.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";

import {
  ErroApi,
  apiGet,
  apiPatch,
  apiPost,
  mensagemDeErro,
} from "@/app/components/views/ui/tarefas/api";
import {
  Aviso,
  Cabecalho,
  CartaoKpi,
  Carregando,
  Painel,
  Vazio,
} from "@/app/components/views/ui/tarefas/Base";
import {
  Alternador,
  Botao,
  Entrada,
  Escolha,
  type Opcao,
} from "@/app/components/views/ui/tarefas/Campos";
import { Modal } from "@/app/components/views/ui/tarefas/Modal";
import { SeloPapel } from "@/app/components/views/ui/tarefas/Selos";
import Icone from "@/app/components/views/ui/tarefas/Icone";
import {
  dataCurta,
  iniciais,
  plural,
  tempoRelativo,
} from "@/app/components/views/ui/tarefas/formato";
import {
  PAPEL,
  PAPEL_DESCRICAO,
  PAPEL_ICONE,
  PAPEL_LABEL,
  PAPEL_RESUMO,
  ehInterno,
  papelLabel,
} from "@/lib/papeis";
import { invalidarSessao, useSessao } from "@/hooks/useSessao";
import { MeliIcon } from "@/components/icons/MeliIcon";
import { ShopeeIcon } from "@/components/icons/ShopeeIcon";

/* -------------------------------------------------------------------------- */
/*                            Contratos das rotas                             */
/* -------------------------------------------------------------------------- */

type ContaConectada = {
  provider: string;
  label: string;
};

/** `GET /api/admin/users` devolve este objeto num array plano, sem wrapper. */
type UsuarioAdmin = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  connectedAccounts: ContaConectada[];
};

type RespostaPapel = {
  alterado: boolean;
  usuario: { id: string; name: string | null; email: string; role: string };
  papelAnterior?: string;
  papelLabel?: string;
  mensagem?: string;
};

type RespostaCriacao = {
  success: boolean;
  user: { id: string; name: string | null; email: string; role: string };
};

/** Faixa de aviso no topo da tela, resultado da última ação. */
type Recado = { mensagem: string; tom: "ok" | "info" | "erro" | "atencao" };

/* -------------------------------------------------------------------------- */
/*                                  Tabelas                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ordem de exibição dos papéis.
 *
 * A rota ordena por `createdAt desc`, o que joga a equipe interna no meio dos
 * clientes: com trinta clientes cadastrados, achar o assistente contábil virava
 * caça ao tesouro. Aqui a equipe sobe, na ordem de responsabilidade, e cliente
 * fica por último.
 */
const ORDEM_PAPEL: string[] = [
  PAPEL.ADMIN,
  PAPEL.COMERCIAL,
  PAPEL.CONTABIL,
  PAPEL.CONTABIL_ASSISTENTE,
  PAPEL.USER,
];

/** Papel desconhecido (dado legado) vai para o fim, nunca some da lista. */
function pesoPapel(papel: string): number {
  const indice = ORDEM_PAPEL.indexOf(papel);
  return indice === -1 ? ORDEM_PAPEL.length : indice;
}

const OPCOES_PAPEL: Opcao[] = ORDEM_PAPEL.map((valor) => ({
  valor,
  texto: PAPEL_LABEL[valor] ?? valor,
}));

const ESCOPO = {
  TODOS: "todos",
  INTERNOS: "internos",
  CLIENTES: "clientes",
} as const;

const OPCOES_ESCOPO = [
  { valor: ESCOPO.TODOS, texto: "Todos", icone: "Users" },
  { valor: ESCOPO.INTERNOS, texto: "Só equipe interna", icone: "Shield" },
  { valor: ESCOPO.CLIENTES, texto: "Só clientes", icone: "User" },
];

/* -------------------------------------------------------------------------- */
/*                                  Pedaços                                   */
/* -------------------------------------------------------------------------- */

function CirculoIniciais({ nome }: { nome: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700"
    >
      {iniciais(nome)}
    </span>
  );
}

/** Marca do marketplace. Provider desconhecido cai num ícone neutro do kit. */
function IconeProvedor({ provider }: { provider: string }) {
  if (provider === "mercado-livre") return <MeliIcon className="h-4 w-4" />;
  if (provider === "shopee") return <ShopeeIcon className="h-4 w-4" />;
  return <Icone nome="Link2" className="h-4 w-4 text-gray-400" />;
}

/** Texto longo do papel, do `PAPEL_DESCRICAO`. Nunca inventar aqui. */
function DescricaoPapel({
  papel,
  className = "",
}: {
  papel: string;
  className?: string;
}) {
  const texto = PAPEL_DESCRICAO[papel];
  if (!texto) return null;
  return (
    <p className={`text-sm leading-relaxed text-gray-600 ${className}`}>
      {texto}
    </p>
  );
}

/**
 * Estado de 403.
 *
 * Uma faixa vermelha de erro faria o comercial achar que o sistema quebrou. O
 * que aconteceu não é falha: é a permissão funcionando.
 */
function SemPermissao() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        <Lock className="h-7 w-7 text-gray-500" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-gray-900">
        Gestão de usuários restrita
      </h2>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        Somente o perfil Administrador vê e altera os níveis de acesso das
        pessoas. Seu perfil continua com acesso normal às demais telas.
      </p>
      <p className="mt-3 max-w-md text-xs text-gray-500">
        Se você deveria administrar usuários, peça a um administrador para
        ajustar o seu perfil.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Painel: o que cada perfil faz                       */
/* -------------------------------------------------------------------------- */

function PainelPerfis({
  contagem,
  aberto,
  onAlternar,
}: {
  contagem: Record<string, number>;
  aberto: boolean;
  onAlternar: () => void;
}) {
  return (
    <Painel
      titulo="O que cada perfil permite"
      descricao="Cada nível libera um conjunto de etapas do módulo de tarefas. Confira antes de atribuir."
      acoes={
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberto}
          aria-controls="lista-perfis"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          {aberto ? "Recolher" : "Expandir"}
          {aberto ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      }
    >
      {aberto && (
        <div
          id="lista-perfis"
          className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          {ORDEM_PAPEL.map((papel) => {
            const quantas = contagem[papel] ?? 0;
            return (
              <div
                key={papel}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm">
                      <Icone
                        nome={PAPEL_ICONE[papel] ?? "User"}
                        className="h-5 w-5"
                      />
                    </span>
                    <SeloPapel papel={papel} />
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 shadow-sm">
                    {plural(quantas, "pessoa", "pessoas")}
                  </span>
                </div>
                <DescricaoPapel papel={papel} />
              </div>
            );
          })}
        </div>
      )}
    </Painel>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Modal: alterar o perfil                           */
/* -------------------------------------------------------------------------- */

function ModalAlterarPapel({
  usuario,
  ehVoceMesmo,
  onFechar,
  onConcluido,
}: {
  usuario: UsuarioAdmin;
  ehVoceMesmo: boolean;
  onFechar: () => void;
  onConcluido: (recado: Recado, alterou: boolean) => void;
}) {
  const [papel, setPapel] = useState(usuario.role);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<Recado | null>(null);

  const nome = usuario.name?.trim() || usuario.email;
  const mudou = papel !== usuario.role;
  const perdendoAdmin = usuario.role === PAPEL.ADMIN && papel !== PAPEL.ADMIN;

  const confirmar = useCallback(async () => {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await apiPatch<RespostaPapel>(
        `/api/admin/users/${usuario.id}`,
        { role: papel }
      );

      if (!resposta.alterado) {
        onConcluido(
          {
            mensagem: resposta.mensagem ?? "O usuário já está neste perfil.",
            tom: "info",
          },
          false
        );
        return;
      }

      const rotulo = resposta.papelLabel ?? papelLabel(resposta.usuario.role);
      onConcluido({ mensagem: `${nome} agora é ${rotulo}.`, tom: "ok" }, true);
    } catch (falha) {
      // As duas travas do servidor (auto_rebaixamento, ultimo_admin) já chegam
      // com a instrução do que fazer. Reescrever a mensagem aqui só faria a
      // interface e a API divergirem, então ela é exibida como veio — e em tom de
      // atenção, porque é regra de proteção, não defeito.
      if (
        falha instanceof ErroApi &&
        (falha.code === "auto_rebaixamento" || falha.code === "ultimo_admin")
      ) {
        setErro({ mensagem: falha.message, tom: "atencao" });
        return;
      }
      const mensagem = mensagemDeErro(falha);
      if (mensagem) setErro({ mensagem, tom: "erro" });
    } finally {
      setEnviando(false);
    }
  }, [nome, onConcluido, papel, usuario.id]);

  return (
    <Modal
      aberto
      titulo="Alterar perfil de acesso"
      descricao="A mudança vale na próxima ação da pessoa, sem precisar sair e entrar."
      icone="ShieldCheck"
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            icone="Save"
            onClick={() => void confirmar()}
            carregando={enviando}
            textoCarregando="Salvando"
            disabled={!mudou}
          >
            Salvar perfil
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {erro && (
          <Aviso
            mensagem={erro.mensagem}
            tom={erro.tom}
            onFechar={() => setErro(null)}
          />
        )}

        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <CirculoIniciais nome={usuario.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {nome}
            </p>
            <p className="truncate text-xs text-gray-500">{usuario.email}</p>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Perfil atual
            </p>
            <div className="mt-1 flex justify-end">
              <SeloPapel papel={usuario.role} />
            </div>
          </div>
        </div>

        {ehVoceMesmo && (
          <Aviso
            tom="atencao"
            mensagem="Esta é a sua própria conta. Um administrador não consegue retirar o próprio acesso de administrador — outro administrador precisa fazer isso."
          />
        )}

        {perdendoAdmin && !ehVoceMesmo && (
          <Aviso
            tom="atencao"
            mensagem="Você está retirando o acesso de administrador desta pessoa. Ela perde o cadastro de usuários, a configuração de fluxos e a reabertura de competência encerrada."
          />
        )}

        <Escolha
          rotulo="Novo perfil"
          required
          value={papel}
          opcoes={OPCOES_PAPEL}
          onChange={(evento) => setPapel(evento.target.value)}
          ajuda="Escolha pelo que a pessoa precisa executar, não pelo cargo dela."
        />

        {/* A descrição aparece ANTES de confirmar: a decisão de dar acesso não
            deveria depender de o administrador lembrar o que cada papel faz. */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <Icone
              nome={PAPEL_ICONE[papel] ?? "User"}
              className="h-4 w-4 text-orange-500"
            />
            <span className="text-sm font-semibold text-gray-900">
              {papelLabel(papel)} poderá:
            </span>
          </div>
          <DescricaoPapel papel={papel} />
          {!mudou && (
            <p className="mt-2 text-xs text-gray-500">
              Este já é o perfil atual da pessoa.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                           Modal: novo usuário                              */
/* -------------------------------------------------------------------------- */

function ModalNovoUsuario({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: (recado: Recado) => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<string>(PAPEL.USER);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);

  const faltaCampo = !nome.trim() || !email.trim() || senha.length < 1;

  const enviar = useCallback(async () => {
    setTocado(true);
    if (faltaCampo) return;

    setEnviando(true);
    setErro(null);
    setErroEmail(null);
    try {
      await apiPost<RespostaCriacao>("/api/admin/users", {
        name: nome.trim(),
        email: email.trim(),
        password: senha,
        role: papel,
      });
      onCriado({
        mensagem: `${nome.trim()} foi cadastrado como ${papelLabel(papel)}.`,
        tom: "ok",
      });
    } catch (falha) {
      const mensagem = mensagemDeErro(falha);
      // A rota devolve 400 sem `campo`, então o vínculo com o input é feito aqui
      // pela mensagem. Erro de e-mail no campo de e-mail poupa a pessoa de
      // reler o formulário inteiro procurando o que deu errado.
      if (
        falha instanceof ErroApi &&
        falha.status === 400 &&
        /e-?mail/i.test(mensagem)
      ) {
        setErroEmail(mensagem);
        return;
      }
      if (mensagem) setErro(mensagem);
    } finally {
      setEnviando(false);
    }
  }, [email, faltaCampo, nome, onCriado, papel, senha]);

  return (
    <Modal
      aberto
      titulo="Novo usuário"
      descricao="A pessoa entra com este e-mail e a senha inicial que você definir."
      icone="UserPlus"
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            icone="UserPlus"
            onClick={() => void enviar()}
            carregando={enviando}
            textoCarregando="Cadastrando"
          >
            Cadastrar
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <Aviso mensagem={erro} onFechar={() => setErro(null)} />}

        <Entrada
          rotulo="Nome"
          required
          value={nome}
          autoComplete="off"
          placeholder="Nome completo"
          erro={tocado && !nome.trim() ? "Informe o nome." : null}
          onChange={(evento) => setNome(evento.target.value)}
        />

        <Entrada
          rotulo="E-mail"
          type="email"
          required
          value={email}
          autoComplete="off"
          placeholder="pessoa@empresa.com.br"
          erro={erroEmail ?? (tocado && !email.trim() ? "Informe o e-mail." : null)}
          onChange={(evento) => {
            setEmail(evento.target.value);
            if (erroEmail) setErroEmail(null);
          }}
        />

        {/* Senha inicial em `type="password"`: a tela do admin costuma estar
            projetada ou compartilhada, e a senha não volta em nenhuma resposta
            da API depois do cadastro. */}
        <Entrada
          rotulo="Senha inicial"
          type="password"
          required
          value={senha}
          autoComplete="new-password"
          erro={tocado && !senha ? "Informe a senha inicial." : null}
          ajuda="Combine a senha com a pessoa por um canal seguro e peça que ela troque no primeiro acesso. Ela não fica visível aqui depois de salvar."
          onChange={(evento) => setSenha(evento.target.value)}
        />

        <Escolha
          rotulo="Perfil de acesso"
          required
          value={papel}
          opcoes={OPCOES_PAPEL}
          onChange={(evento) => setPapel(evento.target.value)}
          ajuda="Cliente é o padrão: acessa o próprio painel e nada do módulo de tarefas."
        />

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Icone
              nome={PAPEL_ICONE[papel] ?? "User"}
              className="h-4 w-4 text-orange-500"
            />
            <span className="text-sm font-semibold text-gray-900">
              {papelLabel(papel)} poderá:
            </span>
          </div>
          <DescricaoPapel papel={papel} />
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Tela                                    */
/* -------------------------------------------------------------------------- */

export default function UsuariosView() {
  const { sessao, permissoes } = useSessao();

  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [recado, setRecado] = useState<Recado | null>(null);

  const [filtroPapel, setFiltroPapel] = useState("");
  const [escopo, setEscopo] = useState<string>(ESCOPO.TODOS);
  const [textoBusca, setTextoBusca] = useState("");
  const [busca, setBusca] = useState("");

  const [perfisAberto, setPerfisAberto] = useState(true);
  const [alvo, setAlvo] = useState<UsuarioAdmin | null>(null);
  const [criando, setCriando] = useState(false);

  /* ------------------------------- Carga -------------------------------- */

  const carregar = useCallback(async (sinal?: AbortSignal) => {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await apiGet<UsuarioAdmin[]>("/api/admin/users", sinal);
      setUsuarios(Array.isArray(dados) ? dados : []);
      setSemPermissao(false);
    } catch (falha) {
      if (falha instanceof ErroApi && falha.status === 403) {
        setSemPermissao(true);
        setUsuarios([]);
      } else {
        const mensagem = mensagemDeErro(falha);
        // `mensagemDeErro` devolve "" quando a requisição foi abortada — nesse
        // caso não há erro nenhum para mostrar, a tela só foi deixada.
        if (mensagem) setErro(mensagem);
      }
    } finally {
      if (!sinal?.aborted) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const controle = new AbortController();
    void carregar(controle.signal);
    return () => controle.abort();
  }, [carregar]);

  /** Debounce de 300ms: filtrar a cada tecla remonta a tabela inteira. */
  useEffect(() => {
    const relogio = setTimeout(
      () => setBusca(textoBusca.trim().toLowerCase()),
      300
    );
    return () => clearTimeout(relogio);
  }, [textoBusca]);

  /* ------------------------------ Derivados ------------------------------ */

  const contagemPorPapel = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const usuario of usuarios) {
      const papel = usuario.role || PAPEL.USER;
      mapa[papel] = (mapa[papel] ?? 0) + 1;
    }
    return mapa;
  }, [usuarios]);

  const resumo = useMemo(() => {
    let internos = 0;
    let clientes = 0;
    let contas = 0;
    let meli = 0;
    let shopee = 0;

    for (const usuario of usuarios) {
      if (ehInterno(usuario.role)) internos += 1;
      else clientes += 1;

      const lista = usuario.connectedAccounts ?? [];
      contas += lista.length;
      for (const conta of lista) {
        if (conta.provider === "mercado-livre") meli += 1;
        else if (conta.provider === "shopee") shopee += 1;
      }
    }

    return { internos, clientes, contas, meli, shopee };
  }, [usuarios]);

  const temFiltro = filtroPapel !== "" || escopo !== ESCOPO.TODOS || busca !== "";

  const visiveis = useMemo(() => {
    const filtrados = usuarios.filter((usuario) => {
      const papel = usuario.role || PAPEL.USER;

      if (filtroPapel && papel !== filtroPapel) return false;
      if (escopo === ESCOPO.INTERNOS && !ehInterno(papel)) return false;
      if (escopo === ESCOPO.CLIENTES && ehInterno(papel)) return false;

      if (busca) {
        const alvoTexto = `${usuario.name ?? ""} ${usuario.email}`.toLowerCase();
        if (!alvoTexto.includes(busca)) return false;
      }
      return true;
    });

    return filtrados.sort((a, b) => {
      const diferenca = pesoPapel(a.role) - pesoPapel(b.role);
      if (diferenca !== 0) return diferenca;
      return (a.name ?? a.email).localeCompare(b.name ?? b.email, "pt-BR", {
        sensitivity: "base",
      });
    });
  }, [busca, escopo, filtroPapel, usuarios]);

  /* ------------------------------- Ações -------------------------------- */

  const limparFiltros = useCallback(() => {
    setFiltroPapel("");
    setEscopo(ESCOPO.TODOS);
    setTextoBusca("");
    setBusca("");
  }, []);

  const concluirAlteracao = useCallback(
    (resultado: Recado, alterou: boolean) => {
      setAlvo(null);
      setRecado(resultado);
      if (!alterou) return;
      // O papel vive em dois caches de trinta segundos: o do guard, limpo pela
      // rota, e o do `useSessao` no navegador. Sem limpar o segundo, o próprio
      // administrador continuaria vendo permissões antigas nesta aba.
      invalidarSessao();
      void carregar();
    },
    [carregar]
  );

  const concluirCriacao = useCallback(
    (resultado: Recado) => {
      setCriando(false);
      setRecado(resultado);
      void carregar();
    },
    [carregar]
  );

  /* ------------------------------ Renderização --------------------------- */

  const podeGerenciar = permissoes.gerenciarUsuarios;

  return (
    <div className="cz-tarefas p-6 max-w-7xl mx-auto space-y-6">
      <Cabecalho
        titulo="Usuários e níveis de acesso"
        icone="Users"
        descricao="É aqui que se define quem executa quais etapas do módulo de tarefas: cada perfil libera um conjunto diferente de ações."
        acoes={
          podeGerenciar && !semPermissao ? (
            <Botao
              variante="primario"
              icone="UserPlus"
              onClick={() => setCriando(true)}
            >
              Novo usuário
            </Botao>
          ) : undefined
        }
      />

      {recado && (
        <Aviso
          mensagem={recado.mensagem}
          tom={recado.tom}
          onFechar={() => setRecado(null)}
        />
      )}

      {semPermissao ? (
        <SemPermissao />
      ) : carregando ? (
        <Carregando texto="Carregando usuários" />
      ) : erro ? (
        <div className="space-y-4">
          <Aviso mensagem={erro} />
          <Botao
            variante="secundario"
            icone="RefreshCw"
            onClick={() => void carregar()}
          >
            Tentar novamente
          </Botao>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoKpi
              titulo="Total de usuários"
              valor={usuarios.length}
              icone="Users"
              tom="cinza"
            />
            <CartaoKpi
              titulo="Equipe interna"
              valor={resumo.internos}
              icone="Shield"
              tom="laranja"
              detalhe="Administrador, comercial e contabilidade"
            />
            <CartaoKpi
              titulo="Clientes"
              valor={resumo.clientes}
              icone="User"
              tom="azul"
              detalhe="Acesso somente ao próprio painel"
            />
            <CartaoKpi
              titulo="Contas de marketplace"
              valor={resumo.contas}
              icone="Link2"
              tom="verde"
              detalhe={`${resumo.meli} no Mercado Livre · ${resumo.shopee} na Shopee`}
            />
          </div>

          <PainelPerfis
            contagem={contagemPorPapel}
            aberto={perfisAberto}
            onAlternar={() => setPerfisAberto((valor) => !valor)}
          />

          <Painel
            titulo="Pessoas cadastradas"
            descricao={
              temFiltro
                ? `${visiveis.length} de ${usuarios.length} usuários`
                : plural(usuarios.length, "usuário", "usuários")
            }
          >
            <div className="flex flex-col gap-3 border-b border-gray-200 p-5 lg:flex-row lg:items-end">
              <Escolha
                rotulo="Perfil"
                vazio="Todos os perfis"
                value={filtroPapel}
                opcoes={OPCOES_PAPEL}
                onChange={(evento) => setFiltroPapel(evento.target.value)}
                wrapperClassName="w-full lg:w-56"
              />
              <Entrada
                rotulo="Buscar"
                type="search"
                value={textoBusca}
                placeholder="Nome ou e-mail"
                onChange={(evento) => setTextoBusca(evento.target.value)}
                wrapperClassName="w-full lg:max-w-xs"
              />
              <div className="flex flex-wrap items-center gap-3 lg:ml-auto lg:pb-0.5">
                <Alternador
                  opcoes={OPCOES_ESCOPO}
                  valor={escopo}
                  onMudar={setEscopo}
                />
                <Botao
                  variante="fantasma"
                  icone="X"
                  onClick={limparFiltros}
                  disabled={!temFiltro}
                >
                  Limpar filtros
                </Botao>
              </div>
            </div>

            {visiveis.length === 0 ? (
              <div className="p-5">
                <Vazio
                  icone="Users"
                  titulo="Nenhum usuário encontrado"
                  descricao={
                    temFiltro
                      ? "Nenhuma pessoa combina com os filtros aplicados. Limpe os filtros para ver a lista inteira."
                      : "Ainda não há usuários cadastrados."
                  }
                  acao={
                    temFiltro ? (
                      <Botao
                        variante="secundario"
                        icone="X"
                        onClick={limparFiltros}
                      >
                        Limpar filtros
                      </Botao>
                    ) : podeGerenciar ? (
                      <Botao
                        variante="primario"
                        icone="UserPlus"
                        onClick={() => setCriando(true)}
                      >
                        Novo usuário
                      </Botao>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th scope="col" className="px-5 py-3">
                        Usuário
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Perfil
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Cadastrado em
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Contas conectadas
                      </th>
                      <th scope="col" className="px-5 py-3 text-right">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visiveis.map((usuario) => {
                      const papel = usuario.role || PAPEL.USER;
                      const ehVoceMesmo = sessao?.userId === usuario.id;
                      const contas = usuario.connectedAccounts ?? [];

                      return (
                        <tr key={usuario.id} className="hover:bg-gray-50/70">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <CirculoIniciais nome={usuario.name} />
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 font-semibold text-gray-900">
                                  <span className="truncate">
                                    {usuario.name?.trim() || "Sem nome"}
                                  </span>
                                  {ehVoceMesmo && (
                                    <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                      você
                                    </span>
                                  )}
                                </p>
                                <p className="truncate text-xs text-gray-500">
                                  {usuario.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <SeloPapel papel={papel} />
                            <p className="mt-1 text-xs text-gray-500">
                              {PAPEL_RESUMO[papel] ?? "Perfil não reconhecido"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <p className="whitespace-nowrap text-gray-900">
                              {dataCurta(usuario.createdAt)}
                            </p>
                            <p className="whitespace-nowrap text-xs text-gray-500">
                              {tempoRelativo(usuario.createdAt)}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            {contas.length === 0 ? (
                              <span className="text-xs text-gray-400">
                                Nenhuma conta
                              </span>
                            ) : (
                              <ul className="space-y-1">
                                {contas.map((conta, indice) => (
                                  <li
                                    key={`${usuario.id}-${conta.provider}-${indice}`}
                                    className="flex items-center gap-2"
                                  >
                                    <IconeProvedor provider={conta.provider} />
                                    <span className="truncate text-xs text-gray-700">
                                      {conta.label}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>

                          <td className="px-5 py-4 text-right">
                            {podeGerenciar ? (
                              <Botao
                                variante="secundario"
                                icone="Pencil"
                                onClick={() => setAlvo(usuario)}
                              >
                                Alterar perfil
                              </Botao>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Painel>
        </>
      )}

      {alvo && (
        <ModalAlterarPapel
          key={alvo.id}
          usuario={alvo}
          ehVoceMesmo={sessao?.userId === alvo.id}
          onFechar={() => setAlvo(null)}
          onConcluido={concluirAlteracao}
        />
      )}

      {criando && (
        <ModalNovoUsuario
          onFechar={() => setCriando(false)}
          onCriado={concluirCriacao}
        />
      )}
    </div>
  );
}
