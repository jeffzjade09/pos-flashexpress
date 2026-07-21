"use client";

import { useActionState, useEffect, useState } from "react";
import { Boxes, Minus, PackageCheck, Plus, RefreshCw, X } from "lucide-react";
import { adjustStock, type StockActionState } from "@/app/dashboard/inventory/stock-actions";

const initialState: StockActionState = {};

type Props = {
  productId: string;
  productName: string;
  currentStock: number;
  piecesPerBox?: number;
};

export function AdjustStockForm({ productId, productName, currentStock, piecesPerBox }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [state, action, pending] = useActionState(adjustStock, initialState);

  useEffect(() => {
    if (!state.success) return;
    const timer = window.setTimeout(() => setOpen(false), 1200);
    return () => window.clearTimeout(timer);
  }, [state.success]);

  const modeOptions = [
    { value: "add" as const, label: "Add", icon: Plus, help: "Stock received or found" },
    { value: "remove" as const, label: "Remove", icon: Minus, help: "Damaged, missing, or used" },
    { value: "set" as const, label: "Set exact", icon: RefreshCw, help: "Replace with a physical count" },
  ];

  return (
    <>
      <button className="btn-secondary py-2 text-xs" onClick={() => setOpen(true)} type="button">
        <PackageCheck size={14} />Adjust stock
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#e7ece9] px-6 py-5">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#0f6b4f]"><Boxes size={20} /></span><div><h2 className="text-xl font-black">Adjust stock</h2><p className="mt-0.5 text-xs text-[#7b8781]">{productName}</p></div></div>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-[#7d8882] hover:bg-[#f2f5f3]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={19} /></button>
            </div>

            <form action={action} className="p-6">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="productName" value={productName} />
              <input type="hidden" name="mode" value={mode} />

              <div className="rounded-xl bg-[#f3f7f5] p-4">
                <p className="text-xs font-semibold text-[#718078]">Current on hand</p>
                <p className="mt-1 text-2xl font-black">{state.newStock ?? currentStock} <span className="text-sm font-semibold text-[#7d8983]">pieces</span></p>
                {piecesPerBox && <p className="mt-1 text-xs text-[#849089]">Equivalent to {Math.floor((state.newStock ?? currentStock) / piecesPerBox)} full boxes + {(state.newStock ?? currentStock) % piecesPerBox} loose pieces</p>}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {modeOptions.map(({ value, label, icon: Icon, help }) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-xl border p-3 text-left transition ${mode === value ? "border-[#0f6b4f] bg-[#eaf4ef] text-[#0f6b4f]" : "border-[#e0e6e2] hover:bg-[#f8faf9]"}`}><Icon size={17} /><p className="mt-2 text-xs font-extrabold">{label}</p><p className="mt-1 hidden text-[10px] leading-4 text-[#7e8a84] sm:block">{help}</p></button>)}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_0.75fr]">
                <label className="block text-xs font-bold text-[#34453d]"><span className="mb-1.5 block">{mode === "set" ? "New exact quantity" : "Quantity"}</span><input className="field" name="quantity" type="number" min="0" step="1" defaultValue={mode === "set" ? currentStock : 1} key={mode} required /></label>
                <label className="block text-xs font-bold text-[#34453d]"><span className="mb-1.5 block">Unit</span><select className="field" name="unit" defaultValue="piece"><option value="piece">Pieces</option>{piecesPerBox && <option value="box">Boxes ({piecesPerBox} pcs)</option>}</select></label>
              </div>

              <label className="mt-4 block text-xs font-bold text-[#34453d]"><span className="mb-1.5 block">Reason</span><input className="field" name="note" placeholder="e.g. Received supplier delivery, physical count correction" minLength={3} required /></label>

              {state.error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
              {state.success && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">{state.success}</p>}

              <div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary min-w-32" disabled={pending} type="submit">{pending ? "Saving…" : `${mode === "add" ? "Add" : mode === "remove" ? "Remove" : "Set"} stock`}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
