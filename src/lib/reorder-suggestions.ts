// Turns low-stock products + recent sales/order history into a suggested reorder
// quantity and a human-readable reason. Pure and side-effect-free so it can be tested
// or tuned without touching any Supabase query code; all thresholds below are named
// constants specifically so they're easy to adjust later.

export const SALES_LOOKBACK_DAYS = 30;
export const DAYS_OF_COVER = 14;
export const HIGH_VELOCITY_THRESHOLD = 1;
export const FREQUENT_EPISODES_WINDOW_DAYS = 90;
export const FREQUENT_EPISODES_THRESHOLD = 2;
export const ZERO_STOCK_FALLBACK_QTY = 10;

export type LowStockProduct = {
  id: string;
  name: string;
  variantLabel: string | null;
  categoryName: string | null;
  stockOnHand: number;
  lowStockThreshold: number;
};

export type ReorderReason = "Frequently reaches low stock" | "High sales velocity" | "Strong recent sales" | "Below minimum stock level";

export type ReorderSuggestion = {
  productId: string;
  productName: string;
  variantLabel: string | null;
  categoryName: string | null;
  currentStock: number;
  suggestedQty: number;
  reason: ReorderReason;
};

function reasonFor(lowStockEpisodes: number, velocityPerDay: number, netPieces: number): ReorderReason {
  if (lowStockEpisodes >= FREQUENT_EPISODES_THRESHOLD) return "Frequently reaches low stock";
  if (velocityPerDay >= HIGH_VELOCITY_THRESHOLD) return "High sales velocity";
  if (netPieces > 0) return "Strong recent sales";
  return "Below minimum stock level";
}

export function computeReorderSuggestions(
  lowStockProducts: LowStockProduct[],
  netPiecesSoldByProduct: Map<string, number>,
  outstandingQtyByProduct: Map<string, number>,
  lowStockEpisodesByProduct: Map<string, number>,
): ReorderSuggestion[] {
  const suggestions: ReorderSuggestion[] = [];

  for (const product of lowStockProducts) {
    const netPieces = netPiecesSoldByProduct.get(product.id) ?? 0;
    const velocityPerDay = netPieces / SALES_LOOKBACK_DAYS;
    const outstanding = outstandingQtyByProduct.get(product.id) ?? 0;
    const episodes = lowStockEpisodesByProduct.get(product.id) ?? 0;

    const targetStock = Math.max(
      product.lowStockThreshold * 2,
      Math.ceil(velocityPerDay * DAYS_OF_COVER),
      product.stockOnHand <= 0 ? ZERO_STOCK_FALLBACK_QTY : 0,
    );
    const rawGap = Math.max(0, targetStock - product.stockOnHand);
    const suggestedQty = Math.max(0, rawGap - outstanding);

    if (suggestedQty <= 0) continue;

    suggestions.push({
      productId: product.id,
      productName: product.name,
      variantLabel: product.variantLabel,
      categoryName: product.categoryName,
      currentStock: product.stockOnHand,
      suggestedQty,
      reason: reasonFor(episodes, velocityPerDay, netPieces),
    });
  }

  return suggestions.sort((a, b) => b.suggestedQty - a.suggestedQty);
}
