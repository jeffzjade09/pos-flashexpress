"use client";

import { useActionState, useState } from "react";
import { Building2, X } from "lucide-react";
import { updateStoreSettings, type SettingsState } from "@/app/dashboard/settings/actions";
import type { StoreSettings } from "@/lib/store-settings";

const initial: SettingsState = {};

export function StoreSettingsForm({ settings }: { settings: StoreSettings }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateStoreSettings, initial);

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)} type="button">
        <Building2 size={15} />Edit business info
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10251c]/50 p-4 backdrop-blur-sm">
          <div className="my-5 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e6ebe8] px-6 py-5">
              <h2 className="text-xl font-black">Business info</h2>
              <button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f1f4f2]" onClick={() => setOpen(false)} type="button" aria-label="Close"><X size={18} /></button>
            </div>
            <form action={action} className="p-6">
              <p className="mb-4 text-xs text-[#7d8a83]">Appears on the letterhead of every exported Purchase Order.</p>
              <div className="grid gap-4">
                <label className="text-xs font-bold"><span className="mb-1.5 block">Company name</span><input className="field text-sm" defaultValue={settings.companyName} name="companyName" required /></label>
                <label className="text-xs font-bold"><span className="mb-1.5 block">Contact number</span><input className="field text-sm" defaultValue={settings.contactNumber ?? ""} name="contactNumber" /></label>
                <label className="text-xs font-bold"><span className="mb-1.5 block">Store address</span><textarea className="field min-h-16 text-sm" defaultValue={settings.storeAddress ?? ""} name="storeAddress" placeholder="Complete store address" /></label>
                <label className="text-xs font-bold"><span className="mb-1.5 block">Sales officer</span><input className="field text-sm" defaultValue={settings.salesOfficerName ?? ""} name="salesOfficerName" /></label>
              </div>
              {state.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p>}
              {state.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{state.success}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setOpen(false)} type="button">Close</button>
                <button className="btn-primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
