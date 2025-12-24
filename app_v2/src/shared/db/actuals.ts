// src/shared/db/actuals.ts
import { supabase } from "@/shared/supabase/client";

export type DailyActualRow = {
  store_id: string;
  date: string; // YYYY-MM-DD
  net_sales_actual: number;
  transactions_actual: number;
  updated_at?: string | null;
};

function toRow(r: any): DailyActualRow {
  return {
    store_id: String(r.store_id),
    date: String(r.date),
    net_sales_actual: Number(r.net_sales_actual ?? 0),
    transactions_actual: Number(r.transactions_actual ?? 0),
    updated_at: r.updated_at ?? null,
  };
}

export async function fetchDailyActualsForRange(
  storeId: string,
  startIso: string, // inclusive
  endIsoExclusive: string // exclusive
): Promise<DailyActualRow[]> {
  const { data, error } = await supabase
    .from("daily_actuals")
    .select("store_id,date,net_sales_actual,transactions_actual,updated_at")
    .eq("store_id", storeId)
    .gte("date", startIso)
    .lt("date", endIsoExclusive)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function fetchDailyActualForDay(storeId: string, dateIso: string): Promise<DailyActualRow | null> {
  const { data, error } = await supabase
    .from("daily_actuals")
    .select("store_id,date,net_sales_actual,transactions_actual,updated_at")
    .eq("store_id", storeId)
    .eq("date", dateIso)
    .maybeSingle();

  if (error) throw error;
  return data ? toRow(data) : null;
}

export async function upsertDailyActuals(rows: DailyActualRow[]) {
  // Requires unique constraint on (store_id, date)
  const payload = rows.map((r) => ({
    store_id: r.store_id,
    date: r.date,
    net_sales_actual: Number(r.net_sales_actual ?? 0),
    transactions_actual: Math.max(0, Math.round(Number(r.transactions_actual ?? 0))),
  }));

  const { error } = await supabase.from("daily_actuals").upsert(payload, {
    onConflict: "store_id,date",
  });

  if (error) throw error;
}
