"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  History,
  LogOut,
  Menu,
  PackageSearch,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { logout } from "@/app/auth/actions";
import type { CurrentUser } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/pos", label: "Point of Sale", icon: ShoppingCart },
  { href: "/dashboard/sales", label: "Transactions", icon: ReceiptText },
  { href: "/dashboard/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/dashboard/purchases", label: "Purchases", icon: Truck },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/closing", label: "Daily closing", icon: ClipboardCheck },
];

export function DashboardShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const initial = user.fullName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="desktop-only fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-[#e4e9e6] bg-white px-4 py-5">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f6b4f] text-white"><Boxes size={21} /></div>
          <div><p className="text-lg font-black tracking-tight">FlashPOS</p><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a958f]">Store console</p></div>
        </Link>

        <nav className="mt-9 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa39f]">Workspace</p>
          {nav.map((item) => {
            const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5] hover:text-[#26372f]"}`}>
                <Icon size={18} strokeWidth={active ? 2.4 : 2} />{item.label}
              </Link>
            );
          })}

          {user.role === "super_admin" && (
            <>
              <p className="mb-3 mt-7 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa39f]">Administration</p>
              <Link href="/dashboard/users" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${pathname.startsWith("/dashboard/users") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><Users size={18} />Team & access</Link>
              <Link href="/dashboard/activity" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${pathname.startsWith("/dashboard/activity") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><History size={18} />Activity log</Link>
              <Link href="/dashboard/expenses" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${pathname.startsWith("/dashboard/expenses") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><WalletCards size={18} />Expenses</Link>
              <Link href="/dashboard/settings" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${pathname.startsWith("/dashboard/settings") ? "bg-[#e9f4ef] text-[#0b6348]" : "text-[#66736d] hover:bg-[#f4f7f5]"}`}><Settings size={18} />System settings</Link>
            </>
          )}
        </nav>

        <div className="mt-auto rounded-2xl bg-[#f5f8f6] p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d8ebe3] text-sm font-black text-[#0c6047]">{initial}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user.fullName}</p><p className="truncate text-[11px] capitalize text-[#78857e]">{user.role.replace("_", " ")}</p></div>
            <ChevronDown size={15} className="text-[#96a099]" />
          </div>
          <form action={logout} className="mt-2">
            <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#6e7b74] hover:bg-white hover:text-red-600"><LogOut size={14} />Sign out</button>
          </form>
        </div>
      </aside>

      <div className="md:col-start-2">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e5eae7] bg-white/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3 md:hidden"><Menu size={22} /><span className="font-extrabold">FlashPOS</span></div>
          <div className="desktop-only flex items-center gap-2 text-sm text-[#7d8983]"><span>Store</span><span>/</span><span className="font-semibold text-[#34453d]">{nav.find((item) => pathname === item.href)?.label ?? "Workspace"}</span></div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-[#dfe6e2] bg-white px-3 py-1.5 text-xs font-semibold text-[#52635a] sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />System online</div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e4f1eb] text-xs font-black text-[#0f6b4f] md:hidden">{initial}</div>
          </div>
        </header>
        <main className="px-5 py-7 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
