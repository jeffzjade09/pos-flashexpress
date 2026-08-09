import { DashboardShell } from "@/components/dashboard-shell";
import { requireUser } from "@/lib/auth";
import { fetchNotifications } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();
  const { notifications } = await fetchNotifications(supabase, user.id, 30);

  return (
    <DashboardShell notifications={notifications} user={user}>
      {children}
    </DashboardShell>
  );
}
