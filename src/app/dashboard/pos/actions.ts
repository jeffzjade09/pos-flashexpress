"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CheckoutState = {
  error?: string;
  success?: string;
  receiptNumber?: string;
  totalAmount?: number;
  changeAmount?: number;
  completedAt?: string;
};

type CartPayload = { product_unit_id: string; quantity: number };

export async function completeSale(
  _: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  await requireUser();

  const channel = String(formData.get("channel") ?? "");
  const orderReference = String(formData.get("orderReference") ?? "").trim();
  const paymentMethod = formData.get("paymentMethod") === "gcash" ? "gcash" : "cash";
  const paymentReference = String(formData.get("paymentReference") ?? "").trim();
  const amountTendered = Number(formData.get("amountTendered") ?? 0);
  const rawCart = String(formData.get("cart") ?? "[]");

  if (!["walk_in", "tiktok", "lazada", "shopee"].includes(channel)) {
    return { error: "Choose the order source." };
  }
  if (channel !== "walk_in" && orderReference.length < 2) return { error: "Enter the marketplace order ID." };
  if (channel === "walk_in" && paymentMethod === "gcash" && paymentReference.length < 4) {
    return { error: "Enter the GCash reference ID." };
  }
  if (channel === "walk_in" && paymentMethod === "cash" && (!Number.isFinite(amountTendered) || amountTendered < 0)) {
    return { error: "Enter a valid cash amount." };
  }

  let items: CartPayload[];
  try {
    items = JSON.parse(rawCart) as CartPayload[];
  } catch {
    return { error: "The cart could not be read. Please add the items again." };
  }

  if (!Array.isArray(items) || items.length === 0) return { error: "Add at least one product to the cart." };
  if (items.some((item) => !item.product_unit_id || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    return { error: "One of the cart quantities is invalid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_pos_sale", {
    p_channel: channel,
    p_external_order_id: channel === "walk_in" ? (paymentMethod === "gcash" ? paymentReference : "") : orderReference,
    p_amount_tendered: channel === "walk_in" && paymentMethod === "cash" ? amountTendered : 0,
    p_items: items,
  });

  if (error) {
    if (error.code === "23505") return { error: channel === "walk_in" ? "That GCash reference ID has already been recorded." : `Order ${orderReference} has already been recorded for this marketplace.` };
    if (error.code === "PGRST202" || error.message.includes("complete_pos_sale")) {
      return { error: "The walk-in POS database update has not been installed yet." };
    }
    return { error: error.message || "The sale could not be completed." };
  }

  const result = data as { receipt_number: string; total_amount: number | string; change_amount: number | string; completed_at: string };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/activity");

  return {
    success: "Order completed and inventory updated.",
    receiptNumber: result.receipt_number,
    totalAmount: Number(result.total_amount),
    changeAmount: Number(result.change_amount),
    completedAt: result.completed_at,
  };
}
