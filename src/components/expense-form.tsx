"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { createExpense, updateExpense, type ExpenseState } from "@/app/dashboard/expenses/actions";
import { expenseCategories } from "@/lib/expenses";

export type EditableExpense = { id: string; category: string; amount: number; expenseDate: string; note: string };
const initialState: ExpenseState = {};
const labels: Record<string, string> = { electricity: "Electricity", manpower_labor: "Manpower labor", packaging_materials: "Packaging materials", rent: "Rent", tax_3_percent: "Percentage-tax payment", gas_delivery: "Gas delivery", other: "Other" };

export function ExpenseForm({ expense, defaultCategory, defaultAmount, buttonLabel }: { expense?: EditableExpense; defaultCategory?: string; defaultAmount?: number; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const actionFunction = expense ? updateExpense : createExpense;
  const [state, action, pending] = useActionState(async (previous: ExpenseState, formData: FormData) => {
    const result = await actionFunction(previous, formData);
    if (result.success) setOpen(false);
    return result;
  }, initialState);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

  return <><button className={expense ? "btn-secondary py-2 text-xs" : "btn-primary"} onClick={() => setOpen(true)} type="button">{expense ? <Pencil size={13} /> : <Plus size={16} />}{buttonLabel ?? (expense ? "Edit" : "Add expense")}</button>{open && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10251c]/50 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-[#e6ebe8] px-6 py-5"><div><p className="eyebrow">Operating cost</p><h2 className="mt-1 text-xl font-black">{expense ? "Edit expense" : "Record expense"}</h2></div><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f1f4f2]" onClick={() => setOpen(false)} type="button"><X size={18} /></button></div><form action={action} className="p-6">{expense && <input name="expenseId" type="hidden" value={expense.id} />}<div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold"><span className="mb-1.5 block">Category</span><select className="field text-sm" defaultValue={expense?.category ?? defaultCategory ?? "electricity"} name="category">{expenseCategories.map((category) => <option key={category} value={category}>{labels[category]}</option>)}</select></label><label className="text-xs font-bold"><span className="mb-1.5 block">Amount</span><span className="relative block"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7c8982]">₱</span><input className="field with-currency-prefix text-sm" defaultValue={expense?.amount ?? (defaultAmount ? defaultAmount.toFixed(2) : "")} min="0.01" name="amount" placeholder="0.00" required step="0.01" type="number" /></span></label><label className="text-xs font-bold sm:col-span-2"><span className="mb-1.5 block">Expense date</span><input className="field text-sm" defaultValue={expense?.expenseDate ?? today} name="expenseDate" required type="date" /></label><label className="text-xs font-bold sm:col-span-2"><span className="mb-1.5 block">Notes</span><textarea className="field min-h-20 resize-y text-sm" defaultValue={expense?.note ?? ""} name="note" placeholder="Bill period, employee details, supplier, or other context" /></label></div>{state.error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{state.error}</p>}<div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setOpen(false)} type="button">Cancel</button><button className="btn-primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save expense"}</button></div></form></div></div>}</>;
}
