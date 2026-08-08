import { Boxes, CircleDollarSign, PackageSearch, TriangleAlert } from "lucide-react";
import { SupplyForm } from "@/components/supply-form";
import { SuppliesTable, type SupplyRow } from "@/components/supplies-table";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

export default async function SuppliesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplies").select("id, name, description, qty, price, low_stock_threshold").order("name");

  const supplies: SupplyRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    qty: Number(row.qty),
    price: Number(row.price),
    lowStockThreshold: Number(row.low_stock_threshold),
  }));

  const totalValue = supplies.reduce((sum, supply) => sum + supply.qty * supply.price, 0);
  const totalQty = supplies.reduce((sum, supply) => sum + supply.qty, 0);
  const lowStockCount = supplies.filter((supply) => supply.qty <= supply.lowStockThreshold).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="eyebrow">Supply control</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Supplies</h1><p className="mt-2 text-sm text-[#718079]">Manage packaging supplies used for orders.</p></div>
        <div className="flex gap-2"><SupplyForm mode="create" /></div>
      </div>

      {error && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Run the latest supplies migration in Supabase, then refresh this page.</div>}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#718078]">Total supply items</p><p className="mt-3 text-3xl font-black tracking-tight">{supplies.length.toLocaleString()}</p><p className="mt-2 text-xs text-[#89948e]">Packaging supplies tracked</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><PackageSearch size={18} /></span></div></article>
        <article className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#718078]">Total supply value</p><p className="mt-3 text-3xl font-black tracking-tight">{money(totalValue)}</p><p className="mt-2 text-xs text-[#89948e]">Qty × price across all supplies</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CircleDollarSign size={18} /></span></div></article>
        <article className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#718078]">Total qty on hand</p><p className="mt-3 text-3xl font-black tracking-tight">{totalQty.toLocaleString()}</p><p className="mt-2 text-xs text-[#89948e]">Combined units across supplies</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Boxes size={18} /></span></div></article>
        <article className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#718078]">Low stock items</p><p className="mt-3 text-3xl font-black tracking-tight">{lowStockCount.toLocaleString()}</p><p className="mt-2 text-xs text-[#89948e]">At or below the alert threshold</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><TriangleAlert size={18} /></span></div></article>
      </section>

      <div className="card mt-7 overflow-hidden">
        <SuppliesTable initialStatus={params.status} isSuperAdmin={user.role === "super_admin"} supplies={supplies} />
      </div>
    </div>
  );
}
