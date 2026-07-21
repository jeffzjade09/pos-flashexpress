"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type UserActionState = { error?: string; success?: string };

export async function createEmployee(_: UserActionState, formData: FormData): Promise<UserActionState> {
  const current = await requireSuperAdmin();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "super_admin" ? "super_admin" : "employee";

  if (fullName.length < 2) return { error: "Enter the employee's full name." };
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Temporary password must be at least 8 characters." };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Add SUPABASE_SERVICE_ROLE_KEY to create employee accounts." };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) return { error: error?.message ?? "Could not create the account." };

  const { error: profileError } = await admin.from("profiles").update({ full_name: fullName, role }).eq("id", data.user.id);
  if (profileError) return { error: `Account created, but its profile needs attention: ${profileError.message}` };

  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    actor_id: current.id,
    action: "user.created",
    entity_type: "user",
    entity_id: data.user.id,
    entity_name: fullName,
    details: { email, role },
  });

  revalidatePath("/dashboard/users");
  return { success: `${fullName}'s account is ready.` };
}

export async function setUserStatus(formData: FormData) {
  const current = await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";
  if (!userId || userId === current.id) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  revalidatePath("/dashboard/users");
}

export async function setUserRole(formData: FormData) {
  const current = await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role") === "super_admin" ? "super_admin" : "employee";
  if (!userId || userId === current.id) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/dashboard/users");
}
