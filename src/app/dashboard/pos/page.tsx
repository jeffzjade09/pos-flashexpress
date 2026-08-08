import { ShoppingCart } from "lucide-react";
import { PosWorkspace, type PosProduct } from "@/components/pos-workspace";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PosPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: productRows }, { data: unitRows }] = await Promise.all([
    supabase
      .from("product_stock")
      .select("id, sku, barcode, name, variant_label, category_name, stock_on_hand, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("product_units")
      .select("id, product_id, name, conversion_to_piece, selling_price, barcode, is_active")
      .eq("is_active", true)
      .order("conversion_to_piece"),
  ]);

  const unitsByProduct = new Map<string, PosProduct["units"]>();
  for (const unit of unitRows ?? []) {
    const units = unitsByProduct.get(unit.product_id) ?? [];
    units.push({
      id: unit.id,
      name: unit.name,
      conversionToPiece: Number(unit.conversion_to_piece),
      sellingPrice: Number(unit.selling_price),
      barcode: unit.barcode ?? "",
    });
    unitsByProduct.set(unit.product_id, units);
  }

  const products: PosProduct[] = (productRows ?? []).map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    variant: product.variant_label ?? "",
    categoryName: product.category_name ?? "Uncategorized",
    stockOnHand: Number(product.stock_on_hand),
    barcode: product.barcode ?? "",
    units: unitsByProduct.get(product.id) ?? [],
  })).filter((product) => product.units.length > 0);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex items-end justify-between gap-4">
        <div><p className="eyebrow">Store checkout</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Point of Sale</h1><p className="mt-2 text-sm text-[#718079]">Record walk-in, TikTok, Lazada, and Shopee orders while keeping stock accurate.</p></div>
        <span className="hidden h-11 w-11 place-items-center rounded-xl bg-[#e9f4ef] text-[#0f6b4f] sm:grid"><ShoppingCart size={20} /></span>
      </div>
      <PosWorkspace products={products} />
    </div>
  );
}
