import { supabase } from "@/shared/supabase/client";

export type DailyActualRow = {
  store_id: string;
  business_date: string; // YYYY-MM-DD
  net_sales_actual: number;
  transactions_actual: number;
  source?: string | null;
  source_ref?: string | null;
  imported_at?: string | null;
};

function toRow(r: any): DailyActualRow {
  return {
    store_id: String(r.store_id),
    business_date: String(r.business_date),
    net_sales_actual: Number(r.net_sales_actual ?? 0),
    transactions_actual: Number(r.transactions_actual ?? 0),
    source: r.source ?? null,
    source_ref: r.source_ref ?? null,
    imported_at: r.imported_at ?? null,
  };
}

/**
 * Fetch actuals for a store for a date range [startIso, endIso) where end is exclusive.
 * Dates must be YYYY-MM-DD.
 */
export async function fetchDailyActualsForRange(
  storeId: string,
  startIso: string,
  endIsoExclusive: string
): Promise<DailyActualRow[]> {
  const { data, error } = await supabase
    .from("daily_actuals")
    .select("store_id,business_date,net_sales_actual,transactions_actual,source,source_ref,imported_at")
    .eq("store_id", storeId)
    .gte("business_date", startIso)
    .lt("business_date", endIsoExclusive)
    .order("business_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toRow);
}

/**
 * Fetch actuals for a store for the given monthStart (YYYY-MM-01).
 */
export async function fetchDailyActualsForMonth(
  storeId: string,
  monthStartIso: string
): Promise<DailyActualRow[]> {
  const y = Number(monthStartIso.slice(0, 4));
  const m = Number(monthStartIso.slice(5, 7)) - 1;
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const next = new Date(y, m + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

  return fetchDailyActualsForRange(storeId, start, end);
}
