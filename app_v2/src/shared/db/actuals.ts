import { supabase } from "../supabase/client";

export type DailyActualRow = {
  store_id: string; // text
  business_date: string; // YYYY-MM-DD
  net_sales_actual: number; // numeric
  transactions_actual: number; // int4
  source?: string | null;
  source_ref?: string | null;
  imported_at?: string | null; // timestamptz
  created_at?: string | null;
  updated_at?: string | null;
};

type FetchActualsParams = {
  storeId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDateExclusive: string; // YYYY-MM-DD exclusive
};

export async function fetchActualsForRange({
  storeId,
  startDate,
  endDateExclusive,
}: FetchActualsParams): Promise<DailyActualRow[]> {
  const { data, error } = await supabase
    .from("daily_actuals")
    .select(
      "store_id,business_date,net_sales_actual,transactions_actual,source,source_ref,imported_at,created_at,updated_at"
    )
    .eq("store_id", storeId)
    .gte("business_date", startDate)
    .lt("business_date", endDateExclusive)
    .order("business_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyActualRow[];
}

export async function fetchActualsForMonth(storeId: string, monthStart: string): Promise<DailyActualRow[]> {
  // monthStart = YYYY-MM-01
  const start = monthStart;
  const d = new Date(monthStart + "T00:00:00");
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const endExclusive = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(
    next.getDate()
  ).padStart(2, "0")}`;

  return fetchActualsForRange({ storeId, startDate: start, endDateExclusive: endExclusive });
}

export async function fetchActualForDay(storeId: string, businessDate: string): Promise<DailyActualRow | null> {
  const { data, error } = await supabase
    .from("daily_actuals")
    .select("store_id,business_date,net_sales_actual,transactions_actual,source,source_ref,imported_at")
    .eq("store_id", storeId)
    .eq("business_date", businessDate)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as DailyActualRow | null;
}
