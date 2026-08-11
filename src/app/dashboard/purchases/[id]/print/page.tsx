import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackagePlus, TriangleAlert } from "lucide-react";
import { PrintReceiptButton } from "@/components/print-receipt-button";
import { requireUser } from "@/lib/auth";
import { fetchStoreSettings } from "@/lib/store-settings";
import { createClient } from "@/lib/supabase/server";

type Supplier = { name: string; phone: string | null; address: string | null };
type ItemRow = { id: string; product_name: string; variant_label: string | null; quantity_pieces: number };

export default async function PurchaseOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, storeSettings] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, po_number, ordered_at, supplier_reference, notes, deleted_at, deleted_by, deletion_reason, suppliers(name, phone, address), purchase_order_items(id, product_name, variant_label, quantity_pieces)")
      .eq("id", id)
      .single(),
    fetchStoreSettings(supabase),
  ]);
  if (!data) notFound();

  const supplierData = data.suppliers as unknown as Supplier | Supplier[] | null;
  const supplier = Array.isArray(supplierData) ? supplierData[0] : supplierData;
  const items = data.purchase_order_items as unknown as ItemRow[];

  let deletedByName: string | null = null;
  if (data.deleted_by) {
    const { data: deleter } = await supabase.from("profiles").select("full_name").eq("id", data.deleted_by).maybeSingle();
    deletedByName = deleter?.full_name ?? null;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link className="btn-secondary" href="/dashboard/purchases"><ArrowLeft size={15} />Purchases</Link>
        {!data.deleted_at && <PrintReceiptButton />}
      </div>

      {data.deleted_at && (
        <div className="mb-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 print:hidden">
          <TriangleAlert className="mt-0.5 shrink-0" size={18} />
          <p>
            This purchase order was deleted on {new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(data.deleted_at))}
            {deletedByName ? ` by ${deletedByName}` : ""}. Reason: {data.deletion_reason ?? "Not provided"}. It cannot be printed or sent to a supplier.
          </p>
        </div>
      )}

      <article className="receipt-print card overflow-hidden bg-white p-8">
        <div className="border-b border-[#e6ebe8] pb-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f4ef] text-[#0f6b4f]"><PackagePlus size={22} /></span>
          <h1 className="mt-3 text-xl font-black">{storeSettings.companyName || "Store"}</h1>
          {storeSettings.storeAddress && <p className="mt-1 text-xs text-[#7f8b85]">{storeSettings.storeAddress}</p>}
          {storeSettings.contactNumber && <p className="mt-1 text-xs text-[#7f8b85]">Contact: {storeSettings.contactNumber}</p>}
        </div>

        <p className="mt-5 text-center text-lg font-black tracking-[0.08em]">PURCHASE ORDER</p>

        <div className="mt-5 grid gap-4 border-b border-[#e6ebe8] pb-5 text-xs sm:grid-cols-2">
          <div>
            <p className="font-bold text-[#849089]">To</p>
            <p className="mt-1 font-extrabold">{supplier?.name ?? "Supplier"}</p>
            {supplier?.phone && <p className="mt-0.5 text-[#7f8b85]">{supplier.phone}</p>}
            {supplier?.address && <p className="mt-0.5 text-[#7f8b85]">{supplier.address}</p>}
            {data.supplier_reference && <p className="mt-0.5 text-[#7f8b85]">Ref: {data.supplier_reference}</p>}
          </div>
          <div className="sm:text-right">
            <p><span className="text-[#849089]">PO Number:</span> <strong className="font-mono">{data.po_number}</strong></p>
            <p className="mt-1"><span className="text-[#849089]">Date:</span> <strong>{new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" }).format(new Date(data.ordered_at))}</strong></p>
            <p className="mt-1"><span className="text-[#849089]">Extracted By:</span> <strong>{user.fullName}</strong></p>
          </div>
        </div>

        <table className="mt-5 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#e6ebe8] text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#87928c]">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3">Variant</th>
              <th className="py-2 text-right">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr className="border-b border-[#edf0ee] last:border-0" key={item.id}>
                <td className="py-2.5 pr-3">{index + 1}</td>
                <td className="py-2.5 pr-3 font-bold">{item.product_name}</td>
                <td className="py-2.5 pr-3 text-[#7f8b85]">{item.variant_label ?? "N/A"}</td>
                <td className="py-2.5 text-right font-extrabold">{item.quantity_pieces}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.notes && (
          <div className="mt-5 rounded-xl bg-[#f5f8f6] p-3 text-xs text-[#7d8a83]">
            <p className="font-bold text-[#5c6b62]">Notes</p>
            <p className="mt-1">{data.notes}</p>
          </div>
        )}

        <div className="mt-8 border-t border-[#e6ebe8] pt-5 text-xs">
          <p className="text-[#849089]">Sales Officer:</p>
          <p className="mt-4 font-extrabold">{storeSettings.salesOfficerName || "—"}</p>
          <p className="mt-1 text-[10px] text-[#a3ada8]">Sales Officer</p>
        </div>
      </article>
    </div>
  );
}
