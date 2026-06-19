import prisma from "@/lib/prisma";

export type TaxPlatform = "meli" | "shopee";

export type TaxAccount = {
  id: string;
  nome: string;
  plataforma: string;
  tipo: TaxPlatform;
};

export function parseTaxRate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const normalized =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : null;
}

export function parseTaxPeriod(dataInicio: unknown, dataFim: unknown) {
  if (typeof dataInicio !== "string" || typeof dataFim !== "string") {
    return null;
  }

  const inicioInformado = new Date(dataInicio);
  const fimInformado = new Date(dataFim);
  if (
    Number.isNaN(inicioInformado.getTime()) ||
    Number.isNaN(fimInformado.getTime())
  ) {
    return null;
  }

  const inicio = new Date(
    Date.UTC(
      inicioInformado.getUTCFullYear(),
      inicioInformado.getUTCMonth(),
      1,
    ),
  );
  const fim = new Date(
    Date.UTC(
      fimInformado.getUTCFullYear(),
      fimInformado.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );

  return inicio <= fim ? { inicio, fim } : null;
}

export async function listTaxAccounts(userId: string): Promise<TaxAccount[]> {
  const [meliAccounts, shopeeAccounts] = await Promise.all([
    prisma.meliAccount.findMany({
      where: { userId },
      select: { id: true, nickname: true, ml_user_id: true },
      orderBy: { created_at: "desc" },
    }),
    prisma.shopeeAccount.findMany({
      where: { userId },
      select: { id: true, shop_name: true, shop_id: true },
      orderBy: { created_at: "desc" },
    }),
  ]);

  return [
    ...meliAccounts.map((account) => ({
      id: account.id,
      nome: account.nickname?.trim() || account.ml_user_id.toString(),
      plataforma: "Mercado Livre",
      tipo: "meli" as const,
    })),
    ...shopeeAccounts.map((account) => ({
      id: account.id,
      nome: account.shop_name?.trim() || account.shop_id,
      plataforma: "Shopee",
      tipo: "shopee" as const,
    })),
  ].sort((a, b) =>
    `${a.plataforma} ${a.nome}`.localeCompare(
      `${b.plataforma} ${b.nome}`,
      "pt-BR",
    ),
  );
}

export async function resolveTaxAccount(
  userId: string,
  input: { accountId?: unknown; plataforma?: unknown; conta?: unknown },
): Promise<TaxAccount | null> {
  const accountId =
    typeof input.accountId === "string" ? input.accountId.trim() : "";
  const plataforma =
    input.plataforma === "meli" || input.plataforma === "shopee"
      ? input.plataforma
      : null;

  const accounts = await listTaxAccounts(userId);
  if (accountId && plataforma) {
    return (
      accounts.find(
        (account) =>
          account.id === accountId && account.tipo === plataforma,
      ) || null
    );
  }

  // Compatibilidade com clientes antigos que ainda enviam apenas o nome.
  const conta = typeof input.conta === "string" ? input.conta.trim() : "";
  if (!conta) return null;
  const normalizedConta = conta.toLocaleLowerCase("pt-BR");
  const matches = accounts.filter(
    (account) =>
      account.nome.toLocaleLowerCase("pt-BR") === normalizedConta,
  );

  return matches.length === 1 ? matches[0] : null;
}
