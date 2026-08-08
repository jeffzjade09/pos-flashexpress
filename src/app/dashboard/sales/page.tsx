import Link from "next/link";
import { Eye, ReceiptText, Search } from "lucide-react";
import { RefundSaleButton, type RefundableItem } from "@/components/refund-sale-button";
import { updateFulfillment } from "@/app/dashboard/sales/actions";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type SaleItemRow = { id: string; product_name: string; unit_name: string; quantity: number; refunded_quantity: number; unit_price: number | string; discount_amount: number | string; refunded_discount_amount: number | string; tax_amount: number | string; refunded_tax_amount: number | string };
type SaleRow = {
  id: string;
  receipt_number: string;
  status: string;
  total_amount: number | string;
  refunded_amount: number | string;
  sales_channel: string;
  payment_method: string;
  external_order_id: string | null;
  payment_reference: string | null;
  fulfillment_status: string;
  completed_at: string;
  sale_items: SaleItemRow[];
};

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const channelNames: Record<string, string> = { walk_in: "Walk-in", tiktok: "TikTok Shop", lazada: "Lazada", shopee: "Shopee" };
const statusStyles: Record<string, string> = { completed: "bg-emerald-50 text-emerald-700", partially_refunded: "bg-amber-50 text-amber-700", refunded: "bg-red-50 text-red-700", voided: "bg-slate-100 text-slate-600" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const query = String((await searchParams).q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { data, error } = await supabase.from("sales").select("id, receipt_number, status, total_amount, refunded_amount, sales_channel, payment_method, external_order_id, payment_reference, fulfillment_status, completed_at, sale_items(id, product_name, unit_name, quantity, refunded_quantity, unit_price, discount_amount, refunded_discount_amount, tax_amount, refunded_tax_amount)").in("status", ["completed", "partially_refunded", "refunded", "voided"]).order("completed_at", { ascending: false }).limit(200);
  const rows = ((data ?? []) as unknown as SaleRow[]).map((sale) => ({
    ...sale,
    sale_items: sale.sale_items.map((item) => ({
      ...item,
      unit_price: (Number(item.unit_price) * Number(item.quantity) - Number(item.discount_amount) + Number(item.tax_amount)) / Number(item.quantity),
    })),
  }));
  const sales = query ? rows.filter((sale) => `${sale.receipt_number} ${sale.external_order_id ?? ""} ${sale.payment_reference ?? ""} ${sale.sale_items.map((item) => item.product_name).join(" ")}`.toLowerCase().includes(query)) : rows;

  return <div className="mx-auto max-w-[1400px]"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Sales ledger</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Transactions</h1><p className="mt-2 text-sm text-[#718079]">Find receipts, reprint details, process returns, and track marketplace fulfillment.</p></div><Link href="/dashboard/pos" className="btn-primary">New sale</Link></div><div className="card mt-7 overflow-hidden"><div className="border-b border-[#e5eae7] p-4"><form className="relative max-w-lg"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#89958f]" size={17} /><input className="field py-2.5 pl-9 text-sm" defaultValue={query} name="q" placeholder="Receipt, order ID, GCash reference, or product" /></form></div>{error ? <div className="m-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Run the latest database migrations to enable transaction history.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead><tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#87928c]"><th className="px-5 py-3.5">Receipt</th><th className="px-5 py-3.5">Channel / payment</th><th className="px-5 py-3.5">Items</th><th className="px-5 py-3.5">Sale status</th><th className="px-5 py-3.5">Fulfillment</th><th className="px-5 py-3.5">Date</th><th className="px-5 py-3.5 text-right">Net total</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead><tbody>{sales.map((sale) => { const total = Number(sale.total_amount); const refunded = Number(sale.refunded_amount); const refundableItems: RefundableItem[] = sale.sale_items.map((item) => ({ id: item.id, productName: item.product_name, unitName: item.unit_name, quantity: Number(item.quantity), refundedQuantity: Number(item.refunded_quantity), unitPrice: Number(item.unit_price) })); const canRefund = refundableItems.some((item) => item.quantity > item.refundedQuantity) && sale.status !== "voided"; return <tr className="border-b border-[#edf0ee] last:border-0" key={sale.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf5f1] text-[#0f6b4f]"><ReceiptText size={16} /></span><div><p className="text-xs font-extrabold">{sale.receipt_number}</p><p className="mt-0.5 text-[10px] text-[#89948e]">{sale.external_order_id || sale.payment_reference || "No external reference"}</p></div></div></td><td className="px-5 py-4"><p className="text-xs font-bold">{channelNames[sale.sales_channel] ?? sale.sales_channel}</p><p className="mt-0.5 text-[10px] capitalize text-[#89948e]">{sale.payment_method === "marketplace" ? "Online settlement" : sale.payment_method === "credit_card" ? "Credit card" : sale.payment_method}</p></td><td className="px-5 py-4 text-xs text-[#66736d]">{sale.sale_items.reduce((sum, item) => sum + Number(item.quantity), 0)} units</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusStyles[sale.status] ?? "bg-slate-100 text-slate-600"}`}>{sale.status.replaceAll("_", " ").toUpperCase()}</span></td><td className="px-5 py-4">{sale.sales_channel === "walk_in" ? <span className="text-xs text-[#89948e]">Completed</span> : <form action={updateFulfillment} className="flex items-center gap-1"><input name="saleId" type="hidden" value={sale.id} /><select className="rounded-lg border border-[#dfe6e2] bg-white px-2 py-1.5 text-[10px] font-bold capitalize" defaultValue={sale.fulfillment_status} name="fulfillmentStatus">{["pending", "packed", "shipped", "delivered", "completed"].map((status) => <option key={status}>{status}</option>)}</select><button className="text-[10px] font-black text-[#0f6b4f]">SAVE</button></form>}</td><td className="px-5 py-4 text-xs text-[#77847d]">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(sale.completed_at))}</td><td className="px-5 py-4 text-right"><p className="text-sm font-black">{money(total - refunded)}</p>{refunded > 0 && <p className="mt-0.5 text-[10px] text-red-600">{money(refunded)} refunded</p>}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Link className="btn-secondary py-2 text-xs" href={`/dashboard/sales/${sale.id}`}><Eye size={14} />View</Link>{user.role === "super_admin" && canRefund && <RefundSaleButton saleId={sale.id} receiptNumber={sale.receipt_number} items={refundableItems} />}</div></td></tr>; })}{!sales.length && <tr><td className="py-20 text-center text-sm text-[#87928c]" colSpan={8}>No matching transactions found.</td></tr>}</tbody></table></div>}</div></div>;
}
