"use client";

/**
 * Tela de entrada.
 *
 * A lógica de autenticação está preservada exatamente como estava: login no
 * backend remoto quando `API_CONFIG.baseURL` existe, depois sempre o login
 * local para manter as rotas locais funcionando, `checkAuth()` para atualizar o
 * contexto e `window.location.href` no fim — recarga completa de propósito, para
 * o middleware processar o cookie recém-gravado. Nada disso mudou.
 *
 * O acabamento segue a MESMA linguagem do painel: separa por borda e não por
 * sombra, raio de 10px no campo e no botão, laranja `#F26212` chapado na ação,
 * tipografia Plus Jakarta com título apertado. Três decisões merecem registro:
 *
 * 1. O painel da direita é LARANJA. Antes era um retângulo com degradê laranja
 *    para amarelo e nada dentro; depois foi preto. Laranja e branco é o que a
 *    marca tem, e é como a referência aprovada assenta o painel claro. O degradê
 *    fica dentro da família e não sai para amarelo, que é cor que a marca não
 *    tem.
 *
 * 2. Erro de campo era só torradinha. Uma mensagem que passa voando não diz
 *    QUAL campo está errado, e quem usa leitor de tela não recebe nada. Agora o
 *    erro fica no campo, com `aria-invalid` e `aria-describedby`; a torradinha
 *    continua, mas para falha de servidor, que é onde ela serve.
 *
 * 3. Não existe link de "esqueci minha senha" porque não existe rota de
 *    recuperação no projeto. Link que leva a 404 é pior que ausência de link.
 */

import { useState, useMemo, useEffect, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Lock,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { useToast } from "./ui/toaster";
import { useAuthContext } from "@/contexts/AuthContext";
import { API_CONFIG } from "@/lib/api-config";

/* -------------------------------------------------------------------------- */
/*                            Painel da marca                                 */
/* -------------------------------------------------------------------------- */

/**
 * O que o painel diz é o que o sistema realmente faz — vendas de marketplace,
 * financeiro, apuração fiscal e documentos. Frase genérica de gestão em painel
 * de login é ruído: quem chega aqui já é cliente e quer entrar, e quem chega
 * por engano precisa saber em um segundo se é o lugar certo.
 */
const CAPACIDADES = [
  {
    icone: ShoppingBag,
    titulo: "Vendas de Mercado Livre e Shopee",
    texto: "Pedidos, frete e comissão de cada canal em um só lugar.",
  },
  {
    icone: TrendingUp,
    titulo: "Financeiro com DRE",
    texto: "Margem por produto, contas a pagar e a receber, resultado do mês.",
  },
  {
    icone: Calculator,
    titulo: "Apuração fiscal acompanhada",
    texto: "Etapa por etapa da competência, com prazo e responsável.",
  },
  {
    icone: FolderOpen,
    titulo: "Documentos por competência",
    texto: "Guias e relatórios organizados, sempre no mesmo lugar.",
  },
];

function PainelMarca() {
  return (
    <div className="cz-auth-marca cz-auth-malha relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between">
      {/* Lockup em branco, não a imagem do logo: o arquivo é feito para fundo
          claro e sobre laranja o resultado é imprevisível. */}
      <div className="relative flex items-center gap-2.5 px-12 pt-12">
        <span
          aria-hidden="true"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white/15 ring-1 ring-inset ring-white/25"
        >
          <Lock className="h-[17px] w-[17px] text-white" />
        </span>
        <span className="text-[17px] font-bold tracking-[-0.02em] text-white">
          ContaZoom
        </span>
      </div>

      <div className="relative px-12 py-10">
        <h2 className="max-w-md text-[2rem] font-extrabold leading-[1.14] tracking-[-0.035em] text-white">
          A operação e a contabilidade do seu negócio, no mesmo painel.
        </h2>

        <ul className="mt-10 space-y-5">
          {CAPACIDADES.map((item) => {
            const Icone = item.icone;
            return (
              <li key={item.titulo} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/15 ring-1 ring-inset ring-white/20"
                >
                  <Icone className="h-[18px] w-[18px] text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold leading-snug tracking-[-0.015em] text-white">
                    {item.titulo}
                  </p>
                  {/* Branco a 75%: texto secundário sobre laranja precisa recuar
                      sem virar cinza, que sujaria a cor de baixo. */}
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/75">
                    {item.texto}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative border-t border-white/20 px-12 py-6">
        <p className="flex items-center gap-2 text-[12px] text-white/70">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Conexão protegida. Sua sessão expira automaticamente por inatividade.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Tela                                     */
/* -------------------------------------------------------------------------- */

type Erros = { email?: string; senha?: string };

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { checkAuth, isAuthenticated, isLoading: authLoading } = useAuthContext();

  const idEmail = useId();
  const idSenha = useId();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [erros, setErros] = useState<Erros>({});

  // Redirecionar se já estiver autenticado
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.replace(redirect);
    }
  }, [authLoading, isAuthenticated, router, searchParams]);

  // Mostrar mensagem de erro se houver
  useEffect(() => {
    const error = searchParams.get("error");
    const message = searchParams.get("message");

    if (error === "session_expired") {
      toast({
        variant: "error",
        title: "Sessão expirada",
        description: message || "Sua sessão expirou. Faça login novamente.",
      });
    }
  }, [searchParams, toast]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  // Mostrar loading enquanto verifica autenticação
  if (authLoading) {
    return (
      <div className="cz-auth flex min-h-screen items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/logopng.webp"
            alt="ContaZoom"
            width={150}
            height={34}
            className="h-8 w-auto object-contain"
            priority
          />
          <p className="flex items-center gap-2 text-[13px] font-medium text-[#6B7280]">
            <Loader2
              className="h-4 w-4 animate-spin text-[#F26212]"
              aria-hidden="true"
            />
            Verificando sua sessão
          </p>
        </div>
      </div>
    );
  }

  /**
   * Validação por campo.
   *
   * Devolve o mapa inteiro em vez da primeira mensagem: com dois campos errados,
   * mostrar só o primeiro obriga a pessoa a descobrir o segundo depois de
   * corrigir e submeter de novo.
   */
  const validar = (): Erros => {
    const saida: Erros = {};
    if (!normalizedEmail) {
      saida.email = "Informe o seu e-mail.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      saida.email = "Este e-mail não parece válido.";
    }
    if (!senha) saida.senha = "Informe a sua senha.";
    return saida;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const encontrados = validar();
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      // Sem torradinha aqui: a mensagem já está no campo, e duas vias para o
      // mesmo erro fazem a pessoa ler duas vezes.
      return;
    }

    setIsLoading(true);
    try {
      const payload = JSON.stringify({ email: normalizedEmail, senha });
      const shouldSyncExternal = Boolean(API_CONFIG.baseURL);

      // 1) Se estivermos usando backend externo, realizar login lá primeiro
      if (shouldSyncExternal) {
        const remoteRes = await API_CONFIG.fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });

        const remoteData = await remoteRes.json().catch(() => ({}));

        console.log("[Login] Resposta do backend remoto:", {
          status: remoteRes.status,
          ok: remoteRes.ok,
          data: remoteData,
        });

        if (!remoteRes.ok || !remoteData?.ok) {
          const message =
            remoteData?.message ||
            remoteData?.error ||
            "Falha ao autenticar no backend remoto.";
          throw new Error(message);
        }
      }

      // 2) Sempre realizar login local para manter compatibilidade com rotas locais
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: payload,
      });

      const data = await res.json().catch(() => ({}));

      console.log("[Login] Resposta do backend local:", {
        status: res.status,
        ok: res.ok,
        data,
      });

      if (res.ok && data?.ok) {
        console.log("[Login] Autenticado. Redirecionando.");
        toast({
          variant: "success",
          title: "Bem-vindo!",
          description: "Login realizado com sucesso.",
          duration: 2000,
        });

        // Atualizar estado de autenticação
        await checkAuth();

        const redirectUrl = searchParams.get("redirect") || "/dashboard";
        console.log("[Login] Destino:", redirectUrl);

        // `window.location` de propósito: força recarga completa para o
        // middleware processar o cookie recém-gravado.
        window.location.href = redirectUrl;
        return;
      }

      console.log("[Login] Falhou:", data);
      const msg = data?.error || "Falha no login";
      toast({ variant: "error", title: "Erro no login", description: msg });
      return;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado no login.";
      toast({ variant: "error", title: "Erro", description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="cz-auth min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ------------------------------ Formulário ----------------------------- */}
      <div className="flex min-h-screen flex-col px-6 py-10 sm:px-10 lg:min-h-0 lg:px-16 xl:px-24">
        {/* Logo no alto da coluna do formulário: no celular o painel da marca
            não existe, então é aqui que a pessoa reconhece onde está. A imagem
            do logo é usada aqui porque o fundo é branco, que é para o que ela
            foi feita. */}
        <div className="shrink-0">
          <Image
            src="/logopng.webp"
            alt="ContaZoom"
            width={150}
            height={34}
            className="h-8 w-auto object-contain"
            priority
          />
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="w-full max-w-[25rem]">
            <h1 className="cz-titulo text-[1.75rem] leading-9">
              Entrar na sua conta
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#6B7280]">
              Use o e-mail cadastrado para acessar o painel.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
              <div>
                <label htmlFor={idEmail} className="flex items-baseline gap-1">
                  <span className="text-[13px] font-semibold leading-5 text-[#14161B]">
                    E-mail
                  </span>
                  <span
                    className="text-[13px] leading-5 text-[#D92D20]"
                    aria-hidden="true"
                  >
                    *
                  </span>
                </label>
                <input
                  id={idEmail}
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    // Limpa o erro ao digitar: manter o campo vermelho enquanto
                    // a pessoa corrige é punição sem função.
                    if (erros.email) setErros((a) => ({ ...a, email: undefined }));
                  }}
                  onBlur={() => {
                    const r = validar();
                    setErros((a) => ({ ...a, email: r.email }));
                  }}
                  aria-invalid={erros.email ? true : undefined}
                  aria-describedby={erros.email ? `${idEmail}-erro` : undefined}
                  className={`w-full ${erros.email ? "cz-auth-invalido" : ""}`}
                  placeholder="voce@empresa.com.br"
                />
                {erros.email && (
                  <p
                    id={`${idEmail}-erro`}
                    className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]"
                  >
                    <AlertCircle
                      className="mt-px h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{erros.email}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={idSenha} className="flex items-baseline gap-1">
                  <span className="text-[13px] font-semibold leading-5 text-[#14161B]">
                    Senha
                  </span>
                  <span
                    className="text-[13px] leading-5 text-[#D92D20]"
                    aria-hidden="true"
                  >
                    *
                  </span>
                </label>
                <div className="relative">
                  <input
                    id={idSenha}
                    name="senha"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={senha}
                    onChange={(e) => {
                      setSenha(e.target.value);
                      if (erros.senha)
                        setErros((a) => ({ ...a, senha: undefined }));
                    }}
                    onBlur={() => {
                      const r = validar();
                      setErros((a) => ({ ...a, senha: r.senha }));
                    }}
                    aria-invalid={erros.senha ? true : undefined}
                    aria-describedby={erros.senha ? `${idSenha}-erro` : undefined}
                    // O padding à direita abre espaço para o botão do olho: sem
                    // ele, senha longa passa por baixo do ícone.
                    style={{ paddingRight: "2.875rem" }}
                    className={`w-full ${erros.senha ? "cz-auth-invalido" : ""}`}
                    placeholder="Sua senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#9AA1AC] transition-colors hover:bg-[#F4F5F7] hover:text-[#14161B]"
                    aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPw}
                  >
                    {showPw ? (
                      <EyeOff className="h-[17px] w-[17px]" aria-hidden="true" />
                    ) : (
                      <Eye className="h-[17px] w-[17px]" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {erros.senha && (
                  <p
                    id={`${idSenha}-erro`}
                    className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]"
                  >
                    <AlertCircle
                      className="mt-px h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{erros.senha}</span>
                  </p>
                )}
              </div>

              {/* Laranja chapado, sem borda escura e sem sombra tingida: é o
                  mesmo botão primário do painel. */}
              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading || undefined}
                className="group mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-transparent bg-[#F26212] text-sm font-semibold text-white transition-colors hover:bg-[#D9500A] active:bg-[#C34706] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2
                      className="h-[18px] w-[18px] animate-spin"
                      aria-hidden="true"
                    />
                    Entrando
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight
                      className="h-[18px] w-[18px] transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 border-t border-[#EDEFF3] pt-5">
              <p className="text-[13px] text-[#6B7280]">
                Ainda não tem conta?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-[#D9500A] underline-offset-4 transition-colors hover:text-[#F26212] hover:underline"
                >
                  Criar conta
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Aviso de segurança no celular, onde o painel da marca não aparece. */}
        <p className="flex shrink-0 items-center gap-2 text-[12px] text-[#9AA1AC] lg:hidden">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Conexão protegida.
        </p>
      </div>

      <PainelMarca />
    </div>
  );
}
