import Link from "next/link";
import { ArrowLeft, Eye, Trash2 } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ArchivedRow = {
  id: string;
  po_number: string;
  deleted_at: string;
  deleted_by: string | null;
  deletion_reason: string | null;
  suppliers: { name: string } | { name: string }[] | null;
  purchase_order_items: { id: string }[];
};

export default async function ArchivedPurchaseOrdersPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: orderData, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, deleted_at, deleted_by, deletion_reason, suppliers(name), purchase_order_items(id)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const orders = (orderData ?? []) as unknown as ArchivedRow[];
  const deletedByIds = [...new Set(orders.map((order) => order.deleted_by).filter((id): id is string => Boolean(id)))];
  const { data: profiles } = deletedByIds.length ? await supabase.from("profiles").select("id, full_name").in("id", deletedByIds) : { data: [] };
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Inventory replenishment</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Archived purchase orders</h1>
          <p className="mt-2 text-sm text-[#718079]">Deleted purchase orders are kept here for auditing and are never permanently removed.</p>
        </div>
        <Link className="btn-secondary" href="/dashboard/purchases"><ArrowLeft size={15} />Purchases</Link>
      </div>

      {error && <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Run the latest purchase order edit/delete migration in Supabase, then refresh this page.</div>}

      <div className="card mt-7 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#87928c]">
                <th className="px-5 py-3">Purchase order</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Products</th>
                <th className="px-5 py-3">Deleted by</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Deleted on</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
                return (
                  <tr className="border-b border-[#edf0ee] last:border-0" key={order.id}>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 size={16} /></span><p className="text-xs font-extrabold">{order.po_number}</p></div></td>
                    <td className="px-5 py-4 text-xs font-bold">{supplier?.name ?? "Unknown supplier"}</td>
                    <td className="px-5 py-4 text-xs text-[#66736d]">{order.purchase_order_items.length}</td>
                    <td className="px-5 py-4 text-xs text-[#66736d]">{(order.deleted_by && nameById.get(order.deleted_by)) || "Unknown"}</td>
                    <td className="px-5 py-4 text-xs text-[#66736d]">{order.deletion_reason}</td>
                    <td className="px-5 py-4 text-xs text-[#77847d]">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(order.deleted_at))}</td>
                    <td className="px-5 py-4 text-right"><Link className="btn-secondary py-2 text-xs" href={`/dashboard/purchases/${order.id}/print`}><Eye size={14} />View</Link></td>
                  </tr>
                );
              })}
              {!orders.length && <tr><td className="py-20 text-center text-sm text-[#87928c]" colSpan={7}>No archived purchase orders.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
