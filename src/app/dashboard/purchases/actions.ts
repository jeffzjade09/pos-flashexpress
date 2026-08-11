"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PurchaseState = { error?: string; success?: string };

export async function createSupplier(_: PurchaseState, formData: FormData): Promise<PurchaseState> {
  const current = await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter the supplier name." };
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({ name, contact_name: String(formData.get("contactName") ?? "").trim() || null, phone: String(formData.get("phone") ?? "").trim() || null, email: String(formData.get("email") ?? "").trim() || null, address: String(formData.get("address") ?? "").trim() || null, created_by: current.id });
  if (error) return { error: error.code === "23505" ? "That supplier already exists." : error.message.includes("suppliers") ? "The purchases database update has not been installed yet." : error.message };
  revalidatePath("/dashboard/purchases");
  return { success: "Supplier added." };
}

export async function createPurchase(_: PurchaseState, formData: FormData): Promise<PurchaseState> {
  await requireSuperAdmin();
  const supplierId = String(formData.get("supplierId") ?? "");
  let items: unknown;
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { error: "Purchase items could not be read." }; }
  if (!supplierId) return { error: "Choose a supplier." };
  if (!Array.isArray(items) || !items.length) return { error: "Add at least one product." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_purchase_order", { p_supplier_id: supplierId, p_supplier_reference: String(formData.get("supplierReference") ?? ""), p_notes: String(formData.get("notes") ?? ""), p_items: items });
  if (error) return { error: error.code === "PGRST202" ? "The purchases database update has not been installed yet." : error.message };
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/activity");
  return { success: "Purchase order created." };
}

export async function approveReorderPurchase(_: PurchaseState, formData: FormData): Promise<PurchaseState> {
  await requireSuperAdmin();
  const supplierId = String(formData.get("supplierId") ?? "");
  let items: unknown;
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { error: "Reorder items could not be read." }; }
  if (!supplierId) return { error: "Choose a supplier." };
  if (!Array.isArray(items) || !items.length) return { error: "Add at least one product." };

  const productIds = items.map((item: { product_id?: string }) => String(item.product_id ?? "")).filter(Boolean);
  const supabase = await createClient();
  const { data: costRows, error: costError } = await supabase.from("products").select("id, cost_per_piece").in("id", productIds);
  if (costError) return { error: costError.message };
  const costByProduct = new Map((costRows ?? []).map((row) => [row.id, row.cost_per_piece]));

  const priced = items.map((item: { product_id: string; quantity_pieces: number }) => ({
    product_id: item.product_id,
    quantity_pieces: item.quantity_pieces,
    unit_cost: costByProduct.get(item.product_id) ?? 0,
  }));

  const { data: poId, error } = await supabase.rpc("create_purchase_order", { p_supplier_id: supplierId, p_supplier_reference: String(formData.get("supplierReference") ?? ""), p_notes: String(formData.get("notes") ?? ""), p_items: priced });
  if (error) return { error: error.code === "PGRST202" ? "The reorder database update has not been installed yet." : error.message };

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/activity");
  redirect(`/dashboard/purchases/${poId}/print`);
}

export async function updatePurchaseOrder(_: PurchaseState, formData: FormData): Promise<PurchaseState> {
  await requireSuperAdmin();
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  let items: unknown;
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { error: "Purchase items could not be read." }; }
  if (!purchaseOrderId) return { error: "Purchase order was not found." };
  if (!supplierId) return { error: "Choose a supplier." };
  if (!Array.isArray(items) || !items.length) return { error: "Add at least one product." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_purchase_order", { p_purchase_order_id: purchaseOrderId, p_supplier_id: supplierId, p_supplier_reference: String(formData.get("supplierReference") ?? ""), p_notes: String(formData.get("notes") ?? ""), p_items: items });
  if (error) return { error: error.code === "PGRST202" ? "The purchase order edit update has not been installed yet." : error.message };
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/activity");
  redirect("/dashboard/purchases");
}

export async function deletePurchaseOrder(_: PurchaseState, formData: FormData): Promise<PurchaseState> {
  await requireSuperAdmin();
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!purchaseOrderId) return { error: "Purchase order was not found." };
  if (reason.length < 3) return { error: "Enter a reason for deleting this purchase order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_purchase_order", { p_purchase_order_id: purchaseOrderId, p_reason: reason });
  if (error) return { error: error.code === "PGRST202" ? "The purchase order delete update has not been installed yet." : error.message };
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/purchases/archived");
  revalidatePath("/dashboard/activity");
  return { success: "Purchase order deleted." };
}

export async function receivePurchase(_: PurchaseState, formData: FormData): Promise<PurchaseState> {
  await requireUser();
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  let items: unknown;
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { error: "Received quantities could not be read." }; }
  if (!purchaseOrderId || !Array.isArray(items) || !items.length) return { error: "Enter at least one received quantity." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_purchase_order", { p_purchase_order_id: purchaseOrderId, p_items: items });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/activity");
  return { success: "Inventory received and stock updated." };
}
