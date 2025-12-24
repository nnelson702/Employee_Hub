import { supabase } from "@/shared/supabase/client";

export type HistoricalDailyRow = {
  store_id: string;
  date: string; // YYYY-MM-DD
  net_sales: number;
  transactions: number;
};

function toRow(r: any): HistoricalDailyRow {
  return {
    store_id: String(r.store_id),
    date: String(r.date),
    net_sales: Number(r.net_sales ?? 0),
    transactions: Number(r.transactions ?? 0),
  };
}

/**
 * Fetch historical rows for range [startIso, endIso) where end is exclusive.
 */
export async function fetchHistoricalForRange(
  startIso: string,
  endIsoExclusive: string,
  storeId?: string | null
): Promise<HistoricalDailyRow[]> {
  let q = supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .gte("date", startIso)
    .lt("date", endIsoExclusive);

  if (storeId) q = q.eq("store_id", storeId);

  const { data, error } = await q.order("date", { ascending: true });
  if (error) throw error;

  return (data ?? []).map(toRow);
}

/**
 * Convenience: fetch historical rows for a given monthStart (YYYY-MM-01).
 */
export async function fetchHistoricalForMonth(
  monthStartIso: string,
  storeId?: string | null
): Promise<HistoricalDailyRow[]> {
  const y = Number(monthStartIso.slice(0, 4));
  const m = Number(monthStartIso.slice(5, 7)) - 1;

  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const next = new Date(y, m + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

  return fetchHistoricalForRange(start, end, storeId);
}
