"use client";

import { useActionState, useEffect, useState } from "react";
import { Boxes, ChevronDown, Pencil, Plus, Save, Tag, X } from "lucide-react";
import { addProductVariant, renameProductFamily, updateProduct, type ProductActionState } from "@/app/dashboard/inventory/actions";
import { VariantCombinationTable, type CombinationRow } from "@/components/variant-combination-table";

const initialState: ProductActionState = {};

export type EditableProduct = {
  id: string;
  familyId: string;
  name: string;
  variantAttributes: { type: string; value: string }[];
  sku: string;
  category: string;
  barcode: string;
  costPerPiece: number;
  piecePrice: number;
  piecesPerBox: number;
  boxPrice: number;
  lowStockThreshold: number;
};

export function EditProductForm({ product }: { product: EditableProduct }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateProduct, initialState);
  const [renameState, renameAction, renamePending] = useActionState(renameProductFamily, initialState);
  const [attributeValues, setAttributeValues] = useState<string[]>(product.variantAttributes.map((attr) => attr.value));
  const [name, setName] = useState(product.name);
  const [addingVariant, setAddingVariant] = useState(false);
  const [newCombinations, setNewCombinations] = useState<CombinationRow[]>([]);
  const [savingVariants, setSavingVariants] = useState(false);
  const [addVariantError, setAddVariantError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.success) return;
    const timer = window.setTimeout(() => setOpen(false), 900);
    return () => window.clearTimeout(timer);
  }, [state.success]);

  const variantAttributesJson = JSON.stringify(
    product.variantAttributes.map((attr, index) => ({ type: attr.type, value: attributeValues[index] ?? attr.value })),
  );

  async function saveNewVariants() {
    const toAdd = newCombinations.filter((combo) => combo.variant_attributes.length > 0);
    if (!toAdd.length) {
      setAddVariantError("Add at least one variant type and option first.");
      return;
    }
    setSavingVariants(true);
    setAddVariantError(null);
    for (const combo of toAdd) {
      const formData = new FormData();
      formData.set("familyId", product.familyId);
      formData.set("combination", JSON.stringify(combo));
      const result = await addProductVariant(initialState, formData);
      if (result.error) {
        setAddVariantError(result.error);
        setSavingVariants(false);
        return;
      }
    }
    setSavingVariants(false);
    setAddingVariant(false);
    setNewCombinations([]);
  }

  return (
    <>
      <button className="btn-secondary px-3 py-2 text-xs" onClick={() => setOpen(true)} type="button" title="Edit product details">
        <Pencil size={14} />Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="my-5 w-full min-w-0 max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#e7ece9] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#0f6b4f]"><Pencil size={19} /></span>
                <div><h2 className="text-xl font-black">Edit product</h2><p className="mt-0.5 text-xs text-[#7b8781]">Update identity, pricing, packaging, and stock-alert settings.</p></div>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-[#7d8882] hover:bg-[#f2f5f3]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={19} /></button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-6">
              <form action={renameAction} className="flex items-end gap-2">
                <input name="familyId" type="hidden" value={product.familyId} />
                <label className="block flex-1 text-xs font-bold text-[#34453d]">
                  <span className="mb-1.5 block">Product name</span>
                  <input className="field text-sm" name="name" value={name} onChange={(event) => setName(event.target.value)} required />
                </label>
                <button className="btn-secondary shrink-0 px-3 py-2.5 text-xs" disabled={renamePending || name.trim() === product.name} type="submit">{renamePending ? "Saving…" : "Rename"}</button>
              </form>
              {renameState.error && <p className="mt-2 text-xs font-medium text-red-700">{renameState.error}</p>}
              <p className="mt-1.5 text-[11px] leading-4 text-[#89948e]">Renaming applies to every variant combination of this product.</p>

              <form action={action} className="mt-6">
                <input name="productId" type="hidden" value={product.id} />
                <input name="variantAttributes" type="hidden" value={variantAttributesJson} />

                <section className="border-t border-[#edf0ee] pt-6">
                  <p className="eyebrow">Product details</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="SKU" name="sku" defaultValue={product.sku} required />
                    <Field label="Category" name="category" defaultValue={product.category} placeholder="e.g. Chocolates" />
                    <Field label="Barcode (optional)" name="barcode" defaultValue={product.barcode} placeholder="Scan or enter barcode" />
                  </div>
                  {product.variantAttributes.length > 0 && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {product.variantAttributes.map((attr, index) => (
                        <label className="block text-xs font-bold text-[#34453d]" key={attr.type}>
                          <span className="mb-1.5 block">{attr.type}</span>
                          <input
                            className="field text-sm"
                            value={attributeValues[index] ?? ""}
                            onChange={(event) => setAttributeValues((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                            required
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </section>

                <section className="mt-7 border-t border-[#edf0ee] pt-6">
                  <div className="flex items-center gap-2"><Tag size={16} className="text-[#0f6b4f]" /><p className="eyebrow">Pricing & packaging</p></div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Cost per piece" name="costPerPiece" type="number" min="0" step="0.01" prefix="₱" defaultValue={product.costPerPiece} required />
                    <Field label="Piece selling price" name="piecePrice" type="number" min="0" step="0.01" prefix="₱" defaultValue={product.piecePrice} required />
                    <Field label="Pieces per box" name="piecesPerBox" type="number" min="1" step="1" defaultValue={product.piecesPerBox} required />
                    <Field label="Box selling price" name="boxPrice" type="number" min="0" step="0.01" prefix="₱" defaultValue={product.boxPrice} required />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#849089]">Set pieces per box to 1 to disable box sales. Historical receipts keep their original unit and price.</p>
                </section>

                <section className="mt-7 border-t border-[#edf0ee] pt-6">
                  <div className="flex items-center gap-2"><Boxes size={16} className="text-[#0f6b4f]" /><p className="eyebrow">Inventory controls</p></div>
                  <div className="mt-4 max-w-xs">
                    <Field label="Low-stock alert at" name="lowStockThreshold" type="number" min="0" step="1" defaultValue={product.lowStockThreshold} required />
                  </div>
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    This form does not change the on-hand quantity. Use <strong>Adjust stock</strong> so every quantity correction remains in the activity log.
                  </div>
                </section>

                {state.error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
                {state.success && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">{state.success}</p>}

                <div className="mt-6 flex justify-end gap-2 border-t border-[#e8ece9] pt-4">
                  <button className="btn-primary min-w-36" disabled={pending} type="submit"><Save size={15} />{pending ? "Saving…" : "Save changes"}</button>
                </div>
              </form>

              <section className="mt-7 border-t border-[#edf0ee] pt-6">
                <button className="flex items-center gap-2 text-xs font-extrabold text-[#0f6b4f]" onClick={() => setAddingVariant((current) => !current)} type="button">
                  <Plus size={14} />Add another variant to this product
                  <ChevronDown size={14} className={addingVariant ? "rotate-180 transition" : "transition"} />
                </button>
                {addingVariant && (
                  <div className="mt-3">
                    <VariantCombinationTable
                      baseSku={product.sku}
                      costPerPiece={product.costPerPiece}
                      piecePrice={product.piecePrice}
                      piecesPerBox={product.piecesPerBox}
                      boxPrice={product.boxPrice}
                      openingBoxes={0}
                      openingLoosePieces={0}
                      lowStockThreshold={product.lowStockThreshold}
                      onChange={setNewCombinations}
                    />
                    {addVariantError && <p className="mt-3 text-xs font-medium text-red-700">{addVariantError}</p>}
                    <div className="mt-4 flex justify-end">
                      <button className="btn-primary px-4 py-2 text-xs" disabled={savingVariants} onClick={saveNewVariants} type="button">{savingVariants ? "Saving…" : "Save new variants"}</button>
                    </div>
                  </div>
                )}
              </section>
            </div>
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
        <input className={`field text-sm ${prefix ? "with-currency-prefix" : ""}`} name={name} type={type} min={min} step={step} placeholder={placeholder} defaultValue={defaultValue} required={required} />
      </span>
    </label>
  );
}
