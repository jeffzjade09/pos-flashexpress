"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, PackageCheck, X } from "lucide-react";
import { classifyReturnedUnits, type ClassifyState } from "@/app/dashboard/returns/actions";

const initialState: ClassifyState = {};

export function ClassifyReturnButton({ saleItemId, productName, remaining }: { saleItemId: string; productName: string; remaining: number }) {
  const [open, setOpen] = useState(false);
  const [classification, setClassification] = useState<"good" | "bad">("good");
  const [quantity, setQuantity] = useState(String(remaining));
  const [state, action, pending] = useActionState(classifyReturnedUnits, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) return;
    const timer = window.setTimeout(() => {
      formRef.current?.reset();
      setClassification("good");
      setQuantity(String(remaining));
      setOpen(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state.success, remaining]);

  if (remaining <= 0) return null;

  return (
    <>
      <button className="btn-secondary py-2 text-xs" onClick={() => setOpen(true)} type="button"><PackageCheck size={14} />Classify</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="my-5 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#e6ebe8] px-6 py-5">
              <div><p className="eyebrow">Inspect return</p><h2 className="mt-1 text-lg font-black">{productName}</h2><p className="mt-0.5 text-xs text-[#829088]">{remaining} unit(s) remaining to inspect</p></div>
              <button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f1f4f2]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={18} /></button>
            </div>
            <form ref={formRef} action={action} className="p-6">
              <input name="saleItemId" type="hidden" value={saleItemId} />
              <input name="classification" type="hidden" value={classification} />

              <div className="grid grid-cols-2 gap-2">
                <button className={`rounded-lg border px-3 py-2.5 text-sm font-extrabold ${classification === "good" ? "border-[#0f6b4f] bg-[#eef7f3] text-[#0f6b4f] ring-1 ring-[#0f6b4f]" : "border-[#dce4df] text-[#748078]"}`} onClick={() => setClassification("good")} type="button">Good</button>
                <button className={`rounded-lg border px-3 py-2.5 text-sm font-extrabold ${classification === "bad" ? "border-red-600 bg-red-50 text-red-700 ring-1 ring-red-600" : "border-[#dce4df] text-[#748078]"}`} onClick={() => setClassification("bad")} type="button">Bad</button>
              </div>

              <label className="mt-4 block text-xs font-bold text-[#34453d]">
                <span className="mb-1.5 block">Quantity</span>
                <input className="field text-sm" max={remaining} min="1" name="quantity" onChange={(event) => setQuantity(event.target.value)} type="number" value={quantity} />
              </label>

              <label className="mt-4 block text-xs font-bold text-[#34453d]">
                <span className="mb-1.5 block">Reason</span>
                <textarea className="field min-h-20 resize-y text-sm" name="reason" placeholder={classification === "good" ? "e.g. Unopened, unused, resellable as-is" : "e.g. Cracked casing, missing accessories"} required />
              </label>

              {classification === "bad" && (
                <label className="mt-4 block text-xs font-bold text-[#34453d]">
                  <span className="mb-1.5 block">Photo evidence</span>
                  <input accept="image/*" className="field text-sm" multiple name="photos" required type="file" />
                  <span className="mt-1.5 block text-[11px] font-normal leading-4 text-[#89948e]">At least one photo is required for a bad classification.</span>
                </label>
              )}

              {state.error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
              {state.success && <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status"><CheckCircle2 size={16} />{state.success}</p>}

              <div className="mt-5 flex justify-end gap-2 border-t border-[#e6ebe8] pt-5">
                <button className="btn-secondary" onClick={() => setOpen(false)} type="button">Close</button>
                <button className="btn-primary min-w-32" disabled={pending} type="submit">{pending ? "Saving…" : "Save classification"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
