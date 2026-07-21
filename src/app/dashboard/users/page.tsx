import { ShieldCheck, UserRound, Users } from "lucide-react";
import { CreateUserForm } from "@/components/create-user-form";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setUserRole, setUserStatus } from "./actions";

export default async function UsersPage() {
  const current = await requireSuperAdmin();
  const supabase = await createClient();
  const { data: users } = await supabase.from("profiles").select("id, full_name, role, is_active, created_at").order("created_at");

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Administration</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">Team & access</h1><p className="mt-2 text-sm text-[#718079]">Create employee accounts and control what each person can access.</p></div><CreateUserForm /></div>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><Users className="text-[#0f6b4f]" size={20} /><p className="mt-4 text-2xl font-black">{users?.length ?? 0}</p><p className="mt-1 text-xs font-semibold text-[#7c8982]">Total team members</p></div>
        <div className="card p-5"><UserRound className="text-[#4967ad]" size={20} /><p className="mt-4 text-2xl font-black">{users?.filter((user) => user.is_active).length ?? 0}</p><p className="mt-1 text-xs font-semibold text-[#7c8982]">Active accounts</p></div>
        <div className="card p-5"><ShieldCheck className="text-[#d4732e]" size={20} /><p className="mt-4 text-2xl font-black">{users?.filter((user) => user.role === "super_admin").length ?? 0}</p><p className="mt-1 text-xs font-semibold text-[#7c8982]">Super administrators</p></div>
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="border-b border-[#e5eae7] px-5 py-4"><h2 className="font-extrabold">Team members</h2><p className="mt-1 text-xs text-[#819087]">Your own super-admin account cannot be disabled here.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#e9eeeb] bg-[#fafcfa] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#87928c]"><th className="px-5 py-3.5">Team member</th><th className="px-5 py-3.5">Access level</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5 text-right">Controls</th></tr></thead><tbody>
          {(users ?? []).map((user) => <tr key={user.id} className="border-b border-[#edf0ee] last:border-0"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e6f1ec] text-sm font-black text-[#0f6b4f]">{user.full_name?.charAt(0).toUpperCase() || "U"}</span><div><p className="text-sm font-bold">{user.full_name || "Unnamed user"}{user.id === current.id && <span className="ml-2 text-[10px] font-extrabold text-[#0f6b4f]">YOU</span>}</p><p className="text-xs text-[#89948e]">Added {new Date(user.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p></div></div></td><td className="px-5 py-4"><form action={setUserRole} className="flex items-center gap-2"><input type="hidden" name="userId" value={user.id} /><select name="role" defaultValue={user.role} disabled={user.id === current.id} className="rounded-lg border border-[#dde4e0] bg-white px-2.5 py-2 text-xs font-bold capitalize disabled:bg-[#f5f7f6]"><option value="employee">Employee</option><option value="super_admin">Super admin</option></select>{user.id !== current.id && <button className="text-[10px] font-extrabold text-[#0f6b4f]">SAVE</button>}</form></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.is_active ? "ACTIVE" : "INACTIVE"}</span></td><td className="px-5 py-4 text-right"><form action={setUserStatus}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="active" value={String(!user.is_active)} /><button disabled={user.id === current.id} className="btn-secondary py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">{user.is_active ? "Deactivate" : "Activate"}</button></form></td></tr>)}
        </tbody></table></div>
      </div>
    </div>
  );
}
