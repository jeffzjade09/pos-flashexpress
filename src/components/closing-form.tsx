"use client";

import { useActionState } from "react";
import { ClipboardCheck } from "lucide-react";
import { closeDay, type ClosingState } from "@/app/dashboard/closing/actions";

const initial: ClosingState = {};
export function ClosingForm({ businessDate, expectedCash, expectedGcash, closed }: { businessDate: string; expectedCash: number; expectedGcash: number; closed: boolean }) {
  const [state, action, pending] = useActionState(closeDay, initial);
  return <form action={action} className="card p-6"><input name="businessDate" type="hidden" value={businessDate} /><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f4ef] text-[#0f6b4f]"><ClipboardCheck size={20} /></span><div><h2 className="font-extrabold">Count actual payments</h2><p className="mt-1 text-xs text-[#819087]">Enter the cash drawer and verified GCash total.</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold"><span className="mb-1.5 block">Actual cash</span><input className="field text-sm" defaultValue={expectedCash.toFixed(2)} min="0" name="actualCash" step="0.01" type="number" required /></label><label className="text-xs font-bold"><span className="mb-1.5 block">Actual GCash</span><input className="field text-sm" defaultValue={expectedGcash.toFixed(2)} min="0" name="actualGcash" step="0.01" type="number" required /></label><label className="text-xs font-bold sm:col-span-2"><span className="mb-1.5 block">Closing notes</span><textarea className="field min-h-20 text-sm" name="notes" placeholder="Explain shortages, overages, or verification notes" /></label></div>{state.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p>}{state.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{state.success}</p>}<button className="btn-primary mt-5 w-full" disabled={pending || closed}>{closed ? "Today is already closed" : pending ? "Closing…" : "Close cashier day"}</button></form>;
}
