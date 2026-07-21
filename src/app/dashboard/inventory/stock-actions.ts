"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type StockActionState = {
  error?: string;
  success?: string;
  newStock?: number;
};

export async function adjustStock(
  _: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  await requireUser();

  const productId = String(formData.get("productId") ?? "");
  const productName = String(formData.get("productName") ?? "Product");
  const mode = String(formData.get("mode") ?? "");
  const unit = formData.get("unit") === "box" ? "box" : "piece";
  const amount = Number(formData.get("quantity"));
  const note = String(formData.get("note") ?? "").trim();

  if (!productId) return { error: "Product is missing." };
  if (!["add", "remove", "set"].includes(mode)) return { error: "Choose an adjustment type." };
  if (!Number.isInteger(amount) || amount < 0) return { error: "Quantity must be a positive whole number." };
  if (mode !== "set" && amount === 0) return { error: "Enter a quantity greater than zero." };
  if (note.length < 3) return { error: "Enter a short reason for this adjustment." };

  const supabase = await createClient();
  let multiplier = 1;

  if (unit === "box") {
    const { data: boxUnit, error: unitError } = await supabase
      .from("product_units")
      .select("conversion_to_piece")
      .eq("product_id", productId)
      .eq("name", "Box")
      .single();

    if (unitError || !boxUnit) return { error: "This product does not have a box unit configured." };
    multiplier = Number(boxUnit.conversion_to_piece);
  }

  const quantityPieces = amount * multiplier;
  const { data, error } = await supabase.rpc("adjust_inventory_stock", {
    p_product_id: productId,
    p_mode: mode,
    p_quantity: quantityPieces,
    p_note: note,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("adjust_inventory_stock")) {
      return { error: "The stock-adjustment database update has not been installed yet." };
    }
    return { error: error.message || "Could not adjust stock." };
  }

  const newStock = Number(data);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  return { success: `${productName} now has ${newStock} pieces on hand.`, newStock };
}
