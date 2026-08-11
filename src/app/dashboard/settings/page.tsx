import Link from "next/link";
import {
  Activity,
  Archive,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Download,
  PackageSearch,
  Printer,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { StoreSettingsForm } from "@/components/store-settings-form";
import { requireSuperAdmin } from "@/lib/auth";
import { fetchStoreSettings } from "@/lib/store-settings";
import { createClient } from "@/lib/supabase/server";

const printReports = [
  { label: "Today's sales", note: "Sales, payments, products, and income today", href: "/dashboard/reports?range=today&print=1", icon: CalendarDays },
  { label: "Last 7 days", note: "A rolling seven-day sales report", href: "/dashboard/reports?range=7d&print=1", icon: BarChart3 },
  { label: "Last 30 days", note: "A rolling thirty-day business report", href: "/dashboard/reports?range=30d&print=1", icon: BarChart3 },
  { label: "Inventory report", note: "Current stock and low-stock status", href: "/dashboard/inventory?print=1", icon: PackageSearch },
];

const exports = [
  { label: "Sales", note: "Transactions, channels, payments, and refunds", kind: "sales", icon: ShoppingCart },
  { label: "Inventory", note: "Products, stock levels, SKUs, and barcodes", kind: "inventory", icon: PackageSearch },
  { label: "Expenses", note: "Dates, categories, amounts, and notes", kind: "expenses", icon: WalletCards },
  { label: "Purchases", note: "Purchase orders, suppliers, status, and cost", kind: "purchases", icon: Truck },
  { label: "Cashier closings", note: "Expected, actual, and payment variances", kind: "closings", icon: ClipboardCheck },
  { label: "Activity log", note: "Auditable system actions and changes", kind: "activity", icon: Activity },
];

export default async function SettingsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  const [{ data: stock }, { data: openOrders }, { data: staff }, storeSettings] = await Promise.all([
    supabase.from("product_stock").select("id, stock_on_hand, low_stock_threshold").eq("is_active", true),
    supabase.from("purchase_orders").select("id").in("status", ["ordered", "partially_received"]),
    supabase.from("profiles").select("id").eq("is_active", true),
    fetchStoreSettings(supabase),
  ]);
  const lowStock = (stock ?? []).filter((product) => Number(product.stock_on_hand) <= Number(product.low_stock_threshold)).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">System settings & tools</h1>
        <p className="mt-2 text-sm text-[#718079]">Print business reports, download backup files, and open important store controls.</p>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active products", value: stock?.length ?? 0, note: `${lowStock} need restocking`, icon: PackageSearch, style: lowStock ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700" },
          { label: "Open purchase orders", value: openOrders?.length ?? 0, note: "Ordered or partially received", icon: Truck, style: "bg-amber-50 text-amber-700" },
          { label: "Active users", value: staff?.length ?? 0, note: "Authorized store accounts", icon: Users, style: "bg-blue-50 text-blue-700" },
        ].map(({ label, value, note, icon: Icon, style }) => (
          <article className="card p-5" key={label}>
            <div className="flex items-start justify-between"><p className="text-xs font-bold text-[#718078]">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl ${style}`}><Icon size={17} /></span></div>
            <p className="mt-3 text-3xl font-black">{value}</p>
            <p className="mt-2 text-xs text-[#89948e]">{note}</p>
          </article>
        ))}
      </section>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9f4ef] text-[#0f6b4f]"><PackageSearch size={18} /></span>
            <div><h2 className="font-extrabold">Business info</h2><p className="mt-1 text-xs text-[#819087]">Company name, address, contact, and sales officer shown on every exported Purchase Order.</p></div>
          </div>
          <StoreSettingsForm settings={storeSettings} />
        </div>
      </section>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-start gap-3 border-b border-[#e5eae7] px-6 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9f4ef] text-[#0f6b4f]"><Printer size={18} /></span>
          <div><h2 className="font-extrabold">Print center</h2><p className="mt-1 text-xs text-[#819087]">Opens a clean print view. Choose your printer or Save as PDF in the browser dialog.</p></div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {printReports.map(({ label, note, href, icon: Icon }) => (
            <Link className="group rounded-2xl border border-[#e3e9e6] p-4 transition hover:border-[#83b7a2] hover:bg-[#f6faf8]" href={href} key={label} rel="noreferrer" target="_blank">
              <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf5f1] text-[#0f6b4f]"><Icon size={16} /></span><Printer className="text-[#9aa49f] group-hover:text-[#0f6b4f]" size={16} /></div>
              <p className="mt-4 text-sm font-extrabold">{label}</p><p className="mt-1 text-xs leading-5 text-[#7c8982]">{note}</p>
            </Link>
          ))}
        </div>
        <form action="/dashboard/reports" className="mx-5 mb-5 flex flex-col gap-3 rounded-2xl bg-[#f4f8f6] p-4 sm:flex-row sm:items-end" method="get" target="_blank">
          <input name="range" type="hidden" value="month" /><input name="print" type="hidden" value="1" />
          <label className="flex-1 text-xs font-bold"><span className="mb-1.5 block">Print a specific month</span><input className="field max-w-xs text-sm" defaultValue={currentMonth} name="month" required type="month" /></label>
          <button className="btn-primary" type="submit"><Printer size={15} />Print monthly report</button>
        </form>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <article className="card overflow-hidden">
          <div className="flex items-start gap-3 border-b border-[#e5eae7] px-6 py-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Archive size={18} /></span><div><h2 className="font-extrabold">Data exports & backup</h2><p className="mt-1 text-xs text-[#819087]">Download CSV files that open in Excel or Google Sheets.</p></div></div>
          <div className="grid sm:grid-cols-2">
            {exports.map(({ label, note, kind, icon: Icon }) => <Link className="flex items-center gap-3 border-b border-r border-[#edf0ee] p-4 transition hover:bg-[#f8faf9]" href={`/api/export/${kind}`} key={kind}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f0f5f2] text-[#0f6b4f]"><Icon size={16} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-[#87928c]">{note}</span></span><Download className="shrink-0 text-[#97a19c]" size={15} /></Link>)}
          </div>
          <div className="flex gap-2 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-800"><ShieldCheck className="mt-0.5 shrink-0" size={16} /><p>Keep your downloaded files in a secure folder. CSV exports are useful backups, but Supabase remains the main database.</p></div>
        </article>

        <article className="card overflow-hidden">
          <div className="border-b border-[#e5eae7] px-6 py-5"><h2 className="font-extrabold">Store operations</h2><p className="mt-1 text-xs text-[#819087]">Shortcuts for frequent administrative checks.</p></div>
          <div className="divide-y divide-[#edf0ee]">
            {[
              { label: "Review low stock", note: `${lowStock} products currently at or below threshold`, href: "/dashboard/inventory", icon: PackageSearch },
              { label: "Receive purchases", note: `${openOrders?.length ?? 0} purchase orders remain open`, href: "/dashboard/purchases", icon: Truck },
              { label: "Verify cashier closing", note: "Review cash and GCash differences", href: "/dashboard/closing", icon: ClipboardCheck },
              { label: "Manage staff access", note: "Activate users and assign roles", href: "/dashboard/users", icon: Users },
              { label: "Review activity log", note: "See inventory, sales, refunds, and expense changes", href: "/dashboard/activity", icon: Activity },
            ].map(({ label, note, href, icon: Icon }) => <Link className="flex items-center gap-3 p-4 transition hover:bg-[#f8faf9]" href={href} key={href}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf5f1] text-[#0f6b4f]"><Icon size={16} /></span><span><span className="block text-xs font-extrabold">{label}</span><span className="mt-0.5 block text-[10px] text-[#87928c]">{note}</span></span></Link>)}
          </div>
        </article>
      </section>
    </div>
  );
}
