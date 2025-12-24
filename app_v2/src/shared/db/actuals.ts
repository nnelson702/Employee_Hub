// src/shared/db/actuals.ts
import { supabase } from "@/shared/supabase/client";

export type DailyActualRow = {
  store_id: string;
  business_date: string; // YYYY-MM-DD
  net_sales_actual: number;
  transactions_actual: number;
  customer_count?: number | null; // optional (if you add later)
  imported_at?: string | null;
  source?: string | null;
  source_ref?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function toRow(r: any): DailyActualRow {
  return {
    store_id: String(r.store_id),
    business_date: String(r.business_date),
    net_sales_actual: Number(r.net_sales_actual ?? 0),
    transactions_actual: Number(r.transactions_actual ?? 0),
    customer_count: r.customer_count == null ? null : Number(r.customer_count),
    imported_at: r.imported_at ?? null,
    source: r.source ?? null,
    source_ref: r.source_ref ?? null,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  };
}

/**
 * Fetch actuals for a store over [startIso, endIso) where business_date is YYYY-MM-DD.
 * IMPORTANT: daily_actuals uses business_date (NOT date).
 */
export async function fetchDailyActualsForRange(
  storeId: string,
  startIso: string,
  endIso: string
): Promise<DailyActualRow[]> {
  const { data, error } = await supabase
    .from("daily_actuals")
    .select(
      "store_id,business_date,net_sales_actual,transactions_actual,customer_count,imported_at,source,source_ref,created_at,updated_at"
    )
    .eq("store_id", storeId)
    .gte("business_date", startIso)
    .lt("business_date", endIso)
    .order("business_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toRow);
}

/**
 * Fetch one day of actuals (returns null if missing).
 */
export async function fetchDailyActualForDay(
  storeId: string,
  dateIso: string
): Promise<DailyActualRow | null> {
  const { data, error } = await supabase
    .from("daily_actuals")
    .select(
      "store_id,business_date,net_sales_actual,transactions_actual,customer_count,imported_at,source,source_ref,created_at,updated_at"
    )
    .eq("store_id", storeId)
    .eq("business_date", dateIso)
    .maybeSingle();

  if (error) throw error;
  return data ? toRow(data) : null;
}
