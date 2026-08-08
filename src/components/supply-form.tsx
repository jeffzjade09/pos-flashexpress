"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PackagePlus, Pencil, Save, X } from "lucide-react";
import { createSupply, updateSupply, type SupplyActionState } from "@/app/dashboard/supplies/actions";

const initialState: SupplyActionState = {};

export type EditableSupply = {
  id: string;
  name: string;
  description: string;
  qty: number;
  price: number;
  lowStockThreshold: number;
};

type SupplyFormProps = { mode: "create" } | { mode: "edit"; supply: EditableSupply };

export function SupplyForm(props: SupplyFormProps) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(props.mode === "create" ? createSupply : updateSupply, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    const timer = window.setTimeout(() => setOpen(false), 900);
    return () => window.clearTimeout(timer);
  }, [state.success]);

  const supply = props.mode === "edit" ? props.supply : undefined;

  return (
    <>
      {props.mode === "create" ? (
        <button className="btn-primary" onClick={() => setOpen(true)} type="button">
          <PackagePlus size={17} />Add Supply
        </button>
      ) : (
        <button className="btn-secondary px-3 py-2 text-xs" onClick={() => setOpen(true)} type="button" title="Edit supply">
          <Pencil size={14} />Edit
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="my-5 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#e7ece9] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#0f6b4f]">{props.mode === "create" ? <PackagePlus size={20} /> : <Pencil size={19} />}</span>
                <div><h2 className="text-xl font-black">{props.mode === "create" ? "Add a supply" : "Edit supply"}</h2><p className="mt-0.5 text-xs text-[#7b8781]">Packaging supplies used for orders.</p></div>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-[#7d8882] hover:bg-[#f2f5f3]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={19} /></button>
            </div>

            <form ref={formRef} action={action} className="max-h-[75vh] overflow-y-auto p-6">
              {supply && <input name="supplyId" type="hidden" value={supply.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field defaultValue={supply?.name} label="Name" name="name" placeholder="e.g. Carton Box (Medium)" required />
                <Field defaultValue={supply?.description} label="Description (optional)" name="description" placeholder="e.g. 12x12x12 inches" />
                <Field defaultValue={supply?.qty ?? 0} label="Quantity" min="0" name="qty" required step="1" type="number" />
                <Field defaultValue={supply?.price ?? 0} label="Price" min="0" name="price" prefix="₱" required step="0.01" type="number" />
                <Field defaultValue={supply?.lowStockThreshold ?? 10} label="Low-stock alert at" min="0" name="lowStockThreshold" required step="1" type="number" />
              </div>

              {state.error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
              {state.success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">{state.success}</p>}

              <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex justify-end gap-2 border-t border-[#e8ece9] bg-white px-6 py-4">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn-primary min-w-32" disabled={pending} type="submit"><Save size={15} />{pending ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

type FieldProps = {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  prefix?: string;
  defaultValue?: string | number;
  required?: boolean;
};

function Field({ label, name, placeholder, type = "text", min, step, prefix, defaultValue, required }: FieldProps) {
  return (
    <label className="block text-xs font-bold text-[#34453d]">
      <span className="mb-1.5 block">{label}</span>
      <span className="relative block">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#849089]">{prefix}</span>}
        <input className={`field text-sm ${prefix ? "with-currency-prefix" : ""}`} defaultValue={defaultValue} min={min} name={name} placeholder={placeholder} required={required} step={step} type={type} />
      </span>
    </label>
  );
}
