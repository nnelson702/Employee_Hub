// src/shared/db/historical_daily_sales.ts
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
 * Fetch historical rows for a store over [startIso, endIso)
 */
export async function fetchHistoricalRange(
  storeId: string,
  startIso: string,
  endIso: string
): Promise<HistoricalDailyRow[]> {
  const { data, error } = await supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .eq("store_id", storeId)
    .gte("date", startIso)
    .lt("date", endIso)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toRow);
}

/**
 * Fetch one historical day (LY lookup). Returns null if missing.
 */
export async function fetchHistoricalDay(
  storeId: string,
  dateIso: string
): Promise<HistoricalDailyRow | null> {
  const { data, error } = await supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .eq("store_id", storeId)
    .eq("date", dateIso)
    .maybeSingle();

  if (error) throw error;
  return data ? toRow(data) : null;
}
