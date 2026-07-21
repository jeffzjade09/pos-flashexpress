"use client";

import { Trash2 } from "lucide-react";
import { deleteExpense } from "@/app/dashboard/expenses/actions";

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  return <form action={deleteExpense} onSubmit={(event) => { if (!window.confirm("Delete this expense entry? This action will be recorded in the activity log.")) event.preventDefault(); }}><input name="expenseId" type="hidden" value={expenseId} /><button className="grid h-9 w-9 place-items-center rounded-lg border border-[#e3e8e5] text-[#8b9690] hover:border-red-200 hover:bg-red-50 hover:text-red-600" type="submit" aria-label="Delete expense"><Trash2 size={14} /></button></form>;
}
