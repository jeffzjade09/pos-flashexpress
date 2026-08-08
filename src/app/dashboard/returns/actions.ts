"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ClassifyState = { error?: string; success?: string };

export async function classifyReturnedUnits(_: ClassifyState, formData: FormData): Promise<ClassifyState> {
  await requireSuperAdmin();

  const saleItemId = String(formData.get("saleItemId") ?? "");
  const classification = formData.get("classification") === "bad" ? "bad" : "good";
  const quantity = Number(formData.get("quantity") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  const photos = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!saleItemId) return { error: "The returned item is missing." };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Enter a valid quantity." };
  if (reason.length < 3) return { error: "Enter a reason for this classification." };
  if (classification === "bad" && photos.length === 0) return { error: "Attach at least one photo for a bad classification." };

  const supabase = await createClient();
  const photoPaths: string[] = [];

  if (classification === "bad") {
    for (const photo of photos) {
      const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${saleItemId}/${randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("return-photos").upload(path, photo, { contentType: photo.type || "image/jpeg" });
      if (uploadError) {
        if (photoPaths.length) await supabase.storage.from("return-photos").remove(photoPaths);
        return { error: "Could not upload one of the photos. Please try again." };
      }
      photoPaths.push(path);
    }
  }

  const { error } = await supabase.rpc("classify_returned_units", {
    p_sale_item_id: saleItemId,
    p_classification: classification,
    p_quantity: quantity,
    p_reason: reason,
    p_photo_paths: photoPaths.length ? photoPaths : null,
  });

  if (error) {
    if (photoPaths.length) await supabase.storage.from("return-photos").remove(photoPaths);
    if (error.code === "PGRST202" || error.message.includes("classify_returned_units")) {
      return { error: "The back orders database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not record the classification." };
  }

  revalidatePath("/dashboard/returns");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/back-orders");
  revalidatePath("/dashboard/activity");
  return { success: classification === "good" ? "Marked good and restocked to regular inventory." : "Marked bad and added to Back Orders." };
}
