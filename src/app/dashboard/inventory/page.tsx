import Link from "next/link";
import { Boxes, CircleDollarSign, Download, Filter, PackageSearch, Search } from "lucide-react";
import { AdjustStockForm } from "@/components/adjust-stock-form";
import { AutoPrint } from "@/components/auto-print";
import { CreateProductFamilyForm } from "@/components/create-product-family-form";
import { DeleteProductButton } from "@/components/delete-product-button";
import { EditProductForm } from "@/components/edit-product-form";
import { InventoryFamilyGroup } from "@/components/inventory-family-group";
import { VariantAttributeChip } from "@/components/variant-attribute-chip";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { defaultVariantColor, variantColorKey, type VariantColorPreset } from "@/lib/variant-colors";

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

type ProductStockRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  variant_label: string | null;
  variant_attributes: { type: string; value: string }[] | null;
  family_id: string;
  family_name: string | null;
  category_name: string | null;
  cost_per_piece: number | string;
  stock_on_hand: number | string;
  low_stock_threshold: number | string;
  is_active: boolean;
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ print?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: products, error: productsError }, { data: productUnits, error: unitsError }, { data: colorRows }] = await Promise.all([
    supabase.from("product_stock").select("id, sku, barcode, name, variant_label, variant_attributes, family_id, family_name, category_name, cost_per_piece, stock_on_hand, low_stock_threshold, is_active").eq("is_active", true).order("name"),
    supabase.from("product_units").select("product_id, name, conversion_to_piece, selling_price, is_active"),
    supabase.from("variant_value_colors").select("variant_type, variant_value, color"),
  ]);
  const unitsByProduct = new Map<string, typeof productUnits>();
  for (const unit of productUnits ?? []) {
    const units = unitsByProduct.get(unit.product_id) ?? [];
    units.push(unit);
    unitsByProduct.set(unit.product_id, units);
  }
  const colorByVariant = new Map<string, VariantColorPreset>();
  for (const row of colorRows ?? []) {
    colorByVariant.set(variantColorKey(row.variant_type, row.variant_value), row.color as VariantColorPreset);
  }
  function colorFor(type: string, value: string): VariantColorPreset {
    return colorByVariant.get(variantColorKey(type, value)) ?? defaultVariantColor(type, value);
  }

  const activeProducts = (products ?? []) as ProductStockRow[];
  const totalPieces = activeProducts.reduce((sum, product) => sum + Number(product.stock_on_hand), 0);
  const totalInventoryValue = activeProducts.reduce(
    (sum, product) => sum + Number(product.stock_on_hand) * Number(product.cost_per_piece),
    0,
  );

  const familyGroups = new Map<string, ProductStockRow[]>();
  for (const product of activeProducts) {
    const group = familyGroups.get(product.family_id) ?? [];
    group.push(product);
    familyGroups.set(product.family_id, group);
  }

  function actionsCell(product: ProductStockRow, displayName: string, pieceUnit: { selling_price: number | string } | undefined, boxUnit: { selling_price: number | string; conversion_to_piece: number | string } | undefined) {
    return (
      <div className="flex items-center justify-end gap-2">
        {user.role === "super_admin" && (
          <EditProductForm
            product={{
              id: product.id,
              familyId: product.family_id,
              name: product.name,
              variantAttributes: product.variant_attributes ?? [],
              sku: product.sku,
              category: product.category_name ?? "",
              barcode: product.barcode ?? "",
              costPerPiece: Number(product.cost_per_piece),
              piecePrice: Number(pieceUnit?.selling_price ?? 0),
              piecesPerBox: Number(boxUnit?.conversion_to_piece ?? 1),
              boxPrice: Number(boxUnit?.selling_price ?? 0),
              lowStockThreshold: Number(product.low_stock_threshold),
            }}
          />
        )}
        <AdjustStockForm productId={product.id} productName={displayName} currentStock={Number(product.stock_on_hand)} piecesPerBox={boxUnit ? Number(boxUnit.conversion_to_piece) : undefined} />
        {user.role === "super_admin" && <DeleteProductButton productId={product.id} productName={displayName} stockOnHand={Number(product.stock_on_hand)} />}
      </div>
    );
  }

  function trailingCells(product: ProductStockRow, displayName: string) {
    const low = Number(product.stock_on_hand) <= Number(product.low_stock_threshold);
    const units = unitsByProduct.get(product.id) ?? [];
    const pieceUnit = units.find((unit) => unit.name === "Piece");
    const boxUnit = units.find((unit) => unit.name === "Box" && unit.is_active);
    const productValue = Number(product.stock_on_hand) * Number(product.cost_per_piece);
    return (
      <>
        <td className="px-5 py-4 text-sm text-[#6f7d76]">{product.sku}</td>
        <td className="px-5 py-4 text-sm text-[#6f7d76]">{product.category_name ?? "Uncategorized"}</td>
        <td className="px-5 py-4 text-sm font-extrabold">{product.stock_on_hand} <span className="font-medium text-[#8a958f]">pcs</span></td>
        <td className="px-5 py-4 text-right text-sm font-bold text-[#64736b]">{money(Number(product.cost_per_piece))}</td>
        <td className="px-5 py-4 text-right text-sm font-black text-[#0f6b4f]">{money(productValue)}</td>
        <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${low ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>{low ? "LOW STOCK" : "IN STOCK"}</span></td>
        <td className="px-5 py-4">{actionsCell(product, displayName, pieceUnit, boxUnit)}</td>
      </>
    );
  }

  function productRow(product: ProductStockRow) {
    const displayName = `${product.name}${product.variant_label ? ` — ${product.variant_label}` : ""}`;
    return (
      <tr key={product.id} className="border-b border-[#edf0ee] last:border-0 hover:bg-[#fbfcfb]">
        <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf5f1] text-[#0f6b4f]"><Boxes size={18} /></span><span><span className="block font-bold">{product.name}</span>{product.variant_label && <span className="mt-0.5 block text-xs font-semibold text-[#7d8a83]">{product.variant_label}</span>}</span></div></td>
        {trailingCells(product, displayName)}
      </tr>
    );
  }

  function variantRow(product: ProductStockRow) {
    const displayName = `${product.name}${product.variant_label ? ` — ${product.variant_label}` : ""}`;
    const attributes = product.variant_attributes ?? [];
    return (
      <tr key={product.id} className="border-b border-[#edf0ee] bg-[#fcfdfc] last:border-0 hover:bg-[#f6f9f7]">
        <td className="border-l-2 border-l-[#dde6e1] px-5 py-3">
          <div className="relative flex items-center gap-2.5 pl-7">
            <span aria-hidden className="absolute left-2.5 top-0 h-1/2 w-px bg-[#d8e0dc]" />
            <span aria-hidden className="absolute left-2.5 top-1/2 h-px w-3.5 bg-[#d8e0dc]" />
            <div className="flex flex-wrap items-center gap-1.5">
              {attributes.map((attribute) => (
                <VariantAttributeChip color={colorFor(attribute.type, attribute.value)} key={`${attribute.type}:${attribute.value}`} type={attribute.type} value={attribute.value} />
              ))}
            </div>
          </div>
          <p className="mt-1 pl-7 text-[11px] font-medium text-[#a3ada8]">{product.name}</p>
        </td>
        {trailingCells(product, displayName)}
      </tr>
    );
  }

  return (
    <div className="page-print mx-auto max-w-[1400px]">
      <AutoPrint enabled={params.print === "1"} />
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Stock control</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Inventory</h1><p className="mt-2 text-sm text-[#718079]">Manage products sold by piece, pack, or box.</p></div><div className="print-hidden flex gap-2"><Link className="btn-secondary" href="/api/export/inventory"><Download size={15} />Export</Link><CreateProductFamilyForm /></div></div>
      {(productsError || unitsError) && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Run the latest product variants migration in Supabase, then refresh this page.</div>}
      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <article className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#718078]">Overall inventory value</p><p className="mt-3 text-3xl font-black tracking-tight">{money(totalInventoryValue)}</p><p className="mt-2 text-xs text-[#89948e]">All active stock valued at cost per piece</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CircleDollarSign size={18} /></span></div></article>
        <article className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#718078]">Active products</p><p className="mt-3 text-3xl font-black tracking-tight">{activeProducts.length.toLocaleString()}</p><p className="mt-2 text-xs text-[#89948e]">Product records included in the total</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><PackageSearch size={18} /></span></div></article>
        <article className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#718078]">Total pieces on hand</p><p className="mt-3 text-3xl font-black tracking-tight">{totalPieces.toLocaleString()}</p><p className="mt-2 text-xs text-[#89948e]">Combined physical pieces across products</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Boxes size={18} /></span></div></article>
      </section>
      <div className="card mt-7 overflow-hidden">
        <div className="print-hidden flex flex-col gap-3 border-b border-[#e5eae7] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#89958f]" size={17} /><input className="field py-2.5 pl-9 text-sm" placeholder="Search product, SKU, or barcode" /></div><button className="btn-secondary"><Filter size={15} />Filters</button></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left">
            <thead><tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#87928c]"><th className="px-5 py-3.5">Product</th><th className="px-5 py-3.5">SKU</th><th className="px-5 py-3.5">Category</th><th className="px-5 py-3.5">On hand</th><th className="px-5 py-3.5 text-right">Cost / piece</th><th className="px-5 py-3.5 text-right">Product total</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead>
            <tbody>
              {[...familyGroups.values()].map((group) => {
                if (!group || group.length === 0) return null;
                if (group.length === 1) return productRow(group[0]);
                const familyName = group[0].family_name ?? group[0].name;
                const totalStock = group.reduce((sum, product) => sum + Number(product.stock_on_hand), 0);
                const totalValue = group.reduce((sum, product) => sum + Number(product.stock_on_hand) * Number(product.cost_per_piece), 0);
                return (
                  <InventoryFamilyGroup
                    key={group[0].family_id}
                    familyName={familyName}
                    categoryName={group[0].category_name ?? "Uncategorized"}
                    combinationCount={group.length}
                    totalStock={totalStock}
                    totalValue={money(totalValue)}
                  >
                    {group.map((product) => variantRow(product))}
                  </InventoryFamilyGroup>
                );
              })}
              {!activeProducts.length && <tr><td colSpan={8}><div className="grid min-h-72 place-items-center text-center"><div><Boxes className="mx-auto text-[#a5afa9]" size={34} /><p className="mt-4 text-sm font-bold">No products yet</p><p className="mt-1 text-xs text-[#87928c]">Add your first product to start tracking stock.</p></div></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
