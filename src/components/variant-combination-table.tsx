"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

export type CombinationRow = {
  sku: string;
  barcode: string;
  cost_per_piece: number;
  piece_price: number;
  pieces_per_box: number;
  box_price: number;
  opening_boxes: number;
  opening_loose_pieces: number;
  low_stock_threshold: number;
  variant_attributes: { type: string; value: string }[];
};

type VariantType = { id: string; name: string; values: string[]; draft: string };

function skuFragment(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6) || "VAR";
}

function combinationKey(attributes: { type: string; value: string }[]) {
  return attributes.map((attr) => `${attr.type}:${attr.value}`).join("|");
}

function cartesianProduct(types: { name: string; values: string[] }[]) {
  return types.reduce<{ type: string; value: string }[][]>(
    (acc, type) => acc.flatMap((combo) => type.values.map((value) => [...combo, { type: type.name, value }])),
    [[]],
  );
}

export function VariantCombinationTable({
  baseSku,
  costPerPiece,
  piecePrice,
  piecesPerBox,
  boxPrice,
  openingBoxes,
  openingLoosePieces,
  lowStockThreshold,
  onChange,
}: {
  baseSku: string;
  costPerPiece: number;
  piecePrice: number;
  piecesPerBox: number;
  boxPrice: number;
  openingBoxes: number;
  openingLoosePieces: number;
  lowStockThreshold: number;
  onChange: (combinations: CombinationRow[]) => void;
}) {
  const nextTypeId = useRef(0);
  const [types, setTypes] = useState<VariantType[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<CombinationRow>>>({});

  const parsedTypes = useMemo(
    () => types.map((type) => ({ name: type.name.trim(), values: type.values })).filter((type) => type.name && type.values.length > 0),
    [types],
  );

  const combinations = useMemo<CombinationRow[]>(() => {
    if (parsedTypes.length === 0) {
      return [{
        sku: baseSku,
        barcode: "",
        cost_per_piece: costPerPiece,
        piece_price: piecePrice,
        pieces_per_box: piecesPerBox,
        box_price: boxPrice,
        opening_boxes: openingBoxes,
        opening_loose_pieces: openingLoosePieces,
        low_stock_threshold: lowStockThreshold,
        variant_attributes: [],
      }];
    }
    return cartesianProduct(parsedTypes).map((attributes) => {
      const key = combinationKey(attributes);
      const suggestedSku = `${baseSku}-${attributes.map((attr) => skuFragment(attr.value)).join("-")}`;
      const override = overrides[key] ?? {};
      return {
        sku: override.sku ?? suggestedSku,
        barcode: override.barcode ?? "",
        cost_per_piece: override.cost_per_piece ?? costPerPiece,
        piece_price: piecePrice,
        pieces_per_box: piecesPerBox,
        box_price: boxPrice,
        opening_boxes: override.opening_boxes ?? openingBoxes,
        opening_loose_pieces: override.opening_loose_pieces ?? openingLoosePieces,
        low_stock_threshold: override.low_stock_threshold ?? lowStockThreshold,
        variant_attributes: attributes,
      };
    });
  }, [parsedTypes, overrides, baseSku, costPerPiece, piecePrice, piecesPerBox, boxPrice, openingBoxes, openingLoosePieces, lowStockThreshold]);

  useEffect(() => {
    onChange(combinations);
  }, [combinations, onChange]);

  function addType() {
    const id = `type-${nextTypeId.current++}`;
    setTypes((current) => [...current, { id, name: "", values: [], draft: "" }]);
  }

  function updateTypeName(id: string, name: string) {
    setTypes((current) => current.map((type) => (type.id === id ? { ...type, name } : type)));
  }

  function removeType(id: string) {
    setTypes((current) => current.filter((type) => type.id !== id));
  }

  function commitValue(id: string, rawValue: string) {
    const value = rawValue.trim();
    setTypes((current) => current.map((type) => {
      if (type.id !== id) return type;
      if (!value || type.values.includes(value)) return { ...type, draft: "" };
      return { ...type, values: [...type.values, value], draft: "" };
    }));
  }

  function removeValue(id: string, index: number) {
    setTypes((current) => current.map((type) => (type.id === id ? { ...type, values: type.values.filter((_, i) => i !== index) } : type)));
  }

  function handleDraftChange(id: string, raw: string) {
    if (!raw.includes(",")) {
      setTypes((current) => current.map((type) => (type.id === id ? { ...type, draft: raw } : type)));
      return;
    }
    const parts = raw.split(",");
    const draft = parts.pop() ?? "";
    setTypes((current) => current.map((type) => {
      if (type.id !== id) return type;
      const values = [...type.values];
      for (const part of parts) {
        const value = part.trim();
        if (value && !values.includes(value)) values.push(value);
      }
      return { ...type, values, draft };
    }));
  }

  function handleDraftKeyDown(id: string, type: VariantType, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitValue(id, type.draft);
    } else if (event.key === "Backspace" && !type.draft && type.values.length > 0) {
      removeValue(id, type.values.length - 1);
    }
  }

  function updateOverride(key: string, patch: Partial<CombinationRow>) {
    setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  return (
    <section className="mt-7 min-w-0 border-t border-[#edf0ee] pt-6">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Variant types (optional)</p>
        <button className="btn-secondary px-3 py-1.5 text-xs" onClick={addType} type="button"><Plus size={14} />Add type</button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#849089]">Add a type like Color or Size, then type an option and press Enter (or paste a comma-separated list). Combinations are generated automatically below.</p>

      {types.length > 0 && (
        <div className="mt-4 space-y-2">
          {types.map((type) => (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center" key={type.id}>
              <div className="sm:w-40 sm:flex-none">
                <input className="field text-sm" placeholder="Type, e.g. Color" value={type.name} onChange={(event) => updateTypeName(type.id, event.target.value)} />
              </div>
              <div className="field flex flex-wrap items-center gap-1.5 sm:flex-1">
                {type.values.map((value, index) => (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4f1] px-2.5 py-1 text-xs font-semibold text-[#2f4a3e]" key={`${value}-${index}`}>
                    {value}
                    <button aria-label={`Remove option ${value}`} className="text-[#7d8a83] hover:text-red-600" onClick={() => removeValue(type.id, index)} type="button"><X size={11} /></button>
                  </span>
                ))}
                <input
                  className="min-w-[90px] flex-1 border-0 bg-transparent p-0 text-sm outline-none"
                  onBlur={() => commitValue(type.id, type.draft)}
                  onChange={(event) => handleDraftChange(type.id, event.target.value)}
                  onKeyDown={(event) => handleDraftKeyDown(type.id, type, event)}
                  placeholder={type.values.length === 0 ? "Options, e.g. Black, White, Blue" : "Add option…"}
                  value={type.draft}
                />
              </div>
              <button aria-label="Remove type" className="grid h-10 w-10 shrink-0 place-items-center self-end rounded-xl text-[#a1aaa5] hover:bg-[#f2f5f3] hover:text-red-600 sm:self-auto" onClick={() => removeType(type.id)} type="button"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {parsedTypes.length > 0 && (
        <div className="mt-5">
          <div className="space-y-3 sm:hidden">
            {combinations.map((combo) => {
              const key = combinationKey(combo.variant_attributes);
              return (
                <div className="rounded-xl border border-[#e6ebe8] p-3" key={key}>
                  <p className="text-xs font-extrabold">{combo.variant_attributes.map((attr) => attr.value).join(" / ")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <CardField label="SKU" onChange={(value) => updateOverride(key, { sku: value })} value={combo.sku} />
                    <CardField label="Barcode" onChange={(value) => updateOverride(key, { barcode: value })} value={combo.barcode} />
                    <CardField label="Cost/piece" min="0" onChange={(value) => updateOverride(key, { cost_per_piece: Number(value) })} step="0.01" type="number" value={combo.cost_per_piece} />
                    <CardField label="Low-stock at" min="0" onChange={(value) => updateOverride(key, { low_stock_threshold: Number(value) })} step="1" type="number" value={combo.low_stock_threshold} />
                    <CardField label="Boxes" min="0" onChange={(value) => updateOverride(key, { opening_boxes: Number(value) })} step="1" type="number" value={combo.opening_boxes} />
                    <CardField label="Loose pcs" min="0" onChange={(value) => updateOverride(key, { opening_loose_pieces: Number(value) })} step="1" type="number" value={combo.opening_loose_pieces} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-[#e6ebe8] sm:block">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#87928c]">
                  <th className="min-w-[120px] px-3 py-2.5">Combination</th>
                  <th className="min-w-[155px] px-3 py-2.5">SKU</th>
                  <th className="min-w-[95px] px-3 py-2.5">Barcode</th>
                  <th className="min-w-[85px] px-3 py-2.5">Cost/piece</th>
                  <th className="min-w-[60px] px-3 py-2.5">Boxes</th>
                  <th className="min-w-[70px] px-3 py-2.5">Loose pcs</th>
                  <th className="min-w-[70px] px-3 py-2.5">Low-stock</th>
                </tr>
              </thead>
              <tbody>
                {combinations.map((combo) => {
                  const key = combinationKey(combo.variant_attributes);
                  return (
                    <tr className="border-b border-[#edf0ee] last:border-0" key={key}>
                      <td className="px-3 py-2 text-xs font-bold">{combo.variant_attributes.map((attr) => attr.value).join(" / ")}</td>
                      <td className="px-3 py-2"><input className="field py-1.5 text-xs" onChange={(event) => updateOverride(key, { sku: event.target.value })} title={combo.sku} value={combo.sku} /></td>
                      <td className="px-3 py-2"><input className="field py-1.5 text-xs" onChange={(event) => updateOverride(key, { barcode: event.target.value })} title={combo.barcode} value={combo.barcode} /></td>
                      <td className="px-3 py-2"><input className="field py-1.5 text-xs" min="0" onChange={(event) => updateOverride(key, { cost_per_piece: Number(event.target.value) })} step="0.01" type="number" value={combo.cost_per_piece} /></td>
                      <td className="px-3 py-2"><input className="field py-1.5 text-xs" min="0" onChange={(event) => updateOverride(key, { opening_boxes: Number(event.target.value) })} step="1" type="number" value={combo.opening_boxes} /></td>
                      <td className="px-3 py-2"><input className="field py-1.5 text-xs" min="0" onChange={(event) => updateOverride(key, { opening_loose_pieces: Number(event.target.value) })} step="1" type="number" value={combo.opening_loose_pieces} /></td>
                      <td className="px-3 py-2"><input className="field py-1.5 text-xs" min="0" onChange={(event) => updateOverride(key, { low_stock_threshold: Number(event.target.value) })} step="1" type="number" value={combo.low_stock_threshold} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function CardField({ label, value, onChange, type = "text", min, step }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; min?: string; step?: string }) {
  return (
    <label className="block text-[11px] font-bold text-[#5c6a63]">
      <span className="mb-1 block">{label}</span>
      <input className="field py-1.5 text-xs" min={min} onChange={(event) => onChange(event.target.value)} step={step} title={String(value)} type={type} value={value} />
    </label>
  );
}
