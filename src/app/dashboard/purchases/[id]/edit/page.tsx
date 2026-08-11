import { redirect } from "next/navigation";
import { EditPurchaseOrderForm, type EditableLine } from "@/components/purchase-forms";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: po }, { data: suppliers }, { data: products }] = await Promise.all([
    supabase.from("purchase_orders").select("id, status, supplier_id, supplier_reference, notes, purchase_order_items(product_id, product_name, quantity_pieces, unit_cost)").eq("id", id).maybeSingle(),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("product_stock").select("id, name, variant_label, sku, cost_per_piece").eq("is_active", true).order("name"),
  ]);

  if (!po || po.status !== "ordered") redirect("/dashboard/purchases");

  for (const product of products ?? []) {
    if (product.variant_label) product.name = `${product.name} — ${product.variant_label}`;
  }

  const initialLines: EditableLine[] = po.purchase_order_items.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    quantity_pieces: Number(item.quantity_pieces),
    unit_cost: Number(item.unit_cost),
  }));

  return (
    <div className="mx-auto max-w-[1000px]">
      <div>
        <p className="eyebrow">Inventory replenishment</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Edit purchase order</h1>
        <p className="mt-2 text-sm text-[#718079]">Adjust products, quantities, or supplier details before this order is received.</p>
      </div>
      <EditPurchaseOrderForm
        initialLines={initialLines}
        initialNotes={po.notes ?? ""}
        initialSupplierId={po.supplier_id}
        initialSupplierReference={po.supplier_reference ?? ""}
        products={(products ?? []).map((product) => ({ id: product.id, name: product.name, sku: product.sku, cost: Number(product.cost_per_piece) }))}
        purchaseOrderId={po.id}
        suppliers={(suppliers ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name }))}
      />
    </div>
  );
}
