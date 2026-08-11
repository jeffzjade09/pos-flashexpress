import type { createClient } from "@/lib/supabase/server";

export type StoreSettings = {
  companyName: string;
  contactNumber: string | null;
  storeAddress: string | null;
  salesOfficerName: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DEFAULT_SETTINGS: StoreSettings = { companyName: "", contactNumber: null, storeAddress: null, salesOfficerName: null };

export async function fetchStoreSettings(supabase: SupabaseServerClient): Promise<StoreSettings> {
  const { data } = await supabase.from("store_settings").select("company_name, contact_number, store_address, sales_officer_name").eq("id", true).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    companyName: data.company_name,
    contactNumber: data.contact_number,
    storeAddress: data.store_address,
    salesOfficerName: data.sales_officer_name,
  };
}
