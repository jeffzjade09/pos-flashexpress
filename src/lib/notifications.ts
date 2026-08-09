import type { createClient } from "@/lib/supabase/server";

export type NotificationCategory = "system_update" | "low_stock" | "supplies" | "inventory";

export type NotificationRow = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  linkHref: string | null;
  createdAt: string;
  read: boolean;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function fetchNotifications(
  supabase: SupabaseServerClient,
  userId: string,
  limit: number,
): Promise<{ notifications: NotificationRow[]; error: boolean }> {
  const [{ data: notifications, error }, { data: reads }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, category, title, body, link_href, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("notification_reads").select("notification_id").eq("user_id", userId),
  ]);

  if (error) return { notifications: [], error: true };

  const readIds = new Set((reads ?? []).map((row) => row.notification_id));

  return {
    notifications: (notifications ?? []).map((row) => ({
      id: row.id,
      category: row.category as NotificationCategory,
      title: row.title,
      body: row.body,
      linkHref: row.link_href,
      createdAt: row.created_at,
      read: readIds.has(row.id),
    })),
    error: false,
  };
}
