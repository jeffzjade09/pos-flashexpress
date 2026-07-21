"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type DeleteProductState = { error?: string; success?: string };

export async function deleteProduct(
  _: DeleteProductState,
  formData: FormData,
): Promise<DeleteProductState> {
  await requireSuperAdmin();
  const productId = String(formData.get("productId") ?? "");
  const productName = String(formData.get("productName") ?? "Product");

  if (!productId) return { error: "Product is missing." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_inventory_product", {
    p_product_id: productId,
  });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("archive_inventory_product")) {
      return { error: "The product deletion database update has not been installed yet." };
    }
    return { error: error.message || "Could not delete the product." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  return { success: `${productName} was removed from active inventory.` };
}
