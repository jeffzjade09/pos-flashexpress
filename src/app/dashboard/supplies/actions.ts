"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SupplyActionState = {
  error?: string;
  success?: string;
};

function numberValue(formData: FormData, name: string, fallback = 0) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readSupplyFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const qty = numberValue(formData, "qty");
  const price = numberValue(formData, "price");
  const lowStockThreshold = numberValue(formData, "lowStockThreshold", 10);
  return { name, description, qty, price, lowStockThreshold };
}

function validateSupplyFields({ name, qty, price, lowStockThreshold }: { name: string; qty: number; price: number; lowStockThreshold: number }) {
  if (name.length < 2) return "Enter a supply name.";
  if ([qty, price, lowStockThreshold].some(Number.isNaN)) return "Check the quantity, price, and low-stock fields.";
  if (!Number.isInteger(qty) || qty < 0) return "Quantity must be a non-negative whole number.";
  if (price < 0) return "Price cannot be negative.";
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) return "The low-stock alert must be a non-negative whole number.";
  return null;
}

export async function createSupply(
  _: SupplyActionState,
  formData: FormData,
): Promise<SupplyActionState> {
  await requireUser();

  const fields = readSupplyFields(formData);
  const validationError = validateSupplyFields(fields);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_supply", {
    p_name: fields.name,
    p_description: fields.description,
    p_qty: fields.qty,
    p_price: fields.price,
    p_low_stock_threshold: fields.lowStockThreshold,
  });

  if (error) {
    if (error.code === "23505") return { error: "A supply with that name already exists." };
    if (error.code === "PGRST202" || error.message.includes("create_supply")) {
      return { error: "The supplies database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not add the supply." };
  }

  revalidatePath("/dashboard/supplies");
  revalidatePath("/dashboard");
  return { success: `${fields.name} was added to supplies.` };
}

export async function updateSupply(
  _: SupplyActionState,
  formData: FormData,
): Promise<SupplyActionState> {
  await requireUser();

  const supplyId = String(formData.get("supplyId") ?? "").trim();
  if (!supplyId) return { error: "Supply is missing." };

  const fields = readSupplyFields(formData);
  const validationError = validateSupplyFields(fields);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_supply", {
    p_supply_id: supplyId,
    p_name: fields.name,
    p_description: fields.description,
    p_qty: fields.qty,
    p_price: fields.price,
    p_low_stock_threshold: fields.lowStockThreshold,
  });

  if (error) {
    if (error.code === "23505") return { error: "A supply with that name already exists." };
    if (error.code === "PGRST202" || error.message.includes("update_supply")) {
      return { error: "The supplies database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not update the supply." };
  }

  revalidatePath("/dashboard/supplies");
  revalidatePath("/dashboard");
  return { success: `${fields.name} was updated.` };
}

export type DeleteSupplyState = { error?: string; success?: string };

export async function deleteSupply(
  _: DeleteSupplyState,
  formData: FormData,
): Promise<DeleteSupplyState> {
  await requireSuperAdmin();

  const supplyId = String(formData.get("supplyId") ?? "").trim();
  const supplyName = String(formData.get("supplyName") ?? "").trim();
  if (!supplyId) return { error: "Supply is missing." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_supply", { p_supply_id: supplyId });

  if (error) {
    if (error.code === "PGRST202" || error.message.includes("delete_supply")) {
      return { error: "The supplies database update has not been installed yet. Run the latest Supabase migration." };
    }
    return { error: error.message || "Could not delete the supply." };
  }

  revalidatePath("/dashboard/supplies");
  revalidatePath("/dashboard");
  return { success: `${supplyName || "Supply"} was deleted.` };
}
