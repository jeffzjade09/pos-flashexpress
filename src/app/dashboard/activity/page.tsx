import { Activity, Clock3, FileLock2 } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AuditActor = { full_name: string; role: string };
type AuditLog = {
  id: number;
  action: string;
  entity_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: AuditActor | AuditActor[] | null;
};

const actionLabels: Record<string, string> = {
  "session.login": "Signed in",
  "session.logout": "Signed out",
  "product.created": "Created product",
  "product.updated": "Updated product",
  "product.deleted": "Deleted product",
  "product.restored": "Restored product",
  "product.renamed": "Renamed product",
  "stock.opening": "Recorded opening stock",
  "stock.adjustment": "Adjusted stock",
  "stock.purchase": "Received stock",
  "stock.sale": "Recorded sale stock movement",
  "stock.return": "Recorded returned stock",
  "user.created": "Created team member",
  "user.role_changed": "Changed user role",
  "user.activated": "Activated user",
  "user.deactivated": "Deactivated user",
  "sale.completed": "Completed sale",
  "sale.refunded": "Processed refund",
  "expense.created": "Recorded expense",
  "expense.updated": "Updated expense",
  "expense.deleted": "Deleted expense",
  "purchase.created": "Created purchase order",
  "purchase.received": "Received purchase inventory",
  "closing.created": "Closed cashier day",
  "sale.fulfillment_updated": "Updated fulfillment",
};

function actorOf(log: AuditLog) {
  return Array.isArray(log.actor) ? log.actor[0] : log.actor;
}

function attributesText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .filter((entry): entry is { type: unknown; value: unknown } => typeof entry === "object" && entry !== null)
    .map((entry) => `${String(entry.type)}: ${String(entry.value)}`)
    .join(", ");
}

function detailText(log: AuditLog) {
  const details = log.details ?? {};
  if (log.action === "product.updated") {
    const after = typeof details.after === "object" && details.after ? details.after as Record<string, unknown> : {};
    return [after.sku ? `SKU ${String(after.sku)}` : "", attributesText(after.variant_attributes)].filter(Boolean).join(" · ") || "Product details changed";
  }
  if (log.action.startsWith("stock.")) {
    const quantity = Number(details.quantity_pieces ?? 0);
    const quantityText = `${quantity > 0 ? "+" : ""}${quantity.toLocaleString()} pieces`;
    return details.note ? `${quantityText} · ${String(details.note)}` : quantityText;
  }
  if (log.action === "user.role_changed") {
    return `${String(details.from ?? "unknown").replace("_", " ")} → ${String(details.to ?? "unknown").replace("_", " ")}`;
  }
  if (log.action === "sale.completed") {
    const channel = String(details.channel ?? "marketplace");
    const orderId = String(details.external_order_id ?? "");
    const paymentMethod = String(details.payment_method ?? "");
    const paymentReference = String(details.payment_reference ?? "");
    const total = Number(details.total_amount ?? 0);
    const channelLabel = channel === "walk_in" ? "Walk-in" : `${channel.charAt(0).toUpperCase()}${channel.slice(1)}`;
    const reference = orderId || paymentReference;
    const payment = paymentMethod === "gcash" ? "GCash" : paymentMethod === "credit_card" ? "Credit Card" : paymentMethod === "cash" ? "Cash" : "";
    return `${channelLabel}${reference ? ` ref ${reference}` : " sale"}${payment ? ` · ${payment}` : ""} · ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(total)}`;
  }
  if (log.action === "sale.refunded") {
    return `${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(details.amount ?? 0))} · ${String(details.reason ?? "No reason")} · ${details.restocked ? "Restocked" : "Not restocked"}`;
  }
  if (log.action.startsWith("expense.")) {
    return `${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(details.amount ?? 0))} · ${String(details.expense_date ?? "")}${details.note ? ` · ${String(details.note)}` : ""}`;
  }
  if (log.action === "purchase.created") return `Order total ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(details.total_cost ?? 0))}`;
  if (log.action === "purchase.received") return `${Number(details.pieces_received ?? 0).toLocaleString()} pieces received${details.completed ? " · Order complete" : " · Partially received"}`;
  if (log.action === "closing.created") return `Cash variance ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(details.cash_variance ?? 0))} · GCash variance ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(details.gcash_variance ?? 0))}`;
  if (log.action === "sale.fulfillment_updated") return `${String(details.from ?? "unknown")} → ${String(details.to ?? "unknown")}`;
  if (typeof details.email === "string") return details.email;
  if (typeof details.sku === "string" && details.sku) {
    const attributes = attributesText(details.variant_attributes);
    return `SKU ${details.sku}${attributes ? ` · ${attributes}` : ""}`;
  }
  return null;
}

export default async function ActivityPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_name, details, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name, role)")
    .order("created_at", { ascending: false })
    .limit(100);

  const logs = (data ?? []) as unknown as AuditLog[];

  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0f6b4f]">System oversight</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Activity log</h1>
          <p className="mt-2 text-sm text-[#75817b]">See who changed products, stock, access, and account sessions.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#dfe7e3] bg-white px-4 py-2.5 text-xs font-semibold text-[#607068]"><Clock3 size={15} />Latest 100 events</div>
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-[#e1e8e4] bg-white shadow-[0_12px_36px_rgba(26,55,42,0.06)]">
        <div className="flex items-center justify-between border-b border-[#e6ebe8] px-5 py-4">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9f4ef] text-[#0f6b4f]"><Activity size={18} /></span><div><p className="text-sm font-extrabold">Recent system activity</p><p className="text-xs text-[#839089]">Newest events appear first</p></div></div>
          <div className="hidden items-center gap-2 text-xs font-semibold text-[#738078] sm:flex"><FileLock2 size={15} />Records cannot be edited or deleted</div>
        </div>

        {error ? (
          <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">The activity-log database update has not been installed yet. Run the newest Supabase migration, then refresh this page.</div>
        ) : logs.length === 0 ? (
          <div className="grid min-h-72 place-items-center px-5 text-center"><div><Activity className="mx-auto text-[#a9b5af]" size={32} /><p className="mt-3 text-sm font-bold">No activity recorded yet</p><p className="mt-1 text-xs text-[#87938d]">New sign-ins and inventory changes will appear here.</p></div></div>
        ) : (
          <div className="divide-y divide-[#edf0ee]">
            {logs.map((log) => {
              const actor = actorOf(log);
              const detail = detailText(log);
              return (
                <article className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center" key={log.id}>
                  <div className="min-w-0">
                    <p className="text-sm text-[#33443b]"><span className="font-extrabold">{actor?.full_name ?? "System"}</span> <span className="text-[#77847d]">{actionLabels[log.action] ?? log.action.replaceAll(".", " ")}</span>{log.entity_name && <><span className="text-[#77847d]">: </span><span className="font-bold">{log.entity_name}</span></>}</p>
                    {detail && <p className="mt-1 truncate text-xs text-[#839089]">{detail}</p>}
                  </div>
                  <time className="text-xs font-medium text-[#7f8c85] sm:text-right" dateTime={log.created_at}>{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(log.created_at))}</time>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
