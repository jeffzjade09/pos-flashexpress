import { BarChart3, Boxes, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[#0c563f] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-40 -top-32 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -right-24 -top-16 h-64 w-64 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#0c563f] shadow-lg"><Boxes size={23} strokeWidth={2.4} /></div>
          <div><p className="text-xl font-extrabold tracking-tight">FlashPOS</p><p className="text-xs text-white/60">Inventory made simple</p></div>
        </div>
        <div className="relative max-w-xl pb-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-50"><Sparkles size={14} /> Built for growing stores</div>
          <h1 className="text-5xl font-black leading-[1.08] tracking-[-0.04em]">Know what&apos;s moving.<br />Know what&apos;s next.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-emerald-50/75">Track every piece, pack, and box from one calm workspace—without losing sight of today&apos;s sales.</p>
          <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><BarChart3 size={21} /><p className="mt-3 text-sm font-bold">Clear daily reports</p><p className="mt-1 text-xs leading-5 text-white/55">See sales and stock at a glance.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><ShieldCheck size={21} /><p className="mt-3 text-sm font-bold">Role-based access</p><p className="mt-1 text-xs leading-5 text-white/55">The right controls for every user.</p></div>
          </div>
        </div>
        <p className="relative text-xs text-white/40">FlashPOS • Secure store operations</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0f6b4f] text-white"><Boxes size={21} /></div>
            <p className="text-xl font-extrabold">FlashPOS</p>
          </div>
          <p className="eyebrow">Store workspace</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.035em] text-[#16271f]">Welcome back</h2>
          <p className="mt-3 text-[15px] leading-6 text-[#6b7972]">Sign in with the account provided by your administrator.</p>
          {!configured && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Setup required.</strong> Add your Supabase keys to <code>.env.local</code> before signing in.
            </div>
          )}
          <LoginForm />
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#87928d]"><ShieldCheck size={14} /> Protected by secure, role-based access</div>
        </div>
      </section>
    </main>
  );
}
