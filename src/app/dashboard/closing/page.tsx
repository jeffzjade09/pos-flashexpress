import { Banknote, Smartphone } from "lucide-react";
import { ClosingForm } from "@/components/closing-form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ClosingRow = { id: string; business_date: string; expected_cash: number | string; actual_cash: number | string; cash_variance: number | string; expected_gcash: number | string; actual_gcash: number | string; gcash_variance: number | string; notes: string | null; created_at: string };
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

export default async function ClosingPage() {
  const user = await requireUser();
  const businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const start = new Date(`${businessDate}T00:00:00+08:00`).toISOString();
  const end = new Date(new Date(`${businessDate}T00:00:00+08:00`).getTime() + 86_400_000).toISOString();
  const supabase = await createClient();
  const [{ data: saleData }, { data: closingData, error }] = await Promise.all([
    supabase.from("sales").select("total_amount, refunded_amount, payment_method").eq("cashier_id", user.id).in("status", ["completed", "partially_refunded", "refunded"]).gte("completed_at", start).lt("completed_at", end),
    supabase.from("cashier_closings").select("id, business_date, expected_cash, actual_cash, cash_variance, expected_gcash, actual_gcash, gcash_variance, notes, created_at").order("business_date", { ascending: false }).limit(30),
  ]);
  const expectedCash = (saleData ?? []).filter((sale) => sale.payment_method === "cash").reduce((sum, sale) => sum + Number(sale.total_amount) - Number(sale.refunded_amount), 0);
  const expectedGcash = (saleData ?? []).filter((sale) => sale.payment_method === "gcash").reduce((sum, sale) => sum + Number(sale.total_amount) - Number(sale.refunded_amount), 0);
  const closings = (closingData ?? []) as ClosingRow[];
  const alreadyClosed = closings.some((closing) => closing.business_date === businessDate);
  return <div className="mx-auto max-w-5xl"><div><p className="eyebrow">Cashier reconciliation</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Daily closing</h1><p className="mt-2 text-sm text-[#718079]">Compare recorded payments with the amounts you actually counted.</p></div>{error && <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Run the latest purchases and closing migration in Supabase.</div>}<section className="mt-7 grid gap-4 sm:grid-cols-2"><article className="card p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#718078]">Expected cash</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Banknote size={17} /></span></div><p className="mt-3 text-3xl font-black">{money(expectedCash)}</p><p className="mt-2 text-xs text-[#89948e]">Your walk-in cash sales today</p></article><article className="card p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#718078]">Expected GCash</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><Smartphone size={17} /></span></div><p className="mt-3 text-3xl font-black">{money(expectedGcash)}</p><p className="mt-2 text-xs text-[#89948e]">Your verified GCash sales today</p></article></section><div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]"><ClosingForm businessDate={businessDate} expectedCash={expectedCash} expectedGcash={expectedGcash} closed={alreadyClosed} /><article className="card overflow-hidden"><div className="border-b border-[#e5eae7] px-5 py-4"><h2 className="font-extrabold">Closing history</h2><p className="mt-1 text-xs text-[#819087]">Your latest 30 cashier closings</p></div><div className="divide-y divide-[#edf0ee]">{closings.slice(0, 10).map((closing) => { const variance = Number(closing.cash_variance) + Number(closing.gcash_variance); return <div className="flex items-center gap-4 px-5 py-4" key={closing.id}><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">{new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${closing.business_date}T00:00:00Z`))}</p><p className="mt-1 text-[10px] text-[#89948e]">Cash {money(Number(closing.actual_cash))} · GCash {money(Number(closing.actual_gcash))}</p></div><span className={`text-xs font-black ${variance === 0 ? "text-emerald-700" : variance < 0 ? "text-red-600" : "text-amber-700"}`}>{variance > 0 ? "+" : ""}{money(variance)}</span></div>; })}{!closings.length && <p className="py-20 text-center text-sm text-[#87928c]">No cashier closings yet.</p>}</div></article></div></div>;
}
