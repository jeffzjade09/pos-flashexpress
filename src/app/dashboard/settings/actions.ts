"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error?: string; success?: string };

export async function updateStoreSettings(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireSuperAdmin();
  const companyName = String(formData.get("companyName") ?? "").trim();
  if (!companyName) return { error: "Company name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").upsert({
    id: true,
    company_name: companyName,
    contact_number: String(formData.get("contactNumber") ?? "").trim() || null,
    store_address: String(formData.get("storeAddress") ?? "").trim() || null,
    sales_officer_name: String(formData.get("salesOfficerName") ?? "").trim() || null,
    updated_by: user.id,
  });
  if (error) return { error: error.message.includes("store_settings") ? "The store settings update has not been installed yet. Run the latest Supabase migration." : error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/purchases");
  return { success: "Business info saved." };
}
