
export function mapListingTypeToExposure(listingType: string | null): string | null {
  if (!listingType) return null;
  const normalized = listingType.toLowerCase();

  // gold_pro é Premium
  if (normalized === "gold_pro") return "Premium";

  // gold_special e outros tipos gold são Clássico
  if (normalized.startsWith("gold")) return "Clássico";

  // Silver é Clássico
  if (normalized === "silver") return "Clássico";

  // Outros tipos defaultam para Clássico
  return "Clássico";
}

export const adsTags = ['ads', 'buyer_campaign', 'promotion', 'order_has_discount']
