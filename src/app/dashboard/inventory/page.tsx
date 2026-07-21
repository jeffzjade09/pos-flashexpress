import Link from "next/link";
import { Boxes, Download, Filter, Search } from "lucide-react";
import { AddProductForm } from "@/components/add-product-form";
import { AdjustStockForm } from "@/components/adjust-stock-form";
import { AutoPrint } from "@/components/auto-print";
import { DeleteProductButton } from "@/components/delete-product-button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ print?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: products }, { data: boxUnits }] = await Promise.all([
    supabase.from("product_stock").select("id, sku, name, category_name, stock_on_hand, low_stock_threshold, is_active").eq("is_active", true).order("name"),
    supabase.from("product_units").select("product_id, conversion_to_piece").eq("name", "Box"),
  ]);
  const boxesByProduct = new Map((boxUnits ?? []).map((unit) => [unit.product_id, Number(unit.conversion_to_piece)]));

  return (
    <div className="page-print mx-auto max-w-[1400px]">
      <AutoPrint enabled={params.print === "1"} />
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Stock control</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Inventory</h1><p className="mt-2 text-sm text-[#718079]">Manage products sold by piece, pack, or box.</p></div><div className="print-hidden flex gap-2"><Link className="btn-secondary" href="/api/export/inventory"><Download size={15} />Export</Link><AddProductForm /></div></div>
      <div className="card mt-7 overflow-hidden">
        <div className="print-hidden flex flex-col gap-3 border-b border-[#e5eae7] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#89958f]" size={17} /><input className="field py-2.5 pl-9 text-sm" placeholder="Search product, SKU, or barcode" /></div><button className="btn-secondary"><Filter size={15} />Filters</button></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead><tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#87928c]"><th className="px-5 py-3.5">Product</th><th className="px-5 py-3.5">SKU</th><th className="px-5 py-3.5">Category</th><th className="px-5 py-3.5">On hand</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead>
            <tbody>
              {(products ?? []).map((product) => {
                const low = Number(product.stock_on_hand) <= Number(product.low_stock_threshold);
                return <tr key={product.id} className="border-b border-[#edf0ee] last:border-0 hover:bg-[#fbfcfb]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf5f1] text-[#0f6b4f]"><Boxes size={18} /></span><span className="font-bold">{product.name}</span></div></td><td className="px-5 py-4 text-sm text-[#6f7d76]">{product.sku}</td><td className="px-5 py-4 text-sm text-[#6f7d76]">{product.category_name ?? "Uncategorized"}</td><td className="px-5 py-4 text-sm font-extrabold">{product.stock_on_hand} <span className="font-medium text-[#8a958f]">pcs</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${low ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>{low ? "LOW STOCK" : "IN STOCK"}</span></td><td className="px-5 py-4"><div className="flex items-center justify-end gap-2"><AdjustStockForm productId={product.id} productName={product.name} currentStock={Number(product.stock_on_hand)} piecesPerBox={boxesByProduct.get(product.id)} />{user.role === "super_admin" && <DeleteProductButton productId={product.id} productName={product.name} stockOnHand={Number(product.stock_on_hand)} />}</div></td></tr>;
              })}
              {!products?.length && <tr><td colSpan={6}><div className="grid min-h-72 place-items-center text-center"><div><Boxes className="mx-auto text-[#a5afa9]" size={34} /><p className="mt-4 text-sm font-bold">No products yet</p><p className="mt-1 text-xs text-[#87928c]">Add your first product to start tracking stock.</p></div></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
