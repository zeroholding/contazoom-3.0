"use server";

import { revalidatePath } from "next/cache";
import { promotionUser } from "@/lib/ml-promotions-session";
import { syncAllPromotions, type PromotionSyncSummary } from "@/lib/ml-promotions-sync";

export type PromotionSyncResult =
  | { ok: true; summary: PromotionSyncSummary }
  | { ok: false; error: string };

export async function syncPromotionsAction(): Promise<PromotionSyncResult> {
  const userId = await promotionUser();
  if (!userId) return { ok: false, error: "Entre novamente para sincronizar promoções." };

  try {
    const summary = await syncAllPromotions(userId);
    revalidatePath("/promocoes", "layout");
    if (summary.accounts > 0 && summary.errors.length === summary.accounts && summary.items === 0) {
      return { ok: false, error: "Nenhuma conta pôde concluir a sincronização. Verifique as conexões do Mercado Livre." };
    }
    return { ok: true, summary };
  } catch (error) {
    console.error("[Promoções ML] Falha ao sincronizar", error);
    return { ok: false, error: "Falha ao sincronizar as promoções." };
  }
}
