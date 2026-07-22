import { requireSuperAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function csvValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(filename: string, headers: string[], rows: unknown[][]) {
  const body = [headers.map(csvValue).join(","), ...rows.map((row) => row.map(csvValue).join(","))].join("\r\n");
  return new Response(`\uFEFF${body}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const adminExports = new Set(["expenses", "purchases", "closings", "activity"]);
  const user = adminExports.has(kind) ? await requireSuperAdmin() : await requireUser();
  const supabase = await createClient();
  const date = new Date().toISOString().slice(0, 10);

  if (kind === "sales") {
    const { data } = await supabase.from("sales").select("receipt_number, status, fulfillment_status, sales_channel, payment_method, external_order_id, payment_reference, subtotal, tax_rate, tax_amount, total_amount, refunded_amount, completed_at").order("completed_at", { ascending: false }).limit(10000);
    return csvResponse(`flashpos-sales-${date}.csv`, ["Receipt", "Sale status", "Fulfillment", "Channel", "Payment", "Order reference", "Payment reference", "Subtotal", "Tax rate", "Tax collected", "Gross", "Refunded", "Net", "Completed at"], (data ?? []).map((sale) => [sale.receipt_number, sale.status, sale.fulfillment_status, sale.sales_channel, sale.payment_method, sale.external_order_id, sale.payment_reference, sale.subtotal, sale.tax_rate, sale.tax_amount, sale.total_amount, sale.refunded_amount, Number(sale.total_amount) - Number(sale.refunded_amount), sale.completed_at]));
  }
  if (kind === "inventory") {
    const { data } = await supabase.from("product_stock").select("sku, barcode, name, variant, category_name, cost_per_piece, stock_on_hand, low_stock_threshold, is_active").order("name");
    return csvResponse(`flashpos-inventory-${date}.csv`, ["SKU", "Barcode", "Product", "Variant", "Category", "Cost per piece", "Stock pieces", "Low-stock threshold", "Active"], (data ?? []).map((product) => [product.sku, product.barcode, product.name, product.variant, product.category_name, product.cost_per_piece, product.stock_on_hand, product.low_stock_threshold, product.is_active]));
  }
  if (kind === "expenses") {
    const { data } = await supabase.from("expenses").select("expense_date, category, amount, note, created_at").order("expense_date", { ascending: false }).limit(10000);
    return csvResponse(`flashpos-expenses-${date}.csv`, ["Expense date", "Category", "Amount", "Notes", "Recorded at"], (data ?? []).map((expense) => [expense.expense_date, expense.category, expense.amount, expense.note, expense.created_at]));
  }
  if (kind === "purchases") {
    const { data } = await supabase.from("purchase_orders").select("po_number, supplier_reference, status, total_cost, ordered_at, received_at, notes, suppliers(name)").order("ordered_at", { ascending: false }).limit(10000);
    return csvResponse(`flashpos-purchases-${date}.csv`, ["Purchase order", "Supplier", "Supplier reference", "Status", "Total cost", "Ordered at", "Received at", "Notes"], (data ?? []).map((order) => {
      const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
      return [order.po_number, supplier?.name, order.supplier_reference, order.status, order.total_cost, order.ordered_at, order.received_at, order.notes];
    }));
  }
  if (kind === "closings") {
    const { data } = await supabase.from("cashier_closings").select("business_date, expected_cash, actual_cash, cash_variance, expected_gcash, actual_gcash, gcash_variance, notes, created_at, cashier:profiles!cashier_closings_cashier_id_fkey(full_name)").order("business_date", { ascending: false }).limit(10000);
    return csvResponse(`flashpos-cashier-closings-${date}.csv`, ["Business date", "Cashier", "Expected cash", "Actual cash", "Cash variance", "Expected GCash", "Actual GCash", "GCash variance", "Notes", "Closed at"], (data ?? []).map((closing) => {
      const cashier = Array.isArray(closing.cashier) ? closing.cashier[0] : closing.cashier;
      return [closing.business_date, cashier?.full_name, closing.expected_cash, closing.actual_cash, closing.cash_variance, closing.expected_gcash, closing.actual_gcash, closing.gcash_variance, closing.notes, closing.created_at];
    }));
  }
  if (kind === "activity") {
    const { data } = await supabase.from("audit_logs").select("created_at, action, entity_type, entity_name, details").order("created_at", { ascending: false }).limit(10000);
    return csvResponse(`flashpos-activity-${date}.csv`, ["Timestamp", "Action", "Entity type", "Entity", "Details"], (data ?? []).map((entry) => [entry.created_at, entry.action, entry.entity_type, entry.entity_name, JSON.stringify(entry.details)]));
  }
  return new Response(`Unsupported export for ${user.fullName}.`, { status: 404 });
}
