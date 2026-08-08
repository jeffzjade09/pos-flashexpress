"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, PackageX, Search } from "lucide-react";
import { DeleteSupplyButton } from "@/components/delete-supply-button";
import { SupplyForm } from "@/components/supply-form";

export type SupplyRow = {
  id: string;
  name: string;
  description: string | null;
  qty: number;
  price: number;
  lowStockThreshold: number;
};

type Status = "in" | "low" | "out";
type SortField = "name" | "qty" | "price" | "value";

const statusFilters: { value: "all" | Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in", label: "In Stock" },
  { value: "low", label: "Low Stock" },
  { value: "out", label: "Out of Stock" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

function statusOf(supply: SupplyRow): Status {
  if (supply.qty === 0) return "out";
  if (supply.qty <= supply.lowStockThreshold) return "low";
  return "in";
}

function statusBadge(status: Status) {
  if (status === "out") return { label: "OUT OF STOCK", className: "bg-red-50 text-red-600" };
  if (status === "low") return { label: "LOW STOCK", className: "bg-amber-50 text-amber-700" };
  return { label: "IN STOCK", className: "bg-emerald-50 text-emerald-700" };
}

export function SuppliesTable({ supplies, initialStatus, isSuperAdmin }: { supplies: SupplyRow[]; initialStatus?: string; isSuperAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>(initialStatus === "low" || initialStatus === "out" || initialStatus === "in" ? initialStatus : "all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return supplies
      .filter((supply) => !needle || supply.name.toLowerCase().includes(needle))
      .filter((supply) => statusFilter === "all" || statusOf(supply) === statusFilter);
  }, [supplies, query, statusFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let result = 0;
      if (sortField === "name") result = a.name.localeCompare(b.name);
      else if (sortField === "qty") result = a.qty - b.qty;
      else if (sortField === "price") result = a.price - b.price;
      else result = a.qty * a.price - b.qty * b.price;
      return sortDirection === "asc" ? result : -result;
    });
    return rows;
  }, [filtered, sortField, sortDirection]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  return (
    <>
      <div className="print-hidden flex flex-col gap-3 border-b border-[#e5eae7] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#89958f]" size={17} /><input className="field py-2.5 pl-9 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Search supply name" value={query} /></div>
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <button className={`rounded-lg border px-3 py-2 text-xs font-extrabold ${statusFilter === filter.value ? "border-[#0f6b4f] bg-[#eef7f3] text-[#0f6b4f]" : "border-[#e0e6e3] text-[#66736d] hover:bg-[#f7f9f8]"}`} key={filter.value} onClick={() => setStatusFilter(filter.value)} type="button">
              <Filter className="mr-1 inline" size={12} />{filter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead>
            <tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#87928c]">
              <SortHeader activeField={sortField} direction={sortDirection} field="name" label="Name" onSort={toggleSort} />
              <th className="px-5 py-3.5">Description</th>
              <SortHeader activeField={sortField} direction={sortDirection} field="qty" label="Qty" onSort={toggleSort} />
              <SortHeader activeField={sortField} align="right" direction={sortDirection} field="price" label="Price" onSort={toggleSort} />
              <SortHeader activeField={sortField} align="right" direction={sortDirection} field="value" label="Total value" onSort={toggleSort} />
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((supply) => {
              const status = statusOf(supply);
              const badge = statusBadge(status);
              const totalValue = supply.qty * supply.price;
              return (
                <tr className="border-b border-[#edf0ee] last:border-0 hover:bg-[#fbfcfb]" id={`supply-${supply.id}`} key={supply.id}>
                  <td className="px-5 py-4 text-sm font-bold">{supply.name}</td>
                  <td className="px-5 py-4 text-sm text-[#6f7d76]">{supply.description || "—"}</td>
                  <td className="px-5 py-4 text-sm font-extrabold">{supply.qty}</td>
                  <td className="px-5 py-4 text-right text-sm font-bold text-[#64736b]">{money(supply.price)}</td>
                  <td className="px-5 py-4 text-right text-sm font-black text-[#0f6b4f]">{money(totalValue)}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${badge.className}`}>{badge.label}</span></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <SupplyForm mode="edit" supply={{ id: supply.id, name: supply.name, description: supply.description ?? "", qty: supply.qty, price: supply.price, lowStockThreshold: supply.lowStockThreshold }} />
                      {isSuperAdmin && <DeleteSupplyButton supplyId={supply.id} supplyName={supply.name} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sorted.length && (
              <tr>
                <td colSpan={7}>
                  <div className="grid min-h-72 place-items-center text-center">
                    <div>
                      <PackageX className="mx-auto text-[#a5afa9]" size={34} />
                      <p className="mt-4 text-sm font-bold">No supplies found</p>
                      <p className="mt-1 text-xs text-[#87928c]">{supplies.length ? "Try a different search or filter." : "Add your first packaging supply to start tracking stock."}</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SortHeader({ field, label, align, activeField, direction, onSort }: { field: SortField; label: string; align?: "right"; activeField: SortField; direction: "asc" | "desc"; onSort: (field: SortField) => void }) {
  const active = activeField === field;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`px-5 py-3.5 ${align === "right" ? "text-right" : ""}`}>
      <button className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-[#0b6348]" : ""}`} onClick={() => onSort(field)} type="button">
        {label}<Icon size={12} />
      </button>
    </th>
  );
}
