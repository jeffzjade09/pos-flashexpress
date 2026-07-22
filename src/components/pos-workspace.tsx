"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Minus, Package, Plus, Search, ShoppingBag, Store, Trash2 } from "lucide-react";
import { completeSale, type CheckoutState } from "@/app/dashboard/pos/actions";

export type PosUnit = {
  id: string;
  name: string;
  conversionToPiece: number;
  sellingPrice: number;
  barcode: string;
};

export type PosProduct = {
  id: string;
  sku: string;
  name: string;
  variant: string;
  categoryName: string;
  stockOnHand: number;
  barcode: string;
  units: PosUnit[];
};

type CartLine = PosUnit & {
  productId: string;
  productName: string;
  quantity: number;
};

const initialState: CheckoutState = {};
const channels = [
  { value: "walk_in", label: "Walk-in", short: "WI", color: "bg-[#0f6b4f] text-white" },
  { value: "tiktok", label: "TikTok Shop", short: "TT", color: "bg-[#151515] text-white" },
  { value: "lazada", label: "Lazada", short: "L", color: "bg-[#5236b8] text-white" },
  { value: "shopee", label: "Shopee", short: "S", color: "bg-[#ee4d2d] text-white" },
] as const;

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

export function PosWorkspace({ products }: { products: PosProduct[] }) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<(typeof channels)[number]["value"]>("walk_in");
  const [orderReference, setOrderReference] = useState("");
  const [amountTendered, setAmountTendered] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [state, action, pending] = useActionState(async (previous: CheckoutState, formData: FormData) => {
    const result = await completeSale(previous, formData);
    if (result.success) {
      setCart([]);
      setOrderReference("");
      setAmountTendered("");
      setPaymentReference("");
    }
    return result;
  }, initialState);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => `${product.name} ${product.variant} ${product.sku} ${product.categoryName} ${product.barcode} ${product.units.map((unit) => unit.barcode).join(" ")}`.toLowerCase().includes(needle));
  }, [products, query]);

  const subtotal = cart.reduce((sum, line) => sum + line.sellingPrice * line.quantity, 0);
  const taxAmount = cart.reduce((sum, line) => sum + Math.round(line.sellingPrice * line.quantity * 0.03 * 100) / 100, 0);
  const total = subtotal + taxAmount;
  const totalUnits = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cashReceived = Number(amountTendered) || 0;
  const expectedChange = Math.max(0, cashReceived - total);

  function piecesInCart(productId: string) {
    return cart.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity * line.conversionToPiece, 0);
  }

  function addUnit(product: PosProduct, unit: PosUnit) {
    setCart((current) => {
      const currentPieces = current.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity * line.conversionToPiece, 0);
      if (currentPieces + unit.conversionToPiece > product.stockOnHand) return current;
      const existing = current.find((line) => line.id === unit.id);
      if (existing) return current.map((line) => line.id === unit.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { ...unit, productId: product.id, productName: `${product.name}${product.variant ? ` — ${product.variant}` : ""}`, quantity: 1 }];
    });
  }

  function changeQuantity(unitId: string, change: number) {
    setCart((current) => {
      const target = current.find((line) => line.id === unitId);
      if (!target) return current;
      if (change > 0) {
        const product = products.find((item) => item.id === target.productId);
        const currentPieces = current.filter((line) => line.productId === target.productId).reduce((sum, line) => sum + line.quantity * line.conversionToPiece, 0);
        if (!product || currentPieces + target.conversionToPiece > product.stockOnHand) return current;
      }
      const nextQuantity = target.quantity + change;
      if (nextQuantity <= 0) return current.filter((line) => line.id !== unitId);
      return current.map((line) => line.id === unitId ? { ...line, quantity: nextQuantity } : line);
    });
  }

  function scanBarcode(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = query.trim();
    const product = products.find((item) => item.barcode === code || item.units.some((unit) => unit.barcode === code));
    if (!product) return;
    const unit = product.units.find((item) => item.barcode === code) ?? product.units.find((item) => item.conversionToPiece === 1) ?? product.units[0];
    if (unit) addUnit(product, unit);
    setQuery("");
  }

  return (
    <div className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="card overflow-hidden">
        <div className="border-b border-[#e5eae7] p-4">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#89958f]" size={18} /><input className="field py-3 pl-10 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={scanBarcode} placeholder="Search or scan a product barcode" /></div>
        </div>
        <div className="grid max-h-[calc(100vh-245px)] min-h-[540px] gap-3 overflow-y-auto p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const remaining = product.stockOnHand - piecesInCart(product.id);
            return (
              <article className="flex h-fit min-h-48 flex-col rounded-2xl border border-[#e4eae6] bg-white p-4 transition hover:border-[#b9d2c7] hover:shadow-md" key={product.id}>
                <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf5f1] text-[#0f6b4f]"><Package size={19} /></span><div className="min-w-0"><h2 className="truncate text-sm font-extrabold">{product.name}</h2>{product.variant && <p className="mt-0.5 truncate text-[11px] font-semibold text-[#52645b]">{product.variant}</p>}<p className="mt-0.5 truncate text-[11px] text-[#87928c]">{product.sku} · {product.categoryName}</p></div></div>
                <div className="mt-4 flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${remaining > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{remaining} PCS AVAILABLE</span></div>
                <div className="mt-4 grid gap-2">
                  {product.units.map((unit) => {
                    const canAdd = remaining >= unit.conversionToPiece;
                    return <button className="flex items-center justify-between rounded-xl border border-[#dfe6e2] px-3 py-2.5 text-left hover:border-[#0f6b4f] hover:bg-[#f3f9f6] disabled:cursor-not-allowed disabled:bg-[#f6f7f6] disabled:text-[#a3ada8]" disabled={!canAdd} key={unit.id} onClick={() => addUnit(product, unit)} type="button"><span><span className="block text-xs font-extrabold">{unit.name}</span><span className="block text-[10px] text-[#839089]">{unit.conversionToPiece} {unit.conversionToPiece === 1 ? "piece" : "pieces"}</span></span><span className="text-sm font-black">{money(unit.sellingPrice)}</span></button>;
                  })}
                </div>
              </article>
            );
          })}
          {!filteredProducts.length && <div className="col-span-full grid min-h-80 place-items-center text-center"><div><Search className="mx-auto text-[#a6b0aa]" size={32} /><p className="mt-3 text-sm font-bold">No products found</p><p className="mt-1 text-xs text-[#87928c]">Try another name or check your active inventory.</p></div></div>}
        </div>
      </section>

      <form action={action} className="card overflow-hidden xl:sticky xl:top-24">
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="paymentMethod" value={paymentMethod} />
        <input type="hidden" name="cart" value={JSON.stringify(cart.map((line) => ({ product_unit_id: line.id, quantity: line.quantity })))} />

        <div className="border-b border-[#e5eae7] p-5">
          <div className="flex items-center justify-between"><div><p className="text-base font-black">Current order</p><p className="mt-0.5 text-xs text-[#839089]">{totalUnits} {totalUnits === 1 ? "unit" : "units"} in cart</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9f4ef] text-[#0f6b4f]"><ShoppingBag size={19} /></span></div>
          <label className="mt-5 block text-xs font-bold text-[#34453d]">Order source</label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {channels.map((item) => <button aria-pressed={channel === item.value} className={`rounded-xl border p-2 text-center transition ${channel === item.value ? "border-[#0f6b4f] bg-[#eef7f3] ring-1 ring-[#0f6b4f]" : "border-[#e0e6e3] hover:bg-[#f7f9f8]"}`} key={item.value} onClick={() => setChannel(item.value)} type="button"><span className={`mx-auto grid h-7 w-7 place-items-center rounded-lg text-[10px] font-black ${item.color}`}>{item.short}</span><span className="mt-1.5 block text-[10px] font-extrabold">{item.label}</span></button>)}
          </div>
          {channel === "walk_in" ? (
            <div className="mt-4 rounded-xl border border-[#dfe7e3] bg-[#f7faf8] p-3"><div className="flex items-center gap-2 text-xs font-extrabold text-[#315345]"><Store size={15} />Payment method</div><div className="mt-3 grid grid-cols-2 gap-2"><button className={`rounded-lg border px-3 py-2 text-xs font-extrabold ${paymentMethod === "cash" ? "border-[#0f6b4f] bg-white text-[#0f6b4f] ring-1 ring-[#0f6b4f]" : "border-[#dce4df] bg-white text-[#748078]"}`} onClick={() => setPaymentMethod("cash")} type="button">Cash</button><button className={`rounded-lg border px-3 py-2 text-xs font-extrabold ${paymentMethod === "gcash" ? "border-[#1769e0] bg-blue-50 text-[#1769e0] ring-1 ring-[#1769e0]" : "border-[#dce4df] bg-white text-[#748078]"}`} onClick={() => setPaymentMethod("gcash")} type="button">GCash</button></div>{paymentMethod === "cash" ? <><label className="mt-3 block text-xs font-bold text-[#34453d]"><span className="mb-1.5 block">Cash received</span><span className="relative block"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7c8982]">₱</span><input className="field with-currency-prefix text-sm" name="amountTendered" value={amountTendered} onChange={(event) => setAmountTendered(event.target.value)} type="number" min="0" step="0.01" placeholder="0.00" required /></span></label>{cashReceived > 0 && <div className="mt-3 flex justify-between border-t border-[#e0e8e3] pt-3 text-xs"><span className="font-semibold text-[#718078]">Change</span><span className="font-black text-[#0f6b4f]">{money(expectedChange)}</span></div>}</> : <label className="mt-3 block text-xs font-bold text-[#34453d]"><span className="mb-1.5 block">GCash reference ID</span><input className="field text-sm" name="paymentReference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Enter payment reference" required /></label>}</div>
          ) : (
            <label className="mt-4 block text-xs font-bold text-[#34453d]"><span className="mb-1.5 block">Marketplace order ID</span><input className="field text-sm" name="orderReference" value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder={`${channels.find((item) => item.value === channel)?.label} order number`} required /></label>
          )}
        </div>

        <div className="max-h-[330px] min-h-48 overflow-y-auto p-5">
          {cart.length ? <div className="space-y-4">{cart.map((line) => {
            const product = products.find((item) => item.id === line.productId);
            const canIncrease = product ? piecesInCart(line.productId) + line.conversionToPiece <= product.stockOnHand : false;
            return <div className="flex gap-3" key={line.id}><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{line.productName}</p><p className="mt-0.5 text-xs text-[#849088]">{line.name} · {money(line.sellingPrice)}</p><div className="mt-2 inline-flex items-center rounded-lg border border-[#dfe5e2]"><button className="grid h-7 w-7 place-items-center hover:bg-[#f2f5f3]" onClick={() => changeQuantity(line.id, -1)} type="button" aria-label="Decrease quantity"><Minus size={12} /></button><span className="min-w-7 text-center text-xs font-black">{line.quantity}</span><button className="grid h-7 w-7 place-items-center hover:bg-[#f2f5f3] disabled:text-[#b5bdb9]" disabled={!canIncrease} onClick={() => changeQuantity(line.id, 1)} type="button" aria-label="Increase quantity"><Plus size={12} /></button></div></div><div className="text-right"><p className="text-sm font-black">{money(line.sellingPrice * line.quantity)}</p><button className="mt-2 text-[#a1aaa5] hover:text-red-600" onClick={() => setCart((current) => current.filter((item) => item.id !== line.id))} type="button" aria-label={`Remove ${line.productName}`}><Trash2 size={14} /></button></div></div>;
          })}</div> : <div className="grid min-h-44 place-items-center text-center"><div><ShoppingBag className="mx-auto text-[#a8b2ad]" size={30} /><p className="mt-3 text-sm font-bold">Your cart is empty</p><p className="mt-1 text-xs text-[#87928c]">Choose a piece or box from the product list.</p></div></div>}
        </div>

        <div className="border-t border-[#e5eae7] bg-[#fbfcfb] p-5">
          {state.error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700" role="alert">{state.error}</p>}
          {state.success && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800" role="status"><div className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0" size={17} /><div><p className="text-xs font-extrabold">{state.success}</p><p className="mt-1 text-[11px]">Receipt {state.receiptNumber} · {money(state.totalAmount ?? 0)}{(state.changeAmount ?? 0) > 0 ? ` · Change ${money(state.changeAmount ?? 0)}` : ""}</p></div></div></div>}
          <div className="space-y-2"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-[#748078]">Merchandise subtotal</span><span className="font-bold">{money(subtotal)}</span></div><div className="flex items-center justify-between text-xs"><span className="font-semibold text-[#748078]">3% non-VAT percentage charge</span><span className="font-bold">{money(taxAmount)}</span></div><div className="flex items-center justify-between border-t border-[#dfe6e2] pt-3"><span className="text-sm font-semibold text-[#66756d]">Order total</span><span className="text-2xl font-black tracking-tight">{money(total)}</span></div></div>
          <button className="btn-primary mt-4 w-full justify-center py-3.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || !cart.length || (channel === "walk_in" ? (paymentMethod === "cash" ? cashReceived < total : paymentReference.trim().length < 4) : !orderReference.trim())} type="submit">{pending ? "Completing order…" : channel === "walk_in" ? `Complete ${paymentMethod === "gcash" ? "GCash" : "cash"} sale` : `Complete ${channels.find((item) => item.value === channel)?.label} order`}</button>
          <p className="mt-3 text-center text-[10px] leading-4 text-[#89958f]">Completing the order records the sale and deducts inventory immediately.</p>
        </div>
      </form>
    </div>
  );
}
