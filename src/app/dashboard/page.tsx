import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, CircleDollarSign, Crown, PackageCheck, ReceiptText, ShoppingBag, TriangleAlert, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

type SaleActor = { full_name: string };
type DashboardSale = {
  id: string;
  receipt_number: string;
  total_amount: number | string;
  refunded_amount: number | string;
  status: string;
  sales_channel: string;
  payment_method: string;
  completed_at: string;
  cashier: SaleActor | SaleActor[] | null;
};

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const channelNames: Record<string, string> = { walk_in: "Walk-in", tiktok: "TikTok Shop", lazada: "Lazada", shopee: "Shopee" };
const channelColors: Record<string, string> = { walk_in: "bg-[#14946b]", tiktok: "bg-[#222]", lazada: "bg-[#6547cf]", shopee: "bg-[#ee5a36]" };

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function cashierName(sale: DashboardSale) {
  const cashier = Array.isArray(sale.cashier) ? sale.cashier[0] : sale.cashier;
  return cashier?.full_name || "Team member";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const todayKey = dateKey(new Date());
  const [year, month, day] = todayKey.split("-").map(Number);
  const todaySerial = Date.UTC(year, month - 1, day);
  const sevenDayStart = new Date(todaySerial - 6 * DAY_MS - MANILA_OFFSET_MS).toISOString();
  const tomorrow = new Date(todaySerial + DAY_MS - MANILA_OFFSET_MS).toISOString();

  const [{ count: productCount }, { data: stockData }, { data: saleData }, { data: itemData }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("product_stock").select("id, name, variant, stock_on_hand, low_stock_threshold, is_active").eq("is_active", true).order("stock_on_hand"),
    supabase.from("sales").select("id, receipt_number, status, total_amount, refunded_amount, sales_channel, payment_method, completed_at, cashier:profiles!sales_cashier_id_fkey(full_name)").in("status", ["completed", "partially_refunded", "refunded"]).gte("completed_at", sevenDayStart).lt("completed_at", tomorrow).order("completed_at", { ascending: false }),
    supabase.from("sale_items").select("product_name, quantity, refunded_quantity, conversion_to_piece, unit_price, line_total, sales!inner(status, completed_at)").in("sales.status", ["completed", "partially_refunded", "refunded"]).gte("sales.completed_at", sevenDayStart).lt("sales.completed_at", tomorrow),
  ]);

  const sales = (saleData ?? []) as unknown as DashboardSale[];
  const items = itemData ?? [];
  const todaySales = sales.filter((sale) => dateKey(new Date(sale.completed_at)) === todayKey);
  const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.total_amount) - Number(sale.refunded_amount), 0);
  const averageToday = todaySales.length ? todayRevenue / todaySales.length : 0;
  const lowItems = (stockData ?? []).filter((item) => Number(item.stock_on_hand) <= Number(item.low_stock_threshold)).slice(0, 4);

  const productTotals = new Map<string, { pieces: number; amount: number }>();
  for (const item of items) {
    const current = productTotals.get(item.product_name) ?? { pieces: 0, amount: 0 };
    const netQuantity = Number(item.quantity) - Number(item.refunded_quantity);
    current.pieces += netQuantity * Number(item.conversion_to_piece);
    current.amount += netQuantity * Number(item.unit_price);
    productTotals.set(item.product_name, current);
  }
  const bestSellers = [...productTotals.entries()].sort((a, b) => b[1].pieces - a[1].pieces).slice(0, 5);
  const bestSeller = bestSellers[0];

  const channelTotals = new Map<string, { amount: number; count: number }>();
  const paymentTotals = new Map<string, number>();
  for (const sale of sales) {
    const channel = channelTotals.get(sale.sales_channel) ?? { amount: 0, count: 0 };
    const netAmount = Number(sale.total_amount) - Number(sale.refunded_amount);
    channel.amount += netAmount;
    channel.count += 1;
    channelTotals.set(sale.sales_channel, channel);
    paymentTotals.set(sale.payment_method, (paymentTotals.get(sale.payment_method) ?? 0) + netAmount);
  }
  const topChannel = [...channelTotals.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
  const sevenDayRevenue = sales.reduce((sum, sale) => sum + Number(sale.total_amount) - Number(sale.refunded_amount), 0);

  const dailyTotals = new Map<string, number>();
  for (let serial = todaySerial - 6 * DAY_MS; serial <= todaySerial; serial += DAY_MS) dailyTotals.set(new Date(serial).toISOString().slice(0, 10), 0);
  for (const sale of sales) {
    const key = dateKey(new Date(sale.completed_at));
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + Number(sale.total_amount) - Number(sale.refunded_amount));
  }
  const chartDays = [...dailyTotals.entries()];
  const chartMax = Math.max(...chartDays.map(([, amount]) => amount), 1);

  return (
    <div className="mx-auto max-w-[1450px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Store command center</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Good day, {user.fullName.split(" ")[0]}.</h1><p className="mt-2 text-sm text-[#718079]">Live sales, channel performance, and stock health at a glance.</p></div><div className="flex gap-2"><Link href="/dashboard/reports?range=7d" className="btn-secondary"><BarChart3 size={16} />Full reports</Link><Link href="/dashboard/pos" className="btn-primary"><ShoppingBag size={17} />New sale</Link></div></div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Today's sales", value: money(todayRevenue), note: `${todaySales.length} completed orders`, icon: CircleDollarSign, color: "bg-emerald-50 text-emerald-700" }, { label: "Average order", value: money(averageToday), note: "Today's transaction average", icon: ReceiptText, color: "bg-blue-50 text-blue-700" }, { label: "Best seller · 7 days", value: bestSeller?.[0] ?? "No sales yet", note: bestSeller ? `${bestSeller[1].pieces} pieces · ${money(bestSeller[1].amount)}` : "Complete a sale to begin", icon: Crown, color: "bg-amber-50 text-amber-700" }, { label: "Top channel · 7 days", value: topChannel ? channelNames[topChannel[0]] ?? topChannel[0] : "No sales yet", note: topChannel ? `${topChannel[1].count} orders · ${money(topChannel[1].amount)}` : "No channel data", icon: ShoppingBag, color: "bg-violet-50 text-violet-700" }].map(({ label, value, note, icon: Icon, color }) => <article key={label} className="card p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-[#718078]">{label}</p><p className="mt-3 truncate text-2xl font-black tracking-tight">{value}</p><p className="mt-2 truncate text-xs text-[#8a958f]">{note}</p></div><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={18} /></span></div></article>)}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <article className="card p-6"><div className="flex items-start justify-between"><div><h2 className="font-extrabold">7-day sales overview</h2><p className="mt-1 text-xs text-[#819087]">{money(sevenDayRevenue)} across {sales.length} transactions</p></div><span className="rounded-lg bg-[#edf6f2] px-2.5 py-1.5 text-xs font-extrabold text-[#0f6b4f]">LIVE</span></div><div className="mt-6 flex h-56 items-end gap-3 border-b border-[#dfe6e2] px-2">{chartDays.map(([date, amount]) => <div className="group relative flex h-full min-w-0 flex-1 items-end" key={date}><div className="w-full rounded-t-xl bg-gradient-to-t from-[#37a77f] to-[#9bd5bc] transition group-hover:from-[#0f6b4f]" style={{ height: `${amount ? Math.max(9, amount / chartMax * 100) : 2}%` }}><span className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#17251f] px-2 py-1 text-[10px] font-bold text-white group-hover:block">{money(amount)}</span></div></div>)}</div><div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold text-[#89948e]">{chartDays.map(([date]) => <span key={date}>{new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</span>)}</div></article>

        <article className="card p-6"><div className="flex items-start justify-between"><div><h2 className="font-extrabold">Channel performance</h2><p className="mt-1 text-xs text-[#819087]">Last 7 days by gross sales</p></div><WalletCards size={19} className="text-[#0f6b4f]" /></div><div className="mt-6 space-y-5">{["walk_in", "tiktok", "lazada", "shopee"].map((channel) => { const value = channelTotals.get(channel) ?? { amount: 0, count: 0 }; const percent = sevenDayRevenue ? value.amount / sevenDayRevenue * 100 : 0; return <div key={channel}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${channelColors[channel]}`} /><span className="text-xs font-extrabold">{channelNames[channel]}</span></div><span className="text-xs font-black">{money(value.amount)} <span className="font-medium text-[#8b9690]">· {value.count}</span></span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#edf1ef]"><div className={`h-full rounded-full ${channelColors[channel]}`} style={{ width: `${percent}%` }} /></div></div>; })}</div></article>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.4fr_1fr]">
        <article className="card p-6"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Best sellers</h2><p className="mt-1 text-xs text-[#819087]">By pieces, last 7 days</p></div><Crown size={18} className="text-amber-600" /></div><div className="mt-5 space-y-3">{bestSellers.length ? bestSellers.map(([name, value], index) => <div className="flex items-center gap-3" key={name}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${index === 0 ? "bg-amber-100 text-amber-700" : "bg-[#edf3f0] text-[#617068]"}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{name}</p><p className="mt-0.5 text-[10px] text-[#89948e]">{value.pieces} pcs · {money(value.amount)}</p></div></div>) : <p className="py-14 text-center text-xs text-[#87928c]">No sales in the last 7 days.</p>}</div></article>

        <article className="card overflow-hidden"><div className="flex items-center justify-between border-b border-[#e7ece9] px-5 py-4"><div><h2 className="font-extrabold">Recent sales</h2><p className="mt-1 text-xs text-[#819087]">Latest transactions after refunds</p></div><Link href="/dashboard/sales" className="text-xs font-extrabold text-[#0f6b4f]">View all</Link></div><div className="divide-y divide-[#edf0ee]">{sales.slice(0, 5).map((sale) => <div className="flex items-center gap-3 px-5 py-3" key={sale.id}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf5f1] text-[#0f6b4f]"><ReceiptText size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{sale.receipt_number}</p><p className="mt-0.5 truncate text-[10px] text-[#89948e]">{channelNames[sale.sales_channel]} · {cashierName(sale)} · {sale.status.replaceAll("_", " ")}</p></div><div className="text-right"><p className="text-xs font-black">{money(Number(sale.total_amount) - Number(sale.refunded_amount))}</p><p className="mt-0.5 text-[10px] text-[#89948e]">{new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(sale.completed_at))}</p></div></div>)}{!sales.length && <p className="py-16 text-center text-xs text-[#87928c]">No recent sales.</p>}</div></article>

        <div className="grid gap-5"><article className="card p-5"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Payment mix</h2><p className="mt-1 text-xs text-[#819087]">Last 7 days</p></div><WalletCards size={18} className="text-[#0f6b4f]" /></div><div className="mt-4 grid grid-cols-3 gap-2">{[{ key: "cash", label: "Cash" }, { key: "gcash", label: "GCash" }, { key: "marketplace", label: "Online" }].map((payment) => <div className="rounded-xl bg-[#f5f8f6] p-2.5 text-center" key={payment.key}><p className="text-[10px] font-bold text-[#7d8983]">{payment.label}</p><p className="mt-1 text-xs font-black">{money(paymentTotals.get(payment.key) ?? 0)}</p></div>)}</div></article><article className="card p-5"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Stock attention</h2><p className="mt-1 text-xs text-[#819087]">{lowItems.length} low-stock items · {productCount ?? 0} active</p></div><TriangleAlert size={18} className={lowItems.length ? "text-orange-600" : "text-emerald-600"} /></div><div className="mt-4 space-y-2">{lowItems.length ? lowItems.map((item) => <div className="flex items-center gap-2" key={item.id}><span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-50 text-orange-600"><Boxes size={14} /></span><p className="min-w-0 flex-1 truncate text-xs font-bold">{item.name}</p><span className="text-[10px] font-extrabold text-red-600">{item.stock_on_hand} PCS</span></div>) : <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-700"><PackageCheck size={18} /><span className="text-xs font-bold">Stock looks healthy</span></div>}</div><Link href="/dashboard/inventory" className="mt-4 flex items-center justify-center gap-1 text-[11px] font-extrabold text-[#0f6b4f]">Manage inventory <ArrowRight size={12} /></Link></article></div>
      </section>
    </div>
  );
}
