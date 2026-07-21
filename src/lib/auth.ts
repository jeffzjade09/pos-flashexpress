import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AppRole = "employee" | "super_admin";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Keep the application navigable before the owner connects Supabase.
  // Protected routes will redirect to the login/setup screen instead of crashing.
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile?.is_active) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile.full_name || user.email?.split("@")[0] || "User",
    role: profile.role as AppRole,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/dashboard");
  return user;
}
