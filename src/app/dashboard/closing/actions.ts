"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ClosingState = { error?: string; success?: string };
export async function closeDay(_: ClosingState, formData: FormData): Promise<ClosingState> {
  await requireUser();
  const businessDate = String(formData.get("businessDate") ?? "");
  const actualCash = Number(formData.get("actualCash") ?? 0);
  const actualGcash = Number(formData.get("actualGcash") ?? 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return { error: "Choose the business date." };
  if (![actualCash, actualGcash].every((value) => Number.isFinite(value) && value >= 0)) return { error: "Actual totals must be valid positive amounts." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cashier_day", { p_business_date: businessDate, p_actual_cash: actualCash, p_actual_gcash: actualGcash, p_notes: String(formData.get("notes") ?? "") });
  if (error) return { error: error.code === "23505" ? "You already closed this business date." : error.code === "PGRST202" ? "The daily-closing database update has not been installed yet." : error.message };
  revalidatePath("/dashboard/closing");
  revalidatePath("/dashboard/activity");
  return { success: "Cashier day closed and variances recorded." };
}
