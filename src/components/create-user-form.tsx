"use client";

import { useActionState, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { createEmployee, type UserActionState } from "@/app/dashboard/users/actions";

const initialState: UserActionState = {};

export function CreateUserForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createEmployee, initialState);

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={17} />Add team member</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#10251c]/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between"><div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f3ee] text-[#0f6b4f]"><UserPlus size={19} /></span><h2 className="mt-4 text-xl font-black">Create a team account</h2><p className="mt-1 text-sm text-[#77847d]">The employee can sign in immediately.</p></div><button className="grid h-9 w-9 place-items-center rounded-lg text-[#7d8882] hover:bg-[#f2f5f3]" onClick={() => setOpen(false)} aria-label="Close"><X size={19} /></button></div>
            <form action={action} className="mt-6 space-y-4">
              <div><label className="mb-1.5 block text-xs font-bold" htmlFor="fullName">Full name</label><input className="field" id="fullName" name="fullName" placeholder="e.g. Maria Santos" required /></div>
              <div><label className="mb-1.5 block text-xs font-bold" htmlFor="newEmail">Email address</label><input className="field" id="newEmail" name="email" type="email" placeholder="maria@store.com" required /></div>
              <div><label className="mb-1.5 block text-xs font-bold" htmlFor="newPassword">Temporary password</label><input className="field" id="newPassword" name="password" type="password" minLength={8} placeholder="At least 8 characters" required /></div>
              <div><label className="mb-1.5 block text-xs font-bold" htmlFor="role">Access level</label><select className="field" id="role" name="role" defaultValue="employee"><option value="employee">Employee — inventory and sales</option><option value="super_admin">Super admin — full system access</option></select></div>
              {state.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error}</p>}
              {state.success && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{state.success}</p>}
              <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={pending} type="submit">{pending ? "Creating…" : "Create account"}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
