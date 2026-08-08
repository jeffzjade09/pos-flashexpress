import { PackageX } from "lucide-react";
import { BackOrderListingForm } from "@/components/back-order-listing-form";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type BackOrderStockRow = {
  id: string;
  sku: string;
  name: string;
  category_name: string | null;
  variant_label: string | null;
  stock_on_hand: number;
  resale_price: number | string | null;
  condition_notes: string | null;
};

type SaleRef = { receipt_number: string } | { receipt_number: string }[] | null;
type SaleItemRef = { product_id: string; sale: SaleRef } | { product_id: string; sale: SaleRef }[] | null;
type TraceRow = { id: string; quantity: number; created_at: string; sale_item: SaleItemRef };

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function BackOrdersPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: stockRows, error: stockError }, { data: traceRows }] = await Promise.all([
    supabase.from("back_order_stock").select("id, sku, name, category_name, variant_label, stock_on_hand, resale_price, condition_notes").order("name"),
    supabase
      .from("return_classifications")
      .select("id, quantity, created_at, sale_item:sale_items(product_id, sale:sales(receipt_number))")
      .eq("classification", "bad")
      .order("created_at", { ascending: false }),
  ]);

  const traceByProduct = new Map<string, { receiptNumber: string; quantity: number }[]>();
  for (const row of (traceRows ?? []) as unknown as TraceRow[]) {
    const saleItem = single(row.sale_item);
    if (!saleItem) continue;
    const sale = single(saleItem.sale);
    if (!sale) continue;
    const list = traceByProduct.get(saleItem.product_id) ?? [];
    list.push({ receiptNumber: sale.receipt_number, quantity: row.quantity });
    traceByProduct.set(saleItem.product_id, list);
  }

  const products = (stockRows ?? []) as BackOrderStockRow[];

  return (
    <div className="mx-auto max-w-4xl">
      <div><p className="eyebrow">Damaged & unsellable returns</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Back orders</h1><p className="mt-2 text-sm text-[#718079]">Stock classified as bad during return inspection. Tracked separately from regular sellable inventory.</p></div>

      {stockError && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">The Back Orders database update has not been installed yet. Run the latest Supabase migration, then refresh this page.</div>}

      <div className="mt-6 space-y-4">
        {products.map((product) => {
          const trace = traceByProduct.get(product.id) ?? [];
          return (
            <article className="card p-5" key={product.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold">{product.name}{product.variant_label && <span className="ml-1.5 font-semibold text-[#7d8a83]">— {product.variant_label}</span>}</p>
                  <p className="mt-0.5 text-xs text-[#89948e]">{product.sku} · {product.category_name ?? "Uncategorized"}</p>
                </div>
                <span className="rounded-full bg-[#fdf1e7] px-2.5 py-1 text-[10px] font-extrabold text-[#a5591b]">{product.stock_on_hand} PCS IN BACK ORDERS</span>
              </div>

              {trace.length > 0 && (
                <p className="mt-3 text-[11px] text-[#89948e]">From: {trace.map((entry, index) => <span key={`${entry.receiptNumber}-${index}`}>{index > 0 && ", "}{entry.receiptNumber} ({entry.quantity})</span>)}</p>
              )}

              <div className="mt-4 border-t border-[#edf0ee] pt-4">
                <BackOrderListingForm conditionNotes={product.condition_notes} productId={product.id} resalePrice={product.resale_price === null ? null : Number(product.resale_price)} />
              </div>
            </article>
          );
        })}

        {!stockError && products.length === 0 && (
          <div className="card grid min-h-52 place-items-center text-center"><div><PackageX className="mx-auto text-[#a5afa9]" size={30} /><p className="mt-3 text-sm font-bold">No back-ordered stock</p><p className="mt-1 text-xs text-[#87928c]">Items classified as bad during return inspection will appear here.</p></div></div>
        )}
      </div>
    </div>
  );
}
