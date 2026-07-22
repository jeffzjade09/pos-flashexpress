"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boxes, PackagePlus, Tag, X } from "lucide-react";
import { createProduct, type ProductActionState } from "@/app/dashboard/inventory/actions";

const initialState: ProductActionState = {};

export function AddProductForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createProduct, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    const timer = window.setTimeout(() => setOpen(false), 900);
    return () => window.clearTimeout(timer);
  }, [state.success]);

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} type="button">
        <PackagePlus size={17} />Add product
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="my-5 w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#e7ece9] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#0f6b4f]"><PackagePlus size={20} /></span>
                <div><h2 className="text-xl font-black">Add a product</h2><p className="mt-0.5 text-xs text-[#7b8781]">Set the piece, box, and opening-stock details.</p></div>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-[#7d8882] hover:bg-[#f2f5f3]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={19} /></button>
            </div>

            <form ref={formRef} action={action} className="max-h-[75vh] overflow-y-auto p-6">
              <section>
                <p className="eyebrow">Product details</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Product name" name="name" placeholder="e.g. KitKat 4 Finger" required />
                  <Field label="Variant (optional)" name="variant" placeholder="e.g. Milk Chocolate 50g" />
                  <Field label="SKU" name="sku" placeholder="e.g. KITKAT-4F" required />
                  <Field label="Category" name="category" placeholder="e.g. Chocolates" />
                  <Field label="Barcode (optional)" name="barcode" placeholder="Scan or enter barcode" />
                </div>
              </section>

              <section className="mt-7 border-t border-[#edf0ee] pt-6">
                <div className="flex items-center gap-2"><Tag size={16} className="text-[#0f6b4f]" /><p className="eyebrow">Pricing & packaging</p></div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Cost per piece" name="costPerPiece" type="number" min="0" step="0.01" prefix="₱" defaultValue="0" required />
                  <Field label="Piece selling price" name="piecePrice" type="number" min="0" step="0.01" prefix="₱" defaultValue="0" required />
                  <Field label="Pieces per box" name="piecesPerBox" type="number" min="1" step="1" defaultValue="1" required />
                  <Field label="Box selling price" name="boxPrice" type="number" min="0" step="0.01" prefix="₱" defaultValue="0" required />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#849089]">If this product is not sold by box, leave pieces per box at 1. The box option will not be created.</p>
              </section>

              <section className="mt-7 border-t border-[#edf0ee] pt-6">
                <div className="flex items-center gap-2"><Boxes size={16} className="text-[#0f6b4f]" /><p className="eyebrow">Opening inventory</p></div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Number of boxes" name="openingBoxes" type="number" min="0" step="1" defaultValue="0" required />
                  <Field label="Loose pieces" name="openingLoosePieces" type="number" min="0" step="1" defaultValue="0" required />
                  <Field label="Low-stock alert at" name="lowStockThreshold" type="number" min="0" step="1" defaultValue="5" required />
                </div>
              </section>

              {state.error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
              {state.success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">{state.success}</p>}

              <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex justify-end gap-2 border-t border-[#e8ece9] bg-white px-6 py-4">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn-primary min-w-32" disabled={pending} type="submit">{pending ? "Adding…" : "Add product"}</button>
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
  defaultValue?: string;
  required?: boolean;
};

function Field({ label, name, placeholder, type = "text", min, step, prefix, defaultValue, required }: FieldProps) {
  return (
    <label className="block text-xs font-bold text-[#34453d]">
      <span className="mb-1.5 block">{label}</span>
      <span className="relative block">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#849089]">{prefix}</span>}
        <input className={`field text-sm ${prefix ? "with-currency-prefix" : ""}`} name={name} type={type} min={min} step={step} placeholder={placeholder} defaultValue={defaultValue} required={required} />
      </span>
    </label>
  );
}
