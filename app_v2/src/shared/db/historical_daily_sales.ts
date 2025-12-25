import { supabase } from "../supabase/client";

export type HistoricalDailyRow = {
  store_id: string; // text
  date: string; // YYYY-MM-DD
  net_sales: number; // numeric
  transactions: number; // int4
};

type FetchHistParams = {
  storeId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDateExclusive: string; // YYYY-MM-DD exclusive
};

export async function fetchHistoricalForRange({
  storeId,
  startDate,
  endDateExclusive,
}: FetchHistParams): Promise<HistoricalDailyRow[]> {
  const { data, error } = await supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .eq("store_id", storeId)
    .gte("date", startDate)
    .lt("date", endDateExclusive)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as HistoricalDailyRow[];
}

export async function fetchHistoricalForMonth(storeId: string, monthStart: string): Promise<HistoricalDailyRow[]> {
  const start = monthStart;
  const d = new Date(monthStart + "T00:00:00");
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const endExclusive = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
    next.getDate()
  ).padStart(2, "0")}`;

  return fetchHistoricalForRange({ storeId, startDate: start, endDateExclusive: endExclusive });
}

export async function fetchHistoricalForDay(storeId: string, dateIso: string): Promise<HistoricalDailyRow | null> {
  const { data, error } = await supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .eq("store_id", storeId)
    .eq("date", dateIso)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as HistoricalDailyRow | null;
}
