"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type RefundState = { error?: string; success?: string; refundAmount?: number };
type RefundItemPayload = { sale_item_id: string; quantity: number };

export async function refundSale(_: RefundState, formData: FormData): Promise<RefundState> {
  await requireSuperAdmin();
  const saleId = String(formData.get("saleId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const restock = formData.get("restock") === "true";
  const rawItems = String(formData.get("items") ?? "[]");

  if (!saleId) return { error: "The sale is missing." };
  if (reason.length < 3) return { error: "Enter a reason for the refund." };

  let items: RefundItemPayload[];
  try {
    items = JSON.parse(rawItems) as RefundItemPayload[];
  } catch {
    return { error: "The selected refund items could not be read." };
  }
  if (!Array.isArray(items) || !items.length) return { error: "Select at least one item and quantity to refund." };
  if (items.some((item) => !item.sale_item_id || !Number.isInteger(item.quantity) || item.quantity <= 0)) return { error: "Check the refund quantities." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("refund_sale_items", {
    p_sale_id: saleId,
    p_reason: reason,
    p_restock: restock,
    p_items: items,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("refund_sale_items")) return { error: "The refunds database update has not been installed yet." };
    return { error: error.message || "The refund could not be processed." };
  }

  const result = data as { refund_amount: number | string };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sales");
  revalidatePath(`/dashboard/sales/${saleId}`);
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/activity");
  return { success: "Refund recorded and reports updated.", refundAmount: Number(result.refund_amount) };
}

export async function updateFulfillment(formData: FormData) {
  await requireUser();
  const saleId = String(formData.get("saleId") ?? "");
  const status = String(formData.get("fulfillmentStatus") ?? "");
  if (!saleId || !["pending", "packed", "shipped", "delivered", "completed"].includes(status)) return;
  const supabase = await createClient();
  await supabase.rpc("update_fulfillment_status", { p_sale_id: saleId, p_status: status });
  revalidatePath("/dashboard/sales");
  revalidatePath(`/dashboard/sales/${saleId}`);
  revalidatePath("/dashboard/activity");
}
