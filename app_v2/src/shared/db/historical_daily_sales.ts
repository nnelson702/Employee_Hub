import { supabase } from "@/shared/supabase/client";

export type HistoricalDailyRow = {
  store_id: string;
  date: string; // YYYY-MM-DD
  net_sales: number;
  transactions: number;
};

export async function fetchActualsForMonth(storeId: string, monthStartIso: string) {
  const monthStart = new Date(monthStartIso + "T00:00:00");
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const from = monthStart.toISOString().slice(0, 10);
  const to = nextMonth.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .eq("store_id", storeId)
    .gte("date", from)
    .lt("date", to)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data || []) as HistoricalDailyRow[];
}

export async function fetchActualForDay(storeId: string, dayIso: string) {
  const { data, error } = await supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .eq("store_id", storeId)
    .eq("date", dayIso)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as HistoricalDailyRow | null;
}
