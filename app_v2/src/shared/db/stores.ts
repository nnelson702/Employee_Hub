import { supabase } from "@/shared/supabase/client";

export type StoreRow = {
  store_id: string;
  eagle_store_no: number | null;
  store_name: string;
  is_active: boolean;
};

export async function fetchStores(): Promise<StoreRow[]> {
  const { data, error } = await supabase
    .from("stores_v2")
    .select("store_id,eagle_store_no,store_name,is_active")
    .eq("is_active", true)
    .order("eagle_store_no", { ascending: true });

  if (error) throw error;
  return (data || []) as StoreRow[];
}
