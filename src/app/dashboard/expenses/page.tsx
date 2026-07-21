import { Building2, CalendarDays, Package, Percent, Truck, Users, WalletCards, Zap } from "lucide-react";
import { ExpenseForm, type EditableExpense } from "@/components/expense-form";
import { DeleteExpenseButton } from "@/components/delete-expense-button";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ExpenseRow = { id: string; category: string; amount: number | string; expense_date: string; note: string | null; created_at: string };
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const categoryMeta: Record<string, { label: string; icon: typeof Zap; style: string }> = {
  electricity: { label: "Electricity", icon: Zap, style: "bg-amber-50 text-amber-700" },
  manpower_labor: { label: "Manpower labor", icon: Users, style: "bg-blue-50 text-blue-700" },
  packaging_materials: { label: "Packaging materials", icon: Package, style: "bg-violet-50 text-violet-700" },
  rent: { label: "Rent", icon: Building2, style: "bg-orange-50 text-orange-700" },
  tax_3_percent: { label: "Percentage-tax payment", icon: Percent, style: "bg-red-50 text-red-700" },
  gas_delivery: { label: "Gas delivery", icon: Truck, style: "bg-emerald-50 text-emerald-700" },
  other: { label: "Other", icon: WalletCards, style: "bg-slate-100 text-slate-700" },
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? String(params.month) : currentMonth;
  const [year, monthNumber] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const startAt = new Date(Date.UTC(year, monthNumber - 1, 1) - 8 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(Date.UTC(year, monthNumber, 1) - 8 * 60 * 60 * 1000).toISOString();
  const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  const supabase = await createClient();
  const [{ data: expenseData, error }, { data: saleData }] = await Promise.all([
    supabase.from("expenses").select("id, category, amount, expense_date, note, created_at").gte("expense_date", startDate).lt("expense_date", endDate).order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("sales").select("id, tax_amount").in("status", ["completed", "partially_refunded", "refunded"]).gte("completed_at", startAt).lt("completed_at", endAt),
  ]);
  const saleIds = (saleData ?? []).map((sale) => sale.id);
  const refundResult = saleIds.length
    ? await supabase.from("sale_refunds").select("sale_refund_items(tax_refund_amount)").in("sale_id", saleIds)
    : { data: [] as { sale_refund_items: { tax_refund_amount: number | string }[] }[] };
  const refundedTax = (refundResult.data ?? []).reduce((sum, refund) => sum + (refund.sale_refund_items ?? []).reduce((itemSum, item) => itemSum + Number(item.tax_refund_amount), 0), 0);
  const taxCollected = (saleData ?? []).reduce((sum, sale) => sum + Number(sale.tax_amount), 0) - refundedTax;
  const expenses = (expenseData ?? []) as ExpenseRow[];
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const totals = new Map<string, number>();
  for (const expense of expenses) totals.set(expense.category, (totals.get(expense.category) ?? 0) + Number(expense.amount));

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><p className="eyebrow">Cost control</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Expenses</h1><p className="mt-2 text-sm text-[#718079]">Record actual operating costs and percentage-tax payments.</p></div>
        <div className="flex flex-wrap gap-2"><form className="flex items-center gap-2 rounded-xl border border-[#dfe6e2] bg-white px-3"><CalendarDays size={15} className="text-[#0f6b4f]" /><input className="bg-transparent py-2.5 text-xs font-extrabold outline-none" defaultValue={month} name="month" type="month" /><button className="text-[10px] font-black text-[#0f6b4f]">VIEW</button></form><ExpenseForm /></div>
      </div>
      {error && <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Run the latest refunds and expenses migration in Supabase, then refresh this page.</div>}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card p-5"><p className="text-xs font-bold text-[#718078]">{monthLabel} expenses</p><p className="mt-3 text-3xl font-black">{money(totalExpenses)}</p><p className="mt-2 text-xs text-[#89948e]">{expenses.length} recorded entries</p></article>
        {["electricity", "manpower_labor", "packaging_materials"].map((category) => { const meta = categoryMeta[category]; const Icon = meta.icon; return <article className="card p-5" key={category}><div className="flex items-start justify-between"><p className="text-xs font-bold text-[#718078]">{meta.label}</p><span className={`grid h-9 w-9 place-items-center rounded-xl ${meta.style}`}><Icon size={17} /></span></div><p className="mt-3 text-2xl font-black">{money(totals.get(category) ?? 0)}</p><p className="mt-2 text-xs text-[#89948e]">Adjustable monthly total</p></article>; })}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_2fr]">
        <div className="space-y-5">
          <article className="card p-6">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-700"><Percent size={18} /></span><div><h2 className="font-extrabold">3% tax collected</h2><p className="mt-0.5 text-xs text-[#849088]">Net of tax returned through refunds</p></div></div>
            <p className="mt-5 text-3xl font-black">{money(taxCollected)}</p>
            <p className="mt-2 text-xs leading-5 text-[#7f8c85]">Automatically charged on new POS transactions. Record an expense only when you make the actual percentage-tax payment.</p>
          </article>
          <article className="card p-6"><h2 className="font-extrabold">Category totals</h2><div className="mt-4 space-y-3">{Object.entries(categoryMeta).map(([key, meta]) => { const Icon = meta.icon; return <div className="flex items-center gap-3" key={key}><span className={`grid h-8 w-8 place-items-center rounded-lg ${meta.style}`}><Icon size={14} /></span><span className="min-w-0 flex-1 text-xs font-bold">{meta.label}</span><span className="text-xs font-black">{money(totals.get(key) ?? 0)}</span></div>; })}</div></article>
        </div>

        <article className="card overflow-hidden">
          <div className="border-b border-[#e5eae7] px-5 py-4"><h2 className="font-extrabold">Expense entries</h2><p className="mt-1 text-xs text-[#819087]">Every amount remains editable and auditable</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#87928c]"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Notes</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>
            {expenses.map((expense) => { const meta = categoryMeta[expense.category] ?? categoryMeta.other; const Icon = meta.icon; const editable: EditableExpense = { id: expense.id, category: expense.category, amount: Number(expense.amount), expenseDate: expense.expense_date, note: expense.note ?? "" }; return <tr className="border-b border-[#edf0ee] last:border-0" key={expense.id}><td className="px-5 py-4 text-xs font-semibold">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${expense.expense_date}T00:00:00Z`))}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${meta.style}`}><Icon size={14} /></span><span className="text-xs font-bold">{meta.label}</span></div></td><td className="max-w-xs truncate px-5 py-4 text-xs text-[#77847d]">{expense.note || "—"}</td><td className="px-5 py-4 text-right text-sm font-black">{money(Number(expense.amount))}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><ExpenseForm expense={editable} /><DeleteExpenseButton expenseId={expense.id} /></div></td></tr>; })}
            {!expenses.length && <tr><td className="py-20 text-center text-sm text-[#87928c]" colSpan={5}>No expenses recorded for {monthLabel}.</td></tr>}
          </tbody></table></div>
        </article>
      </section>
    </div>
  );
}
