"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Boxes, Package, PackageCheck, Sparkles, TriangleAlert } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/app/dashboard/notifications/actions";
import type { NotificationCategory, NotificationRow } from "@/lib/notifications";

const CATEGORY_CONFIG: Record<NotificationCategory, { label: string; icon: typeof Bell; className: string }> = {
  system_update: { label: "System Update", icon: Sparkles, className: "bg-[#e8f3ee] text-[#0f6b4f]" },
  low_stock: { label: "Low Stock", icon: TriangleAlert, className: "bg-red-50 text-red-600" },
  supplies: { label: "Supplies", icon: Package, className: "bg-amber-50 text-amber-700" },
  inventory: { label: "Inventory", icon: Boxes, className: "bg-blue-50 text-blue-700" },
};

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(iso));
}

export function NotificationBell({ notifications }: { notifications: NotificationRow[] }) {
  const [open, setOpen] = useState(false);
  const [locallyReadIds, setLocallyReadIds] = useState<ReadonlySet<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const items = notifications.map((item) => (locallyReadIds.has(item.id) ? { ...item, read: true } : item));

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const unreadCount = items.filter((item) => !item.read).length;

  function markRead(id: string) {
    setLocallyReadIds((current) => new Set(current).add(id));
    markNotificationRead(id).catch(() => {});
  }

  function markAllRead() {
    setLocallyReadIds(new Set(items.map((item) => item.id)));
    markAllNotificationsRead().catch(() => {});
  }

  return (
    <div className="relative" ref={containerRef}>
      <button aria-label="Notifications" className="relative grid h-11 w-11 place-items-center rounded-xl text-[#34453d] hover:bg-[#eef4f1]" onClick={() => setOpen((current) => !current)} type="button">
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[9px] font-black text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="card fixed right-5 top-[72px] z-30 w-[min(92vw,380px)] overflow-hidden md:right-8" style={{ background: "#fff" }}>
          <div className="flex items-center justify-between border-b border-[#e7ece9] px-4 py-3">
            <div>
              <p className="text-sm font-extrabold">Notifications</p>
              {unreadCount > 0 && <p className="text-[11px] text-[#8a958f]">{unreadCount} unread</p>}
            </div>
            {unreadCount > 0 && (
              <button className="text-xs font-bold text-[#0f6b4f] hover:underline" onClick={markAllRead} type="button">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="grid min-h-40 place-items-center px-6 text-center">
                <div>
                  <PackageCheck className="mx-auto text-[#a5afa9]" size={26} />
                  <p className="mt-2 text-xs font-bold">You&rsquo;re all caught up</p>
                </div>
              </div>
            ) : (
              items.slice(0, 12).map((item) => {
                const config = CATEGORY_CONFIG[item.category];
                const Icon = config.icon;
                const content = (
                  <div className={`flex w-full gap-3 px-4 py-3 text-left transition ${item.read ? "bg-white" : "bg-[#f5f8f6]"} hover:bg-[#f0f4f2]`}>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${config.className}`}>
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-extrabold">{item.title}</p>
                        {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-[#6f7d76]">{item.body}</p>
                      <p className="mt-1 text-[10px] text-[#a3ada8]">{formatTime(item.createdAt)}</p>
                    </div>
                  </div>
                );
                return item.linkHref ? (
                  <Link className="block border-b border-[#edf0ee] last:border-0" href={item.linkHref} key={item.id} onClick={() => { markRead(item.id); setOpen(false); }}>
                    {content}
                  </Link>
                ) : (
                  <button className="block w-full border-b border-[#edf0ee] last:border-0" key={item.id} onClick={() => markRead(item.id)} type="button">
                    {content}
                  </button>
                );
              })
            )}
          </div>

          <Link className="block border-t border-[#e7ece9] px-4 py-3 text-center text-xs font-extrabold text-[#0f6b4f] hover:bg-[#f7f9f8]" href="/dashboard/notifications" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
