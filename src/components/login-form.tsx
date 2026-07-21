"use client";

import { useActionState } from "react";
import { Eye, LockKeyhole, Mail } from "lucide-react";
import { login, type LoginState } from "@/app/auth/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label className="mb-2 block text-sm font-semibold text-[#34453d]" htmlFor="email">Email address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#829089]" size={18} />
          <input className="field with-left-icon" id="email" name="email" type="email" autoComplete="email" placeholder="you@store.com" required />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-[#34453d]" htmlFor="password">Password</label>
          <span className="text-xs font-medium text-[#738078]">Contact your administrator</span>
        </div>
        <div className="relative">
          <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-[#829089]" size={18} />
          <input className="field with-both-icons" id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
          <Eye className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a1aaa5]" size={18} />
        </div>
      </div>
      {state.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>
      )}
      <button className="btn-primary h-12 w-full" disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in to FlashPOS"}
      </button>
    </form>
  );
}
