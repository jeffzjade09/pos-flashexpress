"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { PackagePlus, Plus, X } from "lucide-react";
import { approveReorderPurchase, type PurchaseState } from "@/app/dashboard/purchases/actions";
import type { ReorderSuggestion } from "@/lib/reorder-suggestions";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; sku: string; stockOnHand: number };
type DraftLine = { productId: string; productLabel: string; currentStock: number; quantityPieces: number; reason: string };

const initial: PurchaseState = {};

function toLine(suggestion: ReorderSuggestion): DraftLine {
  const label = suggestion.variantLabel ? `${suggestion.productName} — ${suggestion.variantLabel}` : suggestion.productName;
  return { productId: suggestion.productId, productLabel: label, currentStock: suggestion.currentStock, quantityPieces: suggestion.suggestedQty, reason: suggestion.reason };
}

export function ReorderReviewForm({ suggestions, suppliers, products }: { suggestions: ReorderSuggestion[]; suppliers: Supplier[]; products: Product[] }) {
  const [lines, setLines] = useState<DraftLine[]>(() => suggestions.map(toLine));
  const [selected, setSelected] = useState(products[0]?.id ?? "");
  const [state, action, pending] = useActionState(approveReorderPurchase, initial);

  function addManualLine() {
    const product = products.find((item) => item.id === selected);
    if (!product || lines.some((line) => line.productId === product.id)) return;
    setLines((current) => [...current, { productId: product.id, productLabel: product.name, currentStock: product.stockOnHand, quantityPieces: 1, reason: "Added manually" }]);
  }

  function updateQty(productId: string, quantity: number) {
    setLines((current) => current.map((line) => (line.productId === productId ? { ...line, quantityPieces: Math.max(1, quantity) } : line)));
  }

  function removeLine(productId: string) {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }

  const payload = lines.map((line) => ({ product_id: line.productId, quantity_pieces: line.quantityPieces }));

  return (
    <form action={action} className="mt-7">
      <input name="items" type="hidden" value={JSON.stringify(payload)} />

      <div className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold">
            <span className="mb-1.5 block">Supplier</span>
            <select className="field text-sm" name="supplierId" required>
              <option value="">Choose supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            <span className="mb-1.5 block">Supplier reference (optional)</span>
            <input className="field text-sm" name="supplierReference" />
          </label>
        </div>
        <p className="mt-3 text-xs text-[#87928c]">Every product below will go on one purchase order for the supplier you choose — keep only products you&rsquo;re ordering from them, and remove the rest.</p>
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="border-b border-[#e5eae7] px-5 py-4">
          <h2 className="font-extrabold">Products to reorder</h2>
          <p className="mt-1 text-xs text-[#819087]">{lines.length} product{lines.length === 1 ? "" : "s"} in this order</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#87928c]">
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3 text-right">Current stock</th>
                <th className="px-5 py-3 text-right">Suggested qty</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3 text-right">Remove</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr className="border-b border-[#edf0ee] last:border-0" key={line.productId}>
                  <td className="px-5 py-3 text-sm font-extrabold">{line.productLabel}</td>
                  <td className="px-5 py-3 text-right text-sm text-[#66736d]">{line.currentStock}</td>
                  <td className="px-5 py-3 text-right">
                    <input className="field ml-auto w-24 text-right text-sm" min="1" onChange={(event) => updateQty(line.productId, Number(event.target.value) || 1)} type="number" value={line.quantityPieces} />
                  </td>
                  <td className="px-5 py-3 text-xs text-[#7d8a83]">{line.reason}</td>
                  <td className="px-5 py-3 text-right">
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-[#87928c] hover:bg-red-50 hover:text-red-600" onClick={() => removeLine(line.productId)} type="button">
                      <X size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!lines.length && (
                <tr>
                  <td className="py-16 text-center text-sm text-[#87928c]" colSpan={5}>No products need reordering right now.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-[#e5eae7] p-4 sm:flex-row">
          <select className="field text-sm" onChange={(event) => setSelected(event.target.value)} value={selected}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>
            ))}
          </select>
          <button className="btn-secondary shrink-0" onClick={addManualLine} type="button">
            <Plus size={15} />Add product manually
          </button>
        </div>
      </div>

      <label className="mt-5 block text-xs font-bold">
        <span className="mb-1.5 block">Notes (optional)</span>
        <textarea className="field min-h-16 text-sm" name="notes" />
      </label>

      {state.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Link className="btn-secondary" href="/dashboard/purchases">Cancel</Link>
        <button className="btn-primary" disabled={pending || !lines.length} type="submit">
          <PackagePlus size={16} />{pending ? "Creating…" : "Approve & create PO"}
        </button>
      </div>
    </form>
  );
}
