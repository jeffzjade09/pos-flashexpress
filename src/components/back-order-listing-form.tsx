"use client";

import { useActionState } from "react";
import { updateBackOrderListing, type ListingState } from "@/app/dashboard/back-orders/actions";

const initialState: ListingState = {};

export function BackOrderListingForm({ productId, resalePrice, conditionNotes }: { productId: string; resalePrice: number | null; conditionNotes: string | null }) {
  const [state, action, pending] = useActionState(updateBackOrderListing, initialState);

  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-end">
      <input name="productId" type="hidden" value={productId} />
      <label className="block text-xs font-bold text-[#34453d]">
        <span className="mb-1 block">Resale price</span>
        <span className="relative block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#849089]">₱</span>
          <input className="field with-currency-prefix text-sm" defaultValue={resalePrice ?? ""} min="0" name="resalePrice" placeholder="0.00" step="0.01" type="number" />
        </span>
      </label>
      <label className="block text-xs font-bold text-[#34453d]">
        <span className="mb-1 block">Condition notes</span>
        <input className="field text-sm" defaultValue={conditionNotes ?? ""} name="conditionNotes" placeholder="e.g. Minor scuff, resell at a discount" />
      </label>
      <button className="btn-secondary py-2.5 text-xs" disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
      {state.error && <p className="text-xs font-medium text-red-700 sm:col-span-3">{state.error}</p>}
      {state.success && <p className="text-xs font-medium text-emerald-700 sm:col-span-3">{state.success}</p>}
    </form>
  );
}
