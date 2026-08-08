"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2, TriangleAlert, X } from "lucide-react";
import { deleteSupply, type DeleteSupplyState } from "@/app/dashboard/supplies/actions";

const initialState: DeleteSupplyState = {};

export function DeleteSupplyButton({ supplyId, supplyName }: { supplyId: string; supplyName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteSupply, initialState);

  useEffect(() => {
    if (!state.success) return;
    const timer = window.setTimeout(() => setOpen(false), 1100);
    return () => window.clearTimeout(timer);
  }, [state.success]);

  return (
    <>
      <button className="grid h-9 w-9 place-items-center rounded-lg border border-[#e3e8e5] bg-white text-[#87928c] hover:border-red-200 hover:bg-red-50 hover:text-red-600" onClick={() => setOpen(true)} type="button" aria-label={`Delete ${supplyName}`}><Trash2 size={14} /></button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600"><TriangleAlert size={21} /></span><button className="grid h-9 w-9 place-items-center rounded-lg text-[#7d8882] hover:bg-[#f2f5f3]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={19} /></button></div>
            <h2 className="mt-5 text-xl font-black">Delete supply?</h2>
            <p className="mt-2 text-sm leading-6 text-[#718078]">Are you sure you want to delete <strong>{supplyName}</strong>? This cannot be undone.</p>
            <form action={action} className="mt-5">
              <input name="supplyId" type="hidden" value={supplyId} />
              <input name="supplyName" type="hidden" value={supplyName} />
              {state.error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
              {state.success && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">{state.success}</p>}
              <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setOpen(false)} type="button">Cancel</button><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60" disabled={pending} type="submit"><Trash2 size={15} />{pending ? "Deleting…" : "Delete supply"}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
