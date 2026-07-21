"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { expenseCategories, type ExpenseCategory } from "@/lib/expenses";
import { createClient } from "@/lib/supabase/server";

export type ExpenseState = { error?: string; success?: string };

function expenseValues(formData: FormData) {
  return {
    category: String(formData.get("category") ?? ""),
    amount: Number(formData.get("amount") ?? 0),
    expenseDate: String(formData.get("expenseDate") ?? ""),
    note: String(formData.get("note") ?? "").trim(),
  };
}

function validateExpense(values: ReturnType<typeof expenseValues>) {
  if (!expenseCategories.includes(values.category as ExpenseCategory)) return "Choose an expense category.";
  if (!Number.isFinite(values.amount) || values.amount <= 0) return "Enter an expense amount greater than zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.expenseDate)) return "Choose the expense date.";
  return null;
}

export async function createExpense(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const current = await requireSuperAdmin();
  const values = expenseValues(formData);
  const validation = validateExpense(values);
  if (validation) return { error: validation };
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({ category: values.category, amount: values.amount, expense_date: values.expenseDate, note: values.note || null, created_by: current.id });
  if (error) return { error: error.message.includes("expenses") ? "The expenses database update has not been installed yet." : error.message };
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/activity");
  return { success: "Expense recorded." };
}

export async function updateExpense(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  await requireSuperAdmin();
  const id = String(formData.get("expenseId") ?? "");
  const values = expenseValues(formData);
  const validation = validateExpense(values);
  if (!id) return { error: "The expense is missing." };
  if (validation) return { error: validation };
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update({ category: values.category, amount: values.amount, expense_date: values.expenseDate, note: values.note || null }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/activity");
  return { success: "Expense updated." };
}

export async function deleteExpense(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("expenseId") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("expenses").delete().eq("id", id);
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/activity");
}
