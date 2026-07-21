"use client";

import { useActionState, useMemo, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { refundSale, type RefundState } from "@/app/dashboard/sales/actions";

export type RefundableItem = {
  id: string;
  productName: string;
  unitName: string;
  quantity: number;
  refundedQuantity: number;
  unitPrice: number;
};

const initialState: RefundState = {};
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

export function RefundSaleButton({ saleId, receiptNumber, items }: { saleId: string; receiptNumber: string; items: RefundableItem[] }) {
  const [open, setOpen] = useState(false);
  const [restock, setRestock] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [state, action, pending] = useActionState(refundSale, initialState);
  const selected = useMemo(() => items.map((item) => ({ sale_item_id: item.id, quantity: quantities[item.id] ?? 0 })).filter((item) => item.quantity > 0), [items, quantities]);
  const total = items.reduce((sum, item) => sum + Math.round((quantities[item.id] ?? 0) * item.unitPrice * 1.03 * 100) / 100, 0);

  return (
    <>
      <button className="btn-secondary py-2 text-xs" onClick={() => setOpen(true)} type="button"><RotateCcw size={14} />Refund</button>
      {open && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm"><div className="my-5 w-full max-w-xl rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-[#e6ebe8] px-6 py-5"><div><p className="eyebrow">Item refund</p><h2 className="mt-1 text-xl font-black">{receiptNumber}</h2></div><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f1f4f2]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={18} /></button></div><form action={action} className="p-6"><input name="saleId" type="hidden" value={saleId} /><input name="restock" type="hidden" value={String(restock)} /><input name="items" type="hidden" value={JSON.stringify(selected)} /><div className="space-y-3">{items.map((item) => { const available = item.quantity - item.refundedQuantity; return <label className="flex items-center gap-3 rounded-xl border border-[#e3e8e5] p-3" key={item.id}><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{item.productName}</p><p className="mt-0.5 text-xs text-[#829088]">{item.unitName} · {money(item.unitPrice)} · {available} refundable</p></div><input aria-label={`Refund quantity for ${item.productName}`} className="field w-20 text-center text-sm" disabled={!available} min="0" max={available} type="number" value={quantities[item.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Math.min(available, Number(event.target.value) || 0)) }))} /></label>; })}</div><label className="mt-5 flex items-start gap-3 rounded-xl bg-[#f5f8f6] p-4"><input className="mt-0.5 h-4 w-4 accent-[#0f6b4f]" checked={restock} onChange={(event) => setRestock(event.target.checked)} type="checkbox" /><span><span className="block text-sm font-extrabold">Return items to inventory</span><span className="mt-1 block text-xs leading-5 text-[#7d8a83]">Turn this off for damaged, lost, or otherwise unsellable returns.</span></span></label><label className="mt-4 block text-xs font-bold"><span className="mb-1.5 block">Refund reason</span><textarea className="field min-h-20 resize-y text-sm" name="reason" placeholder="Customer return, wrong item, damaged delivery…" required /></label>{state.error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{state.error}</p>}{state.success && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">{state.success} Refunded {money(state.refundAmount ?? 0)}.</p>}<div className="mt-5 flex items-center justify-between border-t border-[#e6ebe8] pt-5"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#87928c]">Refund total</p><p className="mt-1 text-xl font-black">{money(total)}</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={() => setOpen(false)} type="button">Close</button><button className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={pending || !selected.length} type="submit"><RotateCcw size={15} />{pending ? "Processing…" : "Confirm refund"}</button></div></div></form></div></div>}
    </>
  );
}
