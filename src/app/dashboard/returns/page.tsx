import { Search, Undo2 } from "lucide-react";
import { ClassifyReturnButton } from "@/components/classify-return-button";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type PhotoRow = { id: string; storage_path: string };
type ClassificationRow = {
  id: string;
  classification: "good" | "bad";
  quantity: number;
  reason: string;
  created_at: string;
  inspected_by: { full_name: string } | { full_name: string }[] | null;
  return_classification_photos: PhotoRow[];
};
type SaleItemRow = {
  id: string;
  product_name: string;
  unit_name: string;
  quantity: number;
  inspected_quantity: number;
  return_classifications: ClassificationRow[];
};
type SaleRow = {
  id: string;
  receipt_number: string;
  sales_channel: string;
  external_order_id: string | null;
  payment_reference: string | null;
  completed_at: string;
  cashier: { full_name: string } | { full_name: string }[] | null;
  sale_items: SaleItemRow[];
};

const channelNames: Record<string, string> = { walk_in: "Walk-in", tiktok: "TikTok Shop", lazada: "Lazada", shopee: "Shopee" };

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const safeQuery = query.replace(/[^a-zA-Z0-9-]/g, "");

  const supabase = await createClient();
  let sales: SaleRow[] = [];
  let searchError = false;

  if (safeQuery) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        "id, receipt_number, sales_channel, external_order_id, payment_reference, completed_at, cashier:profiles!sales_cashier_id_fkey(full_name), sale_items(id, product_name, unit_name, quantity, inspected_quantity, return_classifications(id, classification, quantity, reason, created_at, inspected_by:profiles(full_name), return_classification_photos(id, storage_path)))",
      )
      .or(`receipt_number.eq.${safeQuery},external_order_id.ilike.${safeQuery},payment_reference.ilike.${safeQuery}`)
      .order("completed_at", { ascending: false })
      .limit(20);
    if (error) searchError = true;
    else sales = (data ?? []) as unknown as SaleRow[];
  }

  const allPhotoPaths = sales.flatMap((sale) =>
    sale.sale_items.flatMap((item) => item.return_classifications.flatMap((entry) => entry.return_classification_photos.map((photo) => photo.storage_path))),
  );
  const signedUrlEntries = await Promise.all(
    allPhotoPaths.map(async (path) => {
      const { data } = await supabase.storage.from("return-photos").createSignedUrl(path, 600);
      return [path, data?.signedUrl ?? null] as const;
    }),
  );
  const photoUrls = new Map(signedUrlEntries);

  return (
    <div className="mx-auto max-w-4xl">
      <div><p className="eyebrow">Marketplace returns</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Returns</h1><p className="mt-2 text-sm text-[#718079]">Search an order to inspect and classify returned units as good or bad.</p></div>

      <form className="card mt-6 flex flex-col gap-2 p-4 sm:flex-row" method="get">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#89958f]" size={17} /><input className="field py-2.5 pl-9 text-sm" defaultValue={query} name="q" placeholder="Reference ID (marketplace order number) or Transaction ID (receipt)" /></div>
        <button className="btn-primary shrink-0" type="submit">Search</button>
      </form>

      {searchError && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">The Back Orders database update has not been installed yet. Run the latest Supabase migration, then refresh this page.</div>}

      {safeQuery && !searchError && sales.length === 0 && (
        <div className="card mt-6 grid min-h-52 place-items-center text-center"><div><Undo2 className="mx-auto text-[#a5afa9]" size={30} /><p className="mt-3 text-sm font-bold">No matching order found</p><p className="mt-1 text-xs text-[#87928c]">Check the reference or transaction ID and try again.</p></div></div>
      )}

      <div className="mt-6 space-y-5">
        {sales.map((sale) => {
          const cashier = single(sale.cashier);
          return (
            <article className="card overflow-hidden" key={sale.id}>
              <div className="flex flex-col gap-2 border-b border-[#e5eae7] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm font-extrabold">{sale.receipt_number}</p>
                  <p className="mt-1 text-xs text-[#89948e]">{channelNames[sale.sales_channel] ?? sale.sales_channel} · {cashier?.full_name ?? "Team member"} · {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(sale.completed_at))}</p>
                </div>
                {(sale.external_order_id || sale.payment_reference) && <p className="text-xs text-[#89948e]">Ref: <span className="font-bold text-[#33443b]">{sale.external_order_id || sale.payment_reference}</span></p>}
              </div>
              <div className="divide-y divide-[#edf0ee]">
                {sale.sale_items.map((item) => {
                  const remaining = item.quantity - item.inspected_quantity;
                  return (
                    <div className="p-5" key={item.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><p className="text-sm font-extrabold">{item.product_name}</p><p className="mt-0.5 text-xs text-[#89948e]">{item.unit_name} · {item.quantity} ordered · {remaining} remaining to inspect</p></div>
                        <ClassifyReturnButton productName={item.product_name} remaining={remaining} saleItemId={item.id} />
                      </div>
                      {item.return_classifications.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {item.return_classifications.map((entry) => {
                            const inspector = single(entry.inspected_by);
                            return (
                              <div className={`rounded-xl border p-3 text-xs ${entry.classification === "good" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`} key={entry.id}>
                                <p className="font-extrabold">{entry.quantity} unit(s) · {entry.classification === "good" ? "Good" : "Bad"}</p>
                                <p className="mt-1 text-[#5c6a63]">{entry.reason}</p>
                                <p className="mt-1 text-[10px] text-[#89948e]">{inspector?.full_name ?? "Team member"} · {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(entry.created_at))}</p>
                                {entry.return_classification_photos.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {entry.return_classification_photos.map((photo) => {
                                      const url = photoUrls.get(photo.storage_path);
                                      return url ? <a href={url} key={photo.id} rel="noreferrer" target="_blank"><img alt="Return evidence" className="h-16 w-16 rounded-lg border border-red-200 object-cover" src={url} /></a> : null;
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
