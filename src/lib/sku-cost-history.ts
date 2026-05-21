import prisma from "@/lib/prisma";

/**
 * Builds a historical cost lookup map for a set of SKU codes.
 * 
 * This queries the `sku_custo_historico` table and builds a timeline
 * of cost changes per SKU. The returned object has a `getCostAtDate`
 * method that returns the cost that was active at a given date.
 * 
 * This ensures that past sales use the cost that was valid at the time
 * of the sale, not the current cost.
 */
export async function buildHistoricalCostMap(userId: string, skuCodes: string[]) {
  if (skuCodes.length === 0) {
    return {
      getCostAtDate: () => 0,
      getCurrentCost: () => 0,
    };
  }

  // Get all SKUs with their current cost and full cost history
  const skus = await prisma.sKU.findMany({
    where: { userId, sku: { in: skuCodes } },
    select: {
      sku: true,
      custoUnitario: true,
      custoHistorico: {
        orderBy: { createdAt: "asc" },
        select: { custoNovo: true, createdAt: true },
      },
    },
  });

  // Build a map: skuCode -> sorted array of { date, cost }
  const costTimelines = new Map<string, Array<{ date: Date; cost: number }>>();
  const currentCosts = new Map<string, number>();

  for (const sku of skus) {
    const currentCost = Number(sku.custoUnitario) || 0;
    currentCosts.set(sku.sku, currentCost);

    const timeline = sku.custoHistorico.map((h) => ({
      date: new Date(h.createdAt),
      cost: Number(h.custoNovo),
    }));

    if (timeline.length === 0) {
      // No history at all — use current cost for all dates
      timeline.push({ date: new Date(0), cost: currentCost });
    }

    costTimelines.set(sku.sku, timeline);
  }

  return {
    /**
     * Get the cost that was active for a given SKU at a specific date.
     * Uses binary search on the sorted timeline.
     */
    getCostAtDate(skuCode: string, saleDate: Date): number {
      const timeline = costTimelines.get(skuCode);
      if (!timeline || timeline.length === 0) return 0;

      // Binary search: find the last entry where date <= saleDate
      let lo = 0;
      let hi = timeline.length - 1;
      let result = -1;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (timeline[mid].date <= saleDate) {
          result = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (result >= 0) {
        return timeline[result].cost;
      }

      // Sale happened before first recorded cost — use the first known cost
      return timeline[0].cost;
    },

    /**
     * Get the current (most recent) cost for a SKU.
     */
    getCurrentCost(skuCode: string): number {
      return currentCosts.get(skuCode) || 0;
    },
  };
}
