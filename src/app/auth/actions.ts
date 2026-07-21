"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "Supabase is not configured yet. See the setup instructions." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password is incorrect." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, full_name")
    .eq("id", data.user.id)
    .single();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: "This account is inactive. Contact your administrator." };
  }

  await supabase.from("audit_logs").insert({
    actor_id: data.user.id,
    action: "session.login",
    entity_type: "user",
    entity_id: data.user.id,
    entity_name: profile.full_name || email,
    details: { email },
  });

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", authData.user.id).single();
    await supabase.from("audit_logs").insert({
      actor_id: authData.user.id,
      action: "session.logout",
      entity_type: "user",
      entity_id: authData.user.id,
      entity_name: profile?.full_name || authData.user.email || "User",
      details: { email: authData.user.email },
    });
  }
  await supabase.auth.signOut();
  redirect("/login");
}
