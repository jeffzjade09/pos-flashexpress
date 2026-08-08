"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Boxes, PackagePlus, Tag, X } from "lucide-react";
import { createProductFamily, type ProductActionState } from "@/app/dashboard/inventory/actions";
import { VariantCombinationTable, type CombinationRow } from "@/components/variant-combination-table";

const initialState: ProductActionState = {};

export function CreateProductFamilyForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createProductFamily, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [costPerPiece, setCostPerPiece] = useState(0);
  const [piecePrice, setPiecePrice] = useState(0);
  const [piecesPerBox, setPiecesPerBox] = useState(1);
  const [boxPrice, setBoxPrice] = useState(0);
  const [openingBoxes, setOpeningBoxes] = useState(0);
  const [openingLoosePieces, setOpeningLoosePieces] = useState(0);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [combinations, setCombinations] = useState<CombinationRow[]>([]);

  useEffect(() => {
    if (!state.success) return;
    const timer = window.setTimeout(() => {
      formRef.current?.reset();
      setName("");
      setSku("");
      setCostPerPiece(0);
      setPiecePrice(0);
      setPiecesPerBox(1);
      setBoxPrice(0);
      setOpeningBoxes(0);
      setOpeningLoosePieces(0);
      setLowStockThreshold(5);
      setCombinations([]);
      setOpen(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state.success]);

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)} type="button">
        <PackagePlus size={17} />Add product
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="my-5 w-full min-w-0 max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#e7ece9] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#0f6b4f]"><PackagePlus size={20} /></span>
                <div><h2 className="text-xl font-black">Add a product</h2><p className="mt-0.5 text-xs text-[#7b8781]">Define variant types like Color or Size to generate combinations automatically.</p></div>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-[#7d8882] hover:bg-[#f2f5f3]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={19} /></button>
            </div>

            <form ref={formRef} action={action} className="max-h-[75vh] overflow-y-auto p-6">
              <input name="familyName" type="hidden" value={name} />
              <input name="combinations" type="hidden" value={JSON.stringify(combinations)} />

              <section>
                <p className="eyebrow">Product details</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TextInput label="Product name" value={name} onChange={setName} placeholder="e.g. KitKat 4 Finger" required />
                  <TextInput label="Base SKU" value={sku} onChange={setSku} placeholder="e.g. KITKAT-4F" required />
                  <label className="block text-xs font-bold text-[#34453d] sm:col-span-2">
                    <span className="mb-1.5 block">Category</span>
                    <input className="field text-sm" name="category" placeholder="e.g. Chocolates" />
                  </label>
                </div>
              </section>

              <section className="mt-7 border-t border-[#edf0ee] pt-6">
                <div className="flex items-center gap-2"><Tag size={16} className="text-[#0f6b4f]" /><p className="eyebrow">Pricing & packaging</p></div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <NumberInput label="Cost per piece" value={costPerPiece} onChange={setCostPerPiece} prefix="₱" min="0" step="0.01" required />
                  <NumberInput label="Piece selling price" value={piecePrice} onChange={setPiecePrice} prefix="₱" min="0" step="0.01" required />
                  <NumberInput label="Pieces per box" value={piecesPerBox} onChange={setPiecesPerBox} min="1" step="1" required />
                  <NumberInput label="Box selling price" value={boxPrice} onChange={setBoxPrice} prefix="₱" min="0" step="0.01" required />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#849089]">If this product is not sold by box, leave pieces per box at 1. The box option will not be created. Selling price and packaging apply to every variant combination below.</p>
              </section>

              <section className="mt-7 border-t border-[#edf0ee] pt-6">
                <div className="flex items-center gap-2"><Boxes size={16} className="text-[#0f6b4f]" /><p className="eyebrow">Opening inventory & stock alert</p></div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <NumberInput label="Number of boxes" value={openingBoxes} onChange={setOpeningBoxes} min="0" step="1" required />
                  <NumberInput label="Loose pieces" value={openingLoosePieces} onChange={setOpeningLoosePieces} min="0" step="1" required />
                  <NumberInput label="Low-stock alert at" value={lowStockThreshold} onChange={setLowStockThreshold} min="0" step="1" required />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#849089]">These are the defaults for every combination below — override any of them per row.</p>
              </section>

              <VariantCombinationTable
                baseSku={sku.trim().toUpperCase() || "SKU"}
                costPerPiece={costPerPiece}
                piecePrice={piecePrice}
                piecesPerBox={piecesPerBox}
                boxPrice={boxPrice}
                openingBoxes={openingBoxes}
                openingLoosePieces={openingLoosePieces}
                lowStockThreshold={lowStockThreshold}
                onChange={setCombinations}
              />

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

function TextInput({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="block text-xs font-bold text-[#34453d]">
      <span className="mb-1.5 block">{label}</span>
      <input className="field text-sm" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
    </label>
  );
}

function NumberInput({ label, value, onChange, prefix, min, step, required }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; min?: string; step?: string; required?: boolean }) {
  return (
    <label className="block text-xs font-bold text-[#34453d]">
      <span className="mb-1.5 block">{label}</span>
      <span className="relative block">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#849089]">{prefix}</span>}
        <input className={`field text-sm ${prefix ? "with-currency-prefix" : ""}`} type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} required={required} />
      </span>
    </label>
  );
}
