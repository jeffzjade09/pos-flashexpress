"use client";

import { useState } from "react";
import { ChevronRight, Package2 } from "lucide-react";

export function InventoryFamilyGroup({
  familyName,
  categoryName,
  combinationCount,
  totalStock,
  totalValue,
  children,
}: {
  familyName: string;
  categoryName: string;
  combinationCount: number;
  totalStock: number;
  totalValue: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-b border-[#edf0ee] bg-[#fafcfa] hover:bg-[#f4f8f6]">
        <td className="px-5 py-3.5" colSpan={8}>
          <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((current) => !current)} type="button">
            <ChevronRight size={15} className={`shrink-0 text-[#89948e] transition ${open ? "rotate-90" : ""}`} />
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf5f1] text-[#0f6b4f]"><Package2 size={15} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">{familyName}</span>
              <span className="block text-xs text-[#7d8a83]">{categoryName} · {combinationCount} variants</span>
            </span>
            <span className="shrink-0 text-right text-xs font-bold text-[#64736b]">{totalStock} pcs on hand · {totalValue}</span>
          </button>
        </td>
      </tr>
      {open && children}
    </>
  );
}
