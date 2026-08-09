"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const NOT_INSTALLED_MESSAGE = "Notifications have not been installed yet. Run the latest Supabase migration.";

function isMissingMigrationError(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || error.code === "42P01" || Boolean(error.message?.includes("does not exist"));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const user = await requireUser();
  const id = String(notificationId ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_reads")
    .upsert({ notification_id: id, user_id: user.id }, { onConflict: "notification_id,user_id" });

  if (error) {
    throw new Error(isMissingMigrationError(error) ? NOT_INSTALLED_MESSAGE : error.message || "Could not mark the notification as read.");
  }

  revalidatePath("/dashboard", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    throw new Error(isMissingMigrationError(error) ? NOT_INSTALLED_MESSAGE : error.message || "Could not mark notifications as read.");
  }

  revalidatePath("/dashboard", "layout");
}
