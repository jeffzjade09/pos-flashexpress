"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  History,
  LogOut,
  Menu,
  Package,
  PackageSearch,
  PackageX,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { logout } from "@/app/auth/actions";
import { NotificationBell } from "@/components/notification-bell";
import type { CurrentUser } from "@/lib/auth";
import type { NotificationRow } from "@/lib/notifications";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/pos", label: "Point of Sale", icon: ShoppingCart },
  { href: "/dashboard/sales", label: "Transactions", icon: ReceiptText },
  { href: "/dashboard/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/dashboard/supplies", label: "Supplies", icon: Package },
  { href: "/dashboard/purchases", label: "Purchases", icon: Truck },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/closing", label: "Daily closing", icon: ClipboardCheck },
];

export function DashboardShell({ user, notifications, children }: { user: CurrentUser; notifications: NotificationRow[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const initial = user.fullName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen min-w-0 xl:grid xl:grid-cols-[248px_minmax(0,1fr)]">
      {mobileMenuOpen && <button aria-label="Close navigation menu" className="fixed inset-0 z-30 bg-[#10251c]/45 backdrop-blur-[2px] xl:hidden" onClick={() => setMobileMenuOpen(false)} type="button" />}
      <aside aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-40 flex w-[min(82vw,280px)] flex-col border-r border-[#e4e9e6] bg-white px-4 py-5 shadow-2xl transition-transform duration-200 ease-out xl:w-[248px] xl:translate-x-0 xl:shadow-none ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`} id="mobile-navigation">
        <div className="flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3 px-2" onClick={() => setMobileMenuOpen(false)}>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f6b4f] text-white"><Boxes size={21} /></div>
          <div><p className="text-lg font-black tracking-tight">FlashPOS</p><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a958f]">Store console</p></div>
        </Link>
        <button aria-label="Close navigation menu" className="grid h-11 w-11 place-items-center rounded-xl text-[#66736d] hover:bg-[#f1f5f3] xl:hidden" onClick={() => setMobileMenuOpen(false)} type="button"><X size={20} /></button>
        </div>

        <nav className="mt-9 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa39f]">Workspace</p>
          {nav.map((item) => {
            const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5] hover:text-[#26372f]"}`}>
                <Icon size={18} strokeWidth={active ? 2.4 : 2} />{item.label}
              </Link>
            );
          })}

          {user.role === "super_admin" && (
            <>
              <p className="mb-3 mt-7 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa39f]">Administration</p>
              <Link href="/dashboard/users" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${pathname.startsWith("/dashboard/users") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><Users size={18} />Team & access</Link>
              <Link href="/dashboard/activity" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${pathname.startsWith("/dashboard/activity") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><History size={18} />Activity log</Link>
              <Link href="/dashboard/returns" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${pathname.startsWith("/dashboard/returns") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><Undo2 size={18} />Returns</Link>
              <Link href="/dashboard/back-orders" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${pathname.startsWith("/dashboard/back-orders") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><PackageX size={18} />Back orders</Link>
              <Link href="/dashboard/expenses" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${pathname.startsWith("/dashboard/expenses") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><WalletCards size={18} />Expenses</Link>
              <Link href="/dashboard/settings" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${pathname.startsWith("/dashboard/settings") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><Settings size={18} />System settings</Link>
            </>
          )}
        </nav>

        <a href="/api/user-manual" target="_blank" rel="noreferrer" onClick={() => setMobileMenuOpen(false)} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#66736d] transition hover:bg-[#f4f7f5] hover:text-[#26372f]">
          <BookOpen size={18} />User manual
        </a>

        <div className="mt-3 rounded-2xl bg-[#f5f8f6] p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d8ebe3] text-sm font-black text-[#0c6047]">{initial}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user.fullName}</p><p className="truncate text-[11px] capitalize text-[#78857e]">{user.role.replace("_", " ")}</p></div>
            <ChevronDown size={15} className="text-[#96a099]" />
          </div>
          <form action={logout} className="mt-2">
            <button type="submit" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#6e7b74] hover:bg-white hover:text-red-600"><LogOut size={14} />Sign out</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 xl:col-start-2">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e5eae7] bg-white/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 xl:hidden"><button aria-controls="mobile-navigation" aria-expanded={mobileMenuOpen} aria-label="Open navigation menu" className="grid h-11 w-11 place-items-center rounded-xl text-[#34453d] hover:bg-[#eef4f1]" onClick={() => setMobileMenuOpen(true)} type="button"><Menu size={22} /></button><span className="font-extrabold">FlashPOS</span></div>
          <div className="hidden items-center gap-2 text-sm text-[#7d8983] xl:flex"><span>Store</span><span>/</span><span className="font-semibold text-[#34453d]">{nav.find((item) => pathname === item.href)?.label ?? "Workspace"}</span></div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-[#dfe6e2] bg-white px-3 py-1.5 text-xs font-semibold text-[#52635a] sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />System online</div>
            <NotificationBell notifications={notifications} />
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e4f1eb] text-xs font-black text-[#0f6b4f] xl:hidden">{initial}</div>
          </div>
        </header>
        <main className="min-w-0 overflow-x-hidden px-4 py-6 sm:px-5 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
