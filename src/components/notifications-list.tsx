"use client";

import { useMemo, useState } from "react";
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

const FILTERS: { value: "all" | NotificationCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "system_update", label: "System Update" },
  { value: "low_stock", label: "Low Stock" },
  { value: "supplies", label: "Supplies" },
  { value: "inventory", label: "Inventory" },
];

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(iso));
}

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const [items, setItems] = useState(notifications);
  const [filter, setFilter] = useState<"all" | NotificationCategory>("all");

  const filtered = useMemo(() => (filter === "all" ? items : items.filter((item) => item.category === filter)), [items, filter]);
  const unreadCount = items.filter((item) => !item.read).length;

  function markRead(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    markNotificationRead(id).catch(() => {});
  }

  function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    markAllNotificationsRead().catch(() => {});
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-[#e5eae7] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              className={`rounded-lg border px-3 py-2 text-xs font-extrabold ${filter === item.value ? "border-[#0f6b4f] bg-[#eef7f3] text-[#0f6b4f]" : "border-[#e0e6e3] text-[#66736d] hover:bg-[#f7f9f8]"}`}
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button className="btn-secondary" onClick={markAllRead} type="button">
            <PackageCheck size={15} />Mark all as read
          </button>
        )}
      </div>
      <div className="divide-y divide-[#edf0ee]">
        {filtered.length === 0 ? (
          <div className="grid min-h-72 place-items-center text-center">
            <div>
              <PackageCheck className="mx-auto text-[#a5afa9]" size={34} />
              <p className="mt-4 text-sm font-bold">No notifications</p>
              <p className="mt-1 text-xs text-[#87928c]">You&rsquo;re all caught up.</p>
            </div>
          </div>
        ) : (
          filtered.map((item) => {
            const config = CATEGORY_CONFIG[item.category];
            const Icon = config.icon;
            const content = (
              <div className={`flex w-full items-start gap-3 px-5 py-4 text-left transition ${item.read ? "bg-white" : "bg-[#f5f8f6]"} hover:bg-[#f0f4f2]`}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${config.className}`}>
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-extrabold">{item.title}</p>
                    <span className="rounded-full bg-[#eef1ef] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#7d8983]">{config.label}</span>
                    {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />}
                  </div>
                  <p className="mt-1 text-xs text-[#6f7d76]">{item.body}</p>
                  <p className="mt-1.5 text-[10px] text-[#a3ada8]">{formatTime(item.createdAt)}</p>
                </div>
              </div>
            );
            return item.linkHref ? (
              <Link className="block" href={item.linkHref} key={item.id} onClick={() => markRead(item.id)}>
                {content}
              </Link>
            ) : (
              <button className="block w-full" key={item.id} onClick={() => markRead(item.id)} type="button">
                {content}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
