import prisma from "@/lib/prisma";
import type { FlexShippingConfigValues } from "@/lib/flex-shipping";

export async function loadActiveFlexShippingConfig(
  userId: string,
): Promise<FlexShippingConfigValues | null> {
  const config = await prisma.flexShippingConfig.findFirst({
    where: { userId, ativo: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      custoPorPacote: true,
      unidadesPorCobranca: true,
      descricao: true,
      updatedAt: true,
    },
  });

  if (!config) return null;

  return {
    id: config.id,
    custoPorPacote: Number(config.custoPorPacote),
    unidadesPorCobranca: config.unidadesPorCobranca,
    descricao: config.descricao,
    updatedAt: config.updatedAt,
  };
}
