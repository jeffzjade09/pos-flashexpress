import { NotificationsList } from "@/components/notifications-list";
import { requireUser } from "@/lib/auth";
import { fetchNotifications } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { notifications, error } = await fetchNotifications(supabase, user.id, 200);

  return (
    <div className="mx-auto max-w-[900px]">
      <div>
        <p className="eyebrow">Updates</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Notifications</h1>
        <p className="mt-2 text-sm text-[#718079]">System updates, low stock, and supply alerts.</p>
      </div>
      {error && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Run the latest notifications migration in Supabase, then refresh this page.</div>}
      <div className="card mt-7 overflow-hidden">
        <NotificationsList notifications={notifications} />
      </div>
    </div>
  );
}
