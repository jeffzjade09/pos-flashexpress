import { ReorderReviewForm } from "@/components/reorder-review-form";
import { requireSuperAdmin } from "@/lib/auth";
import { computeReorderSuggestions, FREQUENT_EPISODES_WINDOW_DAYS, SALES_LOOKBACK_DAYS, type LowStockProduct } from "@/lib/reorder-suggestions";
import { createClient } from "@/lib/supabase/server";

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function manilaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export default async function ReorderPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const today = manilaDateParts(new Date());
  const todaySerial = Date.UTC(today.year, today.month - 1, today.day) + DAY_MS;
  const salesStartAt = new Date(todaySerial - SALES_LOOKBACK_DAYS * DAY_MS - MANILA_OFFSET_MS).toISOString();
  const episodesStartAt = new Date(todaySerial - FREQUENT_EPISODES_WINDOW_DAYS * DAY_MS - MANILA_OFFSET_MS).toISOString();

  const [{ data: stockRows }, { data: saleItemRows }, { data: outstandingRows }, { data: notificationRows }, { data: suppliers }, { data: allProducts }] = await Promise.all([
    supabase.from("product_stock").select("id, name, variant_label, category_name, stock_on_hand, low_stock_threshold").eq("is_active", true),
    supabase
      .from("sale_items")
      .select("product_id, quantity, refunded_quantity, conversion_to_piece, sales!inner(status, completed_at)")
      .in("sales.status", ["completed", "partially_refunded", "refunded"])
      .gte("sales.completed_at", salesStartAt),
    supabase
      .from("purchase_order_items")
      .select("product_id, quantity_pieces, received_pieces, purchase_orders!inner(status)")
      .in("purchase_orders.status", ["ordered", "partially_received"]),
    supabase.from("notifications").select("dedupe_key, created_at").eq("category", "low_stock").gte("created_at", episodesStartAt),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("product_stock").select("id, name, variant_label, sku, cost_per_piece, stock_on_hand").eq("is_active", true).order("name"),
  ]);

  const lowStockProducts: LowStockProduct[] = (stockRows ?? [])
    .filter((row) => Number(row.stock_on_hand) <= Number(row.low_stock_threshold))
    .map((row) => ({
      id: row.id,
      name: row.name,
      variantLabel: row.variant_label,
      categoryName: row.category_name,
      stockOnHand: Number(row.stock_on_hand),
      lowStockThreshold: Number(row.low_stock_threshold),
    }));

  const netPiecesSoldByProduct = new Map<string, number>();
  for (const item of saleItemRows ?? []) {
    const netQuantity = Number(item.quantity) - Number(item.refunded_quantity);
    const current = netPiecesSoldByProduct.get(item.product_id) ?? 0;
    netPiecesSoldByProduct.set(item.product_id, current + netQuantity * Number(item.conversion_to_piece));
  }

  const outstandingQtyByProduct = new Map<string, number>();
  for (const item of outstandingRows ?? []) {
    const remaining = Number(item.quantity_pieces) - Number(item.received_pieces);
    const current = outstandingQtyByProduct.get(item.product_id) ?? 0;
    outstandingQtyByProduct.set(item.product_id, current + remaining);
  }

  const lowStockEpisodesByProduct = new Map<string, number>();
  for (const row of notificationRows ?? []) {
    const productId = row.dedupe_key?.startsWith("low_stock:product:") ? row.dedupe_key.slice("low_stock:product:".length) : null;
    if (!productId) continue;
    lowStockEpisodesByProduct.set(productId, (lowStockEpisodesByProduct.get(productId) ?? 0) + 1);
  }

  const suggestions = computeReorderSuggestions(lowStockProducts, netPiecesSoldByProduct, outstandingQtyByProduct, lowStockEpisodesByProduct);

  const products = (allProducts ?? []).map((product) => ({
    id: product.id,
    name: product.variant_label ? `${product.name} — ${product.variant_label}` : product.name,
    sku: product.sku,
    stockOnHand: Number(product.stock_on_hand),
  }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <div>
        <p className="eyebrow">Inventory replenishment</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Reorder from low stock</h1>
        <p className="mt-2 text-sm text-[#718079]">
          Review the suggested quantities below, adjust or remove any product, add others manually, then approve to create the purchase order.
          Nothing is saved until you approve.
        </p>
      </div>

      <ReorderReviewForm
        suggestions={suggestions}
        suppliers={(suppliers ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        products={products}
      />
    </div>
  );
}
