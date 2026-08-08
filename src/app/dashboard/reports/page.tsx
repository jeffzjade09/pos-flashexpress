import Link from "next/link";
import { BarChart3, CalendarDays, CircleDollarSign, Download, PackageCheck, ReceiptText, ShoppingBag } from "lucide-react";
import { AutoPrint } from "@/components/auto-print";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ReportRange = "today" | "7d" | "30d" | "month";
type SaleActor = { full_name: string };
type SaleRow = {
  id: string;
  receipt_number: string;
  total_amount: number | string;
  tax_amount: number | string;
  refunded_amount: number | string;
  status: string;
  sales_channel: string;
  external_order_id: string | null;
  payment_method: string;
  payment_reference: string | null;
  completed_at: string;
  cashier: SaleActor | SaleActor[] | null;
};

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const channelNames: Record<string, string> = { walk_in: "Walk-in", tiktok: "TikTok Shop", lazada: "Lazada", shopee: "Shopee" };
const channelStyles: Record<string, string> = { walk_in: "bg-emerald-50 text-emerald-700", tiktok: "bg-slate-100 text-slate-700", lazada: "bg-violet-50 text-violet-700", shopee: "bg-orange-50 text-orange-700" };

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

function manilaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateKey(date: Date) {
  const { year, month, day } = manilaDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function actorName(sale: SaleRow) {
  const actor = Array.isArray(sale.cashier) ? sale.cashier[0] : sale.cashier;
  return actor?.full_name || "Team member";
}

function netSale(sale: SaleRow) {
  return Number(sale.total_amount) - Number(sale.refunded_amount);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; month?: string; print?: string }> }) {
  const currentUser = await requireUser();
  const params = await searchParams;
  const requestedRange = params.range;
  const range: ReportRange = requestedRange === "7d" || requestedRange === "30d" || requestedRange === "month" ? requestedRange : "today";
  const now = new Date();
  const today = manilaDateParts(now);
  const currentMonth = `${today.year}-${String(today.month).padStart(2, "0")}`;
  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? String(params.month) : currentMonth;

  const todaySerial = Date.UTC(today.year, today.month - 1, today.day);
  let startSerial = todaySerial;
  let endSerial = todaySerial + DAY_MS;
  let rangeLabel = "Today";

  if (range === "7d") {
    startSerial = todaySerial - 6 * DAY_MS;
    rangeLabel = "Last 7 days";
  } else if (range === "30d") {
    startSerial = todaySerial - 29 * DAY_MS;
    rangeLabel = "Last 30 days";
  } else if (range === "month") {
    const [year, month] = selectedMonth.split("-").map(Number);
    startSerial = Date.UTC(year, month - 1, 1);
    endSerial = Date.UTC(year, month, 1);
    rangeLabel = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(startSerial));
  }

  const startAt = new Date(startSerial - MANILA_OFFSET_MS).toISOString();
  const endAt = new Date(endSerial - MANILA_OFFSET_MS).toISOString();
  const startExpenseDate = new Date(startSerial).toISOString().slice(0, 10);
  const endExpenseDate = new Date(endSerial).toISOString().slice(0, 10);
  const supabase = await createClient();
  const [{ data: saleData, error: salesError }, { data: itemData }, expenseResult] = await Promise.all([
    supabase
      .from("sales")
      .select("id, receipt_number, status, total_amount, tax_amount, refunded_amount, sales_channel, external_order_id, payment_method, payment_reference, completed_at, cashier:profiles!sales_cashier_id_fkey(full_name)")
      .in("status", ["completed", "partially_refunded", "refunded"])
      .gte("completed_at", startAt)
      .lt("completed_at", endAt)
      .order("completed_at", { ascending: false }),
    supabase
      .from("sale_items")
      .select("quantity, refunded_quantity, conversion_to_piece, product_name, unit_price, line_total, line_cost, sales!inner(status, completed_at)")
      .in("sales.status", ["completed", "partially_refunded", "refunded"])
      .gte("sales.completed_at", startAt)
      .lt("sales.completed_at", endAt),
    currentUser.role === "super_admin" ? supabase.from("expenses").select("category, amount").gte("expense_date", startExpenseDate).lt("expense_date", endExpenseDate) : Promise.resolve({ data: [] as { category: string; amount: number | string }[] }),
  ]);

  const sales = (saleData ?? []) as unknown as SaleRow[];
  const items = itemData ?? [];
  const grossSales = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const refundTotal = sales.reduce((sum, sale) => sum + Number(sale.refunded_amount), 0);
  const totalSales = grossSales - refundTotal;
  const averageOrder = sales.length ? totalSales / sales.length : 0;
  const piecesSold = items.reduce((sum, item) => sum + (Number(item.quantity) - Number(item.refunded_quantity)) * Number(item.conversion_to_piece), 0);
  const expenses = expenseResult.data ?? [];
  const totalExpenses = expenses.filter((expense) => expense.category !== "tax_3_percent").reduce((sum, expense) => sum + Number(expense.amount), 0);
  let reversedCost = 0;
  let refundedTax = 0;
  if (currentUser.role === "super_admin" && sales.length) {
    const { data: refundRows } = await supabase.from("sale_refunds").select("sale_refund_items(reversed_cost, tax_refund_amount)").in("sale_id", sales.map((sale) => sale.id));
    reversedCost = (refundRows ?? []).reduce((sum, refund) => sum + (refund.sale_refund_items ?? []).reduce((itemSum, item) => itemSum + Number(item.reversed_cost), 0), 0);
    refundedTax = (refundRows ?? []).reduce((sum, refund) => sum + (refund.sale_refund_items ?? []).reduce((itemSum, item) => itemSum + Number(item.tax_refund_amount), 0), 0);
  }
  const costOfGoods = items.reduce((sum, item) => sum + Number(item.line_cost), 0) - reversedCost;
  const taxCollected = sales.reduce((sum, sale) => sum + Number(sale.tax_amount), 0) - refundedTax;
  const grossProfit = totalSales - costOfGoods;
  const netIncome = grossProfit - taxCollected - totalExpenses;

  const channelTotals = new Map<string, { amount: number; count: number }>();
  const paymentTotals = new Map<string, { amount: number; count: number }>();
  const cashierTotals = new Map<string, { amount: number; count: number }>();
  for (const sale of sales) {
    const current = channelTotals.get(sale.sales_channel) ?? { amount: 0, count: 0 };
    current.amount += netSale(sale);
    current.count += 1;
    channelTotals.set(sale.sales_channel, current);
    const payment = paymentTotals.get(sale.payment_method) ?? { amount: 0, count: 0 };
    payment.amount += netSale(sale);
    payment.count += 1;
    paymentTotals.set(sale.payment_method, payment);
    const cashier = cashierTotals.get(actorName(sale)) ?? { amount: 0, count: 0 };
    cashier.amount += netSale(sale);
    cashier.count += 1;
    cashierTotals.set(actorName(sale), cashier);
  }

  const dailyTotals = new Map<string, number>();
  for (let serial = startSerial; serial < endSerial; serial += DAY_MS) dailyTotals.set(new Date(serial).toISOString().slice(0, 10), 0);
  for (const sale of sales) dailyTotals.set(dateKey(new Date(sale.completed_at)), (dailyTotals.get(dateKey(new Date(sale.completed_at))) ?? 0) + netSale(sale));
  const chartDays = [...dailyTotals.entries()];
  const chartMax = Math.max(...chartDays.map(([, amount]) => amount), 1);

  const productTotals = new Map<string, { quantity: number; amount: number }>();
  for (const item of items) {
    const current = productTotals.get(item.product_name) ?? { quantity: 0, amount: 0 };
    const netQuantity = Number(item.quantity) - Number(item.refunded_quantity);
    current.quantity += netQuantity;
    current.amount += Number(item.unit_price) * netQuantity;
    productTotals.set(item.product_name, current);
  }
  const topProducts = [...productTotals.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);

  return (
    <div className="page-print mx-auto max-w-[1400px]">
      <AutoPrint enabled={params.print === "1"} />
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><p className="eyebrow">Business insights</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Sales reports</h1><p className="mt-2 text-sm text-[#718079]">Completed transactions shown in Philippine time.</p></div>
        <div className="print-hidden flex flex-wrap gap-2">
          <Link className="rounded-xl border border-[#dfe6e2] bg-white px-4 py-2.5 text-xs font-extrabold text-[#627068] hover:bg-[#f4f7f5]" href="/api/export/sales"><span className="inline-flex items-center gap-1.5"><Download size={13} />Export</span></Link>
          {[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }].map((item) => <Link className={`rounded-xl border px-4 py-2.5 text-xs font-extrabold transition ${range === item.value ? "border-[#0f6b4f] bg-[#0f6b4f] text-white" : "border-[#dfe6e2] bg-white text-[#627068] hover:bg-[#f4f7f5]"}`} href={`/dashboard/reports?range=${item.value}`} key={item.value}>{item.label}</Link>)}
          <form action="/dashboard/reports" className={`flex items-center gap-2 rounded-xl border px-3 ${range === "month" ? "border-[#0f6b4f] bg-[#edf6f2]" : "border-[#dfe6e2] bg-white"}`} method="get"><input name="range" type="hidden" value="month" /><CalendarDays size={15} className="text-[#0f6b4f]" /><input aria-label="Report month" className="bg-transparent py-2.5 text-xs font-extrabold outline-none" defaultValue={selectedMonth} name="month" type="month" /><button className="text-[10px] font-black text-[#0f6b4f]" type="submit">VIEW</button></form>
        </div>
      </div>

      {salesError && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Sales reports need the latest POS database migrations. Run them in Supabase and refresh this page.</div>}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: `${rangeLabel} net sales`, value: money(totalSales), note: refundTotal ? `${money(refundTotal)} refunded` : "Completed sales after refunds", icon: CircleDollarSign, style: "bg-emerald-50 text-emerald-700" }, { label: "Transactions", value: String(sales.length), note: "Completed and refunded orders", icon: ReceiptText, style: "bg-blue-50 text-blue-700" }, { label: "Average order", value: money(averageOrder), note: "Net sales per transaction", icon: ShoppingBag, style: "bg-orange-50 text-orange-700" }, { label: "Pieces sold", value: piecesSold.toLocaleString(), note: "After returned item refunds", icon: PackageCheck, style: "bg-violet-50 text-violet-700" }].map(({ label, value, note, icon: Icon, style }) => <article className="card p-5" key={label}><div className="flex items-start justify-between"><p className="text-sm font-semibold text-[#718078]">{label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl ${style}`}><Icon size={18} /></span></div><p className="mt-3 text-2xl font-black tracking-tight">{value}</p><p className="mt-2 text-xs text-[#8a958f]">{note}</p></article>)}
      </section>

      {currentUser.role === "super_admin" && <section className="card mt-5 overflow-hidden"><div className="border-b border-[#e5eae7] px-6 py-4"><h2 className="font-extrabold">Income summary</h2><p className="mt-1 text-xs text-[#819087]">{rangeLabel}: gross sales − refunds − non-VAT tax collected − cost of goods − operating expenses</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-6">{[{ label: "Gross sales", value: grossSales, color: "text-[#17251f]" }, { label: "Refunds", value: -refundTotal, color: "text-red-600" }, { label: "3% tax collected", value: -taxCollected, color: "text-rose-600" }, { label: "Cost of goods", value: -costOfGoods, color: "text-orange-600" }, { label: "Expenses", value: -totalExpenses, color: "text-violet-600" }, { label: "Net income", value: netIncome, color: netIncome >= 0 ? "text-emerald-700" : "text-red-700" }].map((metric) => <div className="border-b border-r border-[#edf0ee] p-5 last:border-r-0 sm:border-b-0" key={metric.label}><p className="text-xs font-bold text-[#7c8982]">{metric.label}</p><p className={`mt-2 text-xl font-black ${metric.color}`}>{money(metric.value)}</p></div>)}</div></section>}

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <article className="card overflow-hidden p-6"><div className="flex items-start justify-between"><div><h2 className="font-extrabold">Sales trend</h2><p className="mt-1 text-xs text-[#819087]">{rangeLabel}</p></div><BarChart3 size={19} className="text-[#0f6b4f]" /></div><div className="mt-6 flex h-56 items-end gap-1.5 border-b border-[#dfe6e2] px-1">{chartDays.map(([day, amount]) => <div className="group relative flex h-full min-w-0 flex-1 items-end" key={day}><div className="w-full rounded-t-md bg-[#84bba4] transition hover:bg-[#0f6b4f]" style={{ height: `${amount ? Math.max(8, (amount / chartMax) * 100) : 2}%` }}><span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1c2d25] px-2 py-1 text-[10px] font-bold text-white group-hover:block">{day} · {money(amount)}</span></div></div>)}</div><div className="mt-2 flex justify-between text-[10px] font-semibold text-[#8a958f]"><span>{chartDays[0]?.[0]}</span><span>{chartDays.at(-1)?.[0]}</span></div></article>

        <article className="card p-6"><h2 className="font-extrabold">Sales by channel</h2><p className="mt-1 text-xs text-[#819087]">Where completed orders came from</p><div className="mt-5 space-y-4">{["walk_in", "tiktok", "lazada", "shopee"].map((channel) => { const value = channelTotals.get(channel) ?? { amount: 0, count: 0 }; const share = totalSales ? value.amount / totalSales * 100 : 0; return <div key={channel}><div className="flex items-center justify-between text-xs"><span className="font-extrabold">{channelNames[channel]}</span><span className="font-bold">{money(value.amount)} <span className="font-medium text-[#8a958f]">({value.count})</span></span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf1ef]"><div className="h-full rounded-full bg-[#0f6b4f]" style={{ width: `${share}%` }} /></div></div>; })}</div></article>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><article className="card p-6"><div className="flex items-start justify-between"><div><h2 className="font-extrabold">Payment methods</h2><p className="mt-1 text-xs text-[#819087]">Cash, GCash, credit card, and marketplace settlements for {rangeLabel.toLowerCase()}</p></div><ReceiptText size={19} className="text-[#0f6b4f]" /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ key: "cash", label: "Cash", style: "bg-emerald-50 text-emerald-700" }, { key: "gcash", label: "GCash", style: "bg-blue-50 text-blue-700" }, { key: "credit_card", label: "Credit Card", style: "bg-amber-50 text-amber-700" }, { key: "marketplace", label: "Marketplace", style: "bg-violet-50 text-violet-700" }].map((method) => { const value = paymentTotals.get(method.key) ?? { amount: 0, count: 0 }; const share = totalSales ? value.amount / totalSales * 100 : 0; return <div className={`rounded-2xl p-4 ${method.style}`} key={method.key}><div className="flex items-center justify-between"><span className="text-xs font-extrabold">{method.label}</span><span className="text-[10px] font-bold">{share.toFixed(0)}%</span></div><p className="mt-3 text-xl font-black">{money(value.amount)}</p><p className="mt-1 text-[10px] font-semibold opacity-70">{value.count} transactions</p></div>; })}</div></article><article className="card p-6"><h2 className="font-extrabold">Cashier performance</h2><p className="mt-1 text-xs text-[#819087]">Completed transactions by team member</p><div className="mt-5 space-y-3">{[...cashierTotals.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 4).map(([name, value], index) => <div className="flex items-center gap-3" key={name}><span className="grid h-8 w-8 place-items-center rounded-full bg-[#edf5f1] text-xs font-black text-[#0f6b4f]">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{name}</p><p className="text-[10px] text-[#89948e]">{value.count} transactions</p></div><span className="text-xs font-black">{money(value.amount)}</span></div>)}{!cashierTotals.size && <p className="py-10 text-center text-xs text-[#87928c]">No cashier activity.</p>}</div></article></section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.6fr]">
        <article className="card p-6"><h2 className="font-extrabold">Top products</h2><p className="mt-1 text-xs text-[#819087]">Ranked by sales amount</p><div className="mt-5 space-y-3">{topProducts.length ? topProducts.map(([name, value], index) => <div className="flex items-center gap-3 rounded-xl border border-[#e8ece9] p-3" key={name}><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf5f1] text-xs font-black text-[#0f6b4f]">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{name}</p><p className="text-[10px] text-[#86918b]">{value.quantity} units sold</p></div><span className="text-xs font-extrabold">{money(value.amount)}</span></div>) : <p className="py-16 text-center text-sm text-[#87928c]">No product sales in this period.</p>}</div></article>

        <article className="card overflow-hidden"><div className="border-b border-[#e5eae7] px-5 py-4"><h2 className="font-extrabold">Recent transactions</h2><p className="mt-1 text-xs text-[#819087]">Latest completed orders in this period</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#87928c]"><th className="px-5 py-3">Receipt</th><th className="px-5 py-3">Channel</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Cashier</th><th className="px-5 py-3">Time</th><th className="px-5 py-3 text-right">Net</th></tr></thead><tbody>{sales.slice(0, 10).map((sale) => <tr className="border-b border-[#edf0ee] last:border-0" key={sale.id}><td className="px-5 py-3"><p className="text-xs font-extrabold">{sale.receipt_number}</p>{(sale.external_order_id || sale.payment_reference) && <p className="mt-0.5 text-[10px] text-[#88948e]">Ref: {sale.external_order_id || sale.payment_reference}</p>}</td><td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${channelStyles[sale.sales_channel] ?? "bg-slate-50 text-slate-600"}`}>{channelNames[sale.sales_channel] ?? sale.sales_channel}</span></td><td className="px-5 py-3 text-xs font-bold capitalize text-[#66736d]">{sale.payment_method === "marketplace" ? "Online" : sale.payment_method === "credit_card" ? "Card" : sale.payment_method}</td><td className="px-5 py-3 text-xs font-semibold text-[#66736d]">{actorName(sale)}</td><td className="px-5 py-3 text-xs text-[#77847d]">{new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(sale.completed_at))}</td><td className="px-5 py-3 text-right"><p className="text-sm font-black">{money(netSale(sale))}</p>{Number(sale.refunded_amount) > 0 && <p className="text-[10px] text-red-600">Refunded {money(Number(sale.refunded_amount))}</p>}</td></tr>)}{!sales.length && <tr><td className="py-20 text-center text-sm text-[#87928c]" colSpan={6}>No completed sales in this period.</td></tr>}</tbody></table></div></article>
      </section>
    </div>
  );
}
