"use client";

/**
 * Criação de conta.
 *
 * A lógica de envio está preservada: mesmo endpoint, mesmo corpo (`name`,
 * `email`, `senha`, `pais`), mesmas torradinhas de servidor e o mesmo redirecionamento
 * para `/login` no sucesso. As regras de senha do cliente também: 8 caracteres,
 * maiúscula, minúscula, número e símbolo — mais rígidas que as da rota, que pede
 * 6. Cliente mais rígido que servidor é seguro, o contrário não seria.
 *
 * O que mudou:
 *
 * 1. SAÍRAM as três bolhas de gradiente girando com GSAP. Eram 600px com
 *    `blur(60px)` em animação infinita — custo de GPU permanente numa tela onde
 *    a pessoa passa quarenta segundos — e, pior, eram uma terceira linguagem
 *    visual: o login tinha degradê chapado, o painel é claro com filete, e aqui
 *    girava. Agora usa o MESMO painel da marca do login, num componente
 *    compartilhado, que é o que impede as duas telas de divergirem de novo.
 *
 * 2. Erro de campo era só torradinha, e `validateClient` devolvia a PRIMEIRA
 *    mensagem: com nome vazio e senhas diferentes, a pessoa corrigia uma, enviava
 *    e só então descobria a outra. Agora cada campo mostra o seu erro, com
 *    `aria-invalid` e `aria-describedby`.
 *
 * 3. O medidor de força saiu do verde. Vermelho, âmbar e laranja cobrem a
 *    progressão dentro da paleta, e o rótulo em texto ("Fraca", "Média", "Forte")
 *    entrou porque uma barra colorida sozinha não informa quem não distingue as
 *    cores.
 */

import { useMemo, useState, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import { useToast } from "./ui/toaster";
import PainelMarca from "./ui/auth/PainelMarca";

/* -------------------------------------------------------------------------- */
/*                                  Domínio                                   */
/* -------------------------------------------------------------------------- */

type FormData = {
  nome: string;
  email: string;
  senha: string;
  confirmarSenha: string;
  pais: string;
};

type Erros = Partial<Record<keyof FormData, string>>;

/**
 * Países da lista original, sem alteração de valor: `pais` vai para a rota e
 * qualquer mudança de código aqui quebraria o que já foi gravado.
 */
const PAISES: { valor: string; texto: string }[] = [
  { valor: "BR", texto: "Brasil" },
  { valor: "PT", texto: "Portugal" },
  { valor: "US", texto: "Estados Unidos" },
  { valor: "CA", texto: "Canadá" },
  { valor: "MX", texto: "México" },
  { valor: "AR", texto: "Argentina" },
  { valor: "CL", texto: "Chile" },
  { valor: "CO", texto: "Colômbia" },
  { valor: "PE", texto: "Peru" },
  { valor: "UY", texto: "Uruguai" },
  { valor: "PY", texto: "Paraguai" },
  { valor: "BO", texto: "Bolívia" },
  { valor: "EC", texto: "Equador" },
  { valor: "VE", texto: "Venezuela" },
  { valor: "ES", texto: "Espanha" },
  { valor: "FR", texto: "França" },
  { valor: "DE", texto: "Alemanha" },
  { valor: "IT", texto: "Itália" },
  { valor: "UK", texto: "Reino Unido" },
  { valor: "JP", texto: "Japão" },
  { valor: "CN", texto: "China" },
  { valor: "KR", texto: "Coreia do Sul" },
  { valor: "IN", texto: "Índia" },
  { valor: "AU", texto: "Austrália" },
  { valor: "OTHER", texto: "Outro" },
];

/**
 * Exigências da senha, cada uma verificável e visível.
 *
 * A versão anterior escondia isso numa linha de ajuda ("Use maiúscula,
 * minúscula, número e símbolo") e só dizia o que faltava DEPOIS de tentar
 * enviar. Lista com marcação resolve enquanto a pessoa digita.
 */
const REGRAS: { chave: string; texto: string; ok: (v: string) => boolean }[] = [
  { chave: "tam", texto: "8 caracteres ou mais", ok: (v) => v.length >= 8 },
  { chave: "min", texto: "Uma letra minúscula", ok: (v) => /[a-z]/.test(v) },
  { chave: "mai", texto: "Uma letra maiúscula", ok: (v) => /[A-Z]/.test(v) },
  { chave: "num", texto: "Um número", ok: (v) => /\d/.test(v) },
  { chave: "sim", texto: "Um símbolo", ok: (v) => /[^A-Za-z0-9]/.test(v) },
];

/**
 * Força da senha em cinco níveis.
 *
 * Vermelho, âmbar e laranja em vez de vermelho, âmbar e verde: verde saiu da
 * paleta, e laranja como topo é coerente com o resto do sistema, onde laranja é
 * o estado bom.
 */
function forca(senha: string): { nivel: number; texto: string; cor: string } {
  const nivel = REGRAS.filter((r) => r.ok(senha)).length;
  if (nivel <= 2) return { nivel, texto: "Fraca", cor: "#D92D20" };
  if (nivel === 3) return { nivel, texto: "Média", cor: "#DC6803" };
  if (nivel === 4) return { nivel, texto: "Boa", cor: "#F26212" };
  return { nivel, texto: "Forte", cor: "#D9500A" };
}

/* -------------------------------------------------------------------------- */
/*                                  Pedaços                                   */
/* -------------------------------------------------------------------------- */

const CLASSE_ROTULO = "flex items-baseline gap-1";
const CLASSE_TEXTO_ROTULO =
  "text-[13px] font-semibold leading-5 text-[#14161B]";

function Rotulo({ id, texto }: { id: string; texto: string }) {
  return (
    <label htmlFor={id} className={CLASSE_ROTULO}>
      <span className={CLASSE_TEXTO_ROTULO}>{texto}</span>
      <span className="text-[13px] leading-5 text-[#D92D20]" aria-hidden="true">
        *
      </span>
    </label>
  );
}

function MensagemErro({ id, texto }: { id: string; texto: string }) {
  return (
    <p
      id={id}
      className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-[#B42318]"
    >
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </p>
  );
}

/** Botão de mostrar/ocultar senha. Mesmo alvo e mesmos tons do login. */
function BotaoOlho({
  visivel,
  onAlternar,
  rotulo,
}: {
  visivel: boolean;
  onAlternar: () => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-label={visivel ? `Ocultar ${rotulo}` : `Mostrar ${rotulo}`}
      aria-pressed={visivel}
      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#9AA1AC] transition-colors hover:bg-[#F4F5F7] hover:text-[#14161B]"
    >
      {visivel ? (
        <EyeOff className="h-[17px] w-[17px]" aria-hidden="true" />
      ) : (
        <Eye className="h-[17px] w-[17px]" aria-hidden="true" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Tela                                     */
/* -------------------------------------------------------------------------- */

export default function Cadastro() {
  const router = useRouter();
  const { toast } = useToast();

  const idNome = useId();
  const idEmail = useId();
  const idSenha = useId();
  const idConfirmar = useId();
  const idPais = useId();

  const [form, setForm] = useState<FormData>({
    nome: "",
    email: "",
    senha: "",
    confirmarSenha: "",
    pais: "",
  });
  const [erros, setErros] = useState<Erros>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const normalizedEmail = useMemo(
    () => form.email.trim().toLowerCase(),
    [form.email]
  );

  const nivel = useMemo(() => forca(form.senha), [form.senha]);

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Limpa o erro do campo ao digitar: manter vermelho enquanto a pessoa
    // corrige é punição sem função.
    setErros((prev) =>
      prev[name as keyof FormData]
        ? { ...prev, [name as keyof FormData]: undefined }
        : prev
    );
  };

  /**
   * Valida TODOS os campos e devolve o mapa inteiro.
   *
   * A versão anterior devolvia a primeira mensagem encontrada, o que obrigava a
   * pessoa a descobrir os erros um por um, um envio por vez.
   */
  const validar = (): Erros => {
    const saida: Erros = {};

    if (!form.nome.trim()) {
      saida.nome = "Informe o seu nome.";
    }

    if (!normalizedEmail) {
      saida.email = "Informe o seu e-mail.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      saida.email = "Este e-mail não parece válido.";
    }

    if (!form.senha) {
      saida.senha = "Crie uma senha.";
    } else if (nivel.nivel < REGRAS.length) {
      const faltando = REGRAS.filter((r) => !r.ok(form.senha)).length;
      saida.senha =
        faltando === 1
          ? "Falta 1 exigência da lista abaixo."
          : `Faltam ${faltando} exigências da lista abaixo.`;
    }

    if (!form.confirmarSenha) {
      saida.confirmarSenha = "Repita a senha.";
    } else if (form.senha !== form.confirmarSenha) {
      saida.confirmarSenha = "As duas senhas não são iguais.";
    }

    if (!form.pais) {
      saida.pais = "Escolha o seu país.";
    }

    return saida;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const encontrados = validar();
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      // Sem torradinha: as mensagens já estão nos campos, e duas vias para o
      // mesmo erro fazem a pessoa ler duas vezes.
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A rota espera `name`, não `nome`.
          name: form.nome.trim(),
          email: normalizedEmail,
          senha: form.senha,
          pais: form.pais,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error || "Falha no cadastro";
        toast({
          variant: "error",
          title: "Erro no cadastro",
          description: msg,
        });
        throw new Error(msg);
      }

      toast({
        variant: "success",
        title: "Cadastro realizado!",
        description: "Conta criada com sucesso. Você já pode fazer login.",
        duration: 3500,
      });
      router.push("/login");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Ocorreu um erro durante o cadastro.";
      toast({
        variant: "error",
        title: "Erro inesperado",
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="cz-auth min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ------------------------------ Formulário ----------------------------- */}
      <div className="flex min-h-screen flex-col px-6 py-10 sm:px-10 lg:min-h-0 lg:px-16 xl:px-24">
        {/* No celular o painel da marca não existe, então é aqui que a pessoa
            reconhece onde está. A imagem do logo é usada porque o fundo é
            branco, que é para o que ela foi feita. */}
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
              Criar sua conta
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#6B7280]">
              Leva um minuto. Depois você entra com o e-mail e a senha.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
              {/* ------------------------------ Nome ---------------------------- */}
              <div>
                <Rotulo id={idNome} texto="Nome completo" />
                <input
                  id={idNome}
                  name="nome"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  required
                  value={form.nome}
                  onChange={onChange}
                  aria-invalid={erros.nome ? true : undefined}
                  aria-describedby={erros.nome ? `${idNome}-erro` : undefined}
                  className={`w-full ${erros.nome ? "cz-auth-invalido" : ""}`}
                  placeholder="Seu nome e sobrenome"
                />
                {erros.nome && (
                  <MensagemErro id={`${idNome}-erro`} texto={erros.nome} />
                )}
              </div>

              {/* ------------------------------ E-mail -------------------------- */}
              <div>
                <Rotulo id={idEmail} texto="E-mail" />
                <input
                  id={idEmail}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={onChange}
                  aria-invalid={erros.email ? true : undefined}
                  aria-describedby={erros.email ? `${idEmail}-erro` : undefined}
                  className={`w-full ${erros.email ? "cz-auth-invalido" : ""}`}
                  placeholder="voce@empresa.com.br"
                />
                {erros.email && (
                  <MensagemErro id={`${idEmail}-erro`} texto={erros.email} />
                )}
              </div>

              {/* ------------------------------- Senha -------------------------- */}
              <div>
                <Rotulo id={idSenha} texto="Senha" />
                <div className="relative">
                  <input
                    id={idSenha}
                    name="senha"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={form.senha}
                    onChange={onChange}
                    aria-invalid={erros.senha ? true : undefined}
                    aria-describedby={`${idSenha}-regras${
                      erros.senha ? ` ${idSenha}-erro` : ""
                    }`}
                    style={{ paddingRight: "2.875rem" }}
                    className={`w-full ${erros.senha ? "cz-auth-invalido" : ""}`}
                    placeholder="Crie uma senha"
                  />
                  <BotaoOlho
                    visivel={showPw}
                    onAlternar={() => setShowPw((s) => !s)}
                    rotulo="senha"
                  />
                </div>

                {erros.senha && (
                  <MensagemErro id={`${idSenha}-erro`} texto={erros.senha} />
                )}

                {/* Medidor em cinco segmentos, não uma barra contínua: segmento
                    conta e é mais fácil de ler que porcentagem. */}
                {form.senha.length > 0 && (
                  <div className="mt-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex flex-1 gap-1"
                        role="meter"
                        aria-valuenow={nivel.nivel}
                        aria-valuemin={0}
                        aria-valuemax={REGRAS.length}
                        aria-label={`Força da senha: ${nivel.texto}`}
                      >
                        {REGRAS.map((r, i) => (
                          <span
                            key={r.chave}
                            className="h-1.5 flex-1 rounded-full transition-colors"
                            style={{
                              backgroundColor:
                                i < nivel.nivel ? nivel.cor : "#EDEFF3",
                            }}
                          />
                        ))}
                      </div>
                      {/* O rótulo em texto é obrigatório: barra colorida sozinha
                          não informa quem não distingue as cores. */}
                      <span
                        className="shrink-0 text-[12px] font-bold"
                        style={{ color: nivel.cor }}
                      >
                        {nivel.texto}
                      </span>
                    </div>
                  </div>
                )}

                <ul
                  id={`${idSenha}-regras`}
                  className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2"
                >
                  {REGRAS.map((r) => {
                    const ok = r.ok(form.senha);
                    return (
                      <li
                        key={r.chave}
                        className={`flex items-center gap-1.5 text-[12px] ${
                          ok
                            ? "font-medium text-[#D9500A]"
                            : "text-[#9AA1AC]"
                        }`}
                      >
                        {/* Ícone diferente, não só cor diferente. */}
                        {ok ? (
                          <Check
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <X
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>{r.texto}</span>
                        <span className="sr-only">
                          {ok ? "atendido" : "pendente"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* --------------------------- Confirmação ------------------------ */}
              <div>
                <Rotulo id={idConfirmar} texto="Repetir a senha" />
                <div className="relative">
                  <input
                    id={idConfirmar}
                    name="confirmarSenha"
                    type={showPw2 ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={form.confirmarSenha}
                    onChange={onChange}
                    aria-invalid={erros.confirmarSenha ? true : undefined}
                    aria-describedby={
                      erros.confirmarSenha ? `${idConfirmar}-erro` : undefined
                    }
                    style={{ paddingRight: "2.875rem" }}
                    className={`w-full ${
                      erros.confirmarSenha ? "cz-auth-invalido" : ""
                    }`}
                    placeholder="Digite a senha de novo"
                  />
                  <BotaoOlho
                    visivel={showPw2}
                    onAlternar={() => setShowPw2((s) => !s)}
                    rotulo="confirmação de senha"
                  />
                </div>
                {erros.confirmarSenha && (
                  <MensagemErro
                    id={`${idConfirmar}-erro`}
                    texto={erros.confirmarSenha}
                  />
                )}
              </div>

              {/* ------------------------------- País --------------------------- */}
              <div>
                <Rotulo id={idPais} texto="País" />
                <div className="relative">
                  <select
                    id={idPais}
                    name="pais"
                    required
                    value={form.pais}
                    onChange={onChange}
                    aria-invalid={erros.pais ? true : undefined}
                    aria-describedby={erros.pais ? `${idPais}-erro` : undefined}
                    // A seta nativa do select no Windows é de outra época;
                    // `appearance-none` a remove e a nossa entra no lugar.
                    style={{ paddingRight: "2.375rem" }}
                    className={`w-full appearance-none ${
                      erros.pais ? "cz-auth-invalido" : ""
                    }`}
                  >
                    <option value="">Selecione o seu país</option>
                    {PAISES.map((p) => (
                      <option key={p.valor} value={p.valor}>
                        {p.texto}
                      </option>
                    ))}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA1AC]"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
                {erros.pais && (
                  <MensagemErro id={`${idPais}-erro`} texto={erros.pais} />
                )}
              </div>

              {/* Laranja chapado, sem borda escura e sem sombra tingida: é o
                  mesmo botão primário do painel e do login. */}
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
                    Criando conta
                  </>
                ) : (
                  <>
                    Criar conta
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
                Já tem uma conta?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-[#D9500A] underline-offset-4 transition-colors hover:text-[#F26212] hover:underline"
                >
                  Fazer login
                </Link>
              </p>
            </div>
          </div>
        </div>

        <p className="flex shrink-0 items-center gap-2 text-[12px] text-[#9AA1AC] lg:hidden">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Conexão protegida.
        </p>
      </div>

      <PainelMarca titulo="Uma conta, e o seu negócio inteiro num painel só." />
    </div>
  );
}
