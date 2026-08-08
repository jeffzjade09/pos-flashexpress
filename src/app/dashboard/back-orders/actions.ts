"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ListingState = { error?: string; success?: string };

export async function updateBackOrderListing(_: ListingState, formData: FormData): Promise<ListingState> {
  await requireSuperAdmin();

  const productId = String(formData.get("productId") ?? "");
  const resalePriceRaw = String(formData.get("resalePrice") ?? "").trim();
  const conditionNotes = String(formData.get("conditionNotes") ?? "").trim();
  const resalePrice = resalePriceRaw ? Number(resalePriceRaw) : null;

  if (!productId) return { error: "The item is missing." };
  if (resalePriceRaw && (!Number.isFinite(resalePrice) || (resalePrice as number) < 0)) return { error: "Enter a valid resale price." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_back_order_listing", {
    p_product_id: productId,
    p_resale_price: resalePrice,
    p_condition_notes: conditionNotes || null,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("update_back_order_listing")) {
      return { error: "The back orders database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not update the listing." };
  }

  revalidatePath("/dashboard/back-orders");
  return { success: "Listing updated." };
}
