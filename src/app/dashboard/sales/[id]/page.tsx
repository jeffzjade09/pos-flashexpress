import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { PrintReceiptButton } from "@/components/print-receipt-button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ReceiptItem = { id: string; product_name: string; unit_name: string; quantity: number; refunded_quantity: number; unit_price: number | string; line_total: number | string };
type RefundRow = { id: string; refund_amount: number | string; reason: string; restock_items: boolean; created_at: string };
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const channelNames: Record<string, string> = { walk_in: "Walk-in", tiktok: "TikTok Shop", lazada: "Lazada", shopee: "Shopee" };

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales")
    .select("id, receipt_number, status, subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount, total_amount, refunded_amount, amount_tendered, change_amount, payment_method, payment_reference, sales_channel, external_order_id, completed_at, cashier:profiles!sales_cashier_id_fkey(full_name), sale_items(id, product_name, unit_name, quantity, refunded_quantity, unit_price, line_total), sale_refunds(id, refund_amount, reason, restock_items, created_at)")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const items = data.sale_items as unknown as ReceiptItem[];
  const refunds = data.sale_refunds as unknown as RefundRow[];
  const cashierData = data.cashier as unknown as { full_name: string } | { full_name: string }[] | null;
  const cashier = Array.isArray(cashierData) ? cashierData[0] : cashierData;
  const total = Number(data.total_amount);
  const refunded = Number(data.refunded_amount);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link className="btn-secondary" href="/dashboard/sales"><ArrowLeft size={15} />Transactions</Link>
        <PrintReceiptButton />
      </div>
      <article className="receipt-print card overflow-hidden bg-white">
        <div className="border-b border-dashed border-[#ccd6d1] px-7 py-7 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f4ef] text-[#0f6b4f]"><ReceiptText size={22} /></span>
          <h1 className="mt-3 text-2xl font-black">FlashPOS</h1>
          <p className="mt-1 text-xs text-[#7f8b85]">Official sales receipt</p>
          <p className="mt-4 font-mono text-sm font-bold">{data.receipt_number}</p>
        </div>
        <div className="grid gap-3 border-b border-dashed border-[#ccd6d1] px-7 py-5 text-xs sm:grid-cols-2">
          <p><span className="text-[#849089]">Date:</span> <strong>{new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(data.completed_at))}</strong></p>
          <p><span className="text-[#849089]">Cashier:</span> <strong>{cashier?.full_name || "Team member"}</strong></p>
          <p><span className="text-[#849089]">Channel:</span> <strong>{channelNames[data.sales_channel] ?? data.sales_channel}</strong></p>
          <p><span className="text-[#849089]">Payment:</span> <strong className="capitalize">{data.payment_method === "marketplace" ? "Online settlement" : data.payment_method}</strong></p>
          {(data.external_order_id || data.payment_reference) && <p className="sm:col-span-2"><span className="text-[#849089]">Reference:</span> <strong>{data.external_order_id || data.payment_reference}</strong></p>}
        </div>
        <div className="px-7 py-5">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-[#dfe6e2] text-[10px] uppercase tracking-wide text-[#85918b]"><th className="py-2">Item</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th></tr></thead>
            <tbody>{items.map((item) => <tr className="border-b border-[#edf0ee]" key={item.id}><td className="py-3"><strong>{item.product_name}</strong><span className="mt-0.5 block text-[10px] text-[#89948e]">{item.unit_name}{item.refunded_quantity > 0 ? ` · ${item.refunded_quantity} refunded` : ""}</span></td><td className="py-3 text-center">{item.quantity}</td><td className="py-3 text-right">{money(Number(item.unit_price))}</td><td className="py-3 text-right font-bold">{money(Number(item.line_total))}</td></tr>)}</tbody>
          </table>
          <div className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#718078]">Subtotal</span><strong>{money(Number(data.subtotal))}</strong></div>
            {Number(data.discount_amount) > 0 && <div className="flex justify-between text-emerald-700"><span>Discount{data.discount_type === "percentage" ? ` (${Number(data.discount_value)}%)` : ""}</span><strong>-{money(Number(data.discount_amount))}</strong></div>}
            {Number(data.tax_amount) > 0 && <div className="flex justify-between"><span className="text-[#718078]">3% non-VAT charge</span><strong>{money(Number(data.tax_amount))}</strong></div>}
            {refunded > 0 && <div className="flex justify-between text-red-600"><span>Refunded</span><strong>-{money(refunded)}</strong></div>}
            <div className="flex justify-between border-t border-[#dfe6e2] pt-3 text-lg"><span className="font-black">Net total</span><strong>{money(total - refunded)}</strong></div>
            {data.payment_method === "cash" && <><div className="flex justify-between text-xs"><span className="text-[#718078]">Cash received</span><strong>{money(Number(data.amount_tendered))}</strong></div><div className="flex justify-between text-xs"><span className="text-[#718078]">Change</span><strong>{money(Number(data.change_amount))}</strong></div></>}
          </div>
          {refunds.length > 0 && <div className="mt-6 rounded-xl bg-red-50 p-4"><p className="text-xs font-extrabold text-red-700">Refund history</p>{refunds.map((refund) => <p className="mt-2 text-[11px] text-red-700" key={refund.id}>{money(Number(refund.refund_amount))} · {refund.reason} · {refund.restock_items ? "Restocked" : "Not restocked"}</p>)}</div>}
        </div>
        <footer className="border-t border-dashed border-[#ccd6d1] px-7 py-5 text-center text-[10px] text-[#8a958f]">Thank you for your purchase. Keep this receipt for returns and verification.</footer>
      </article>
    </div>
  );
}
