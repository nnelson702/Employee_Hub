import { supabase } from "@/shared/supabase/client";

export type MonthlyGoalRow = {
  store_id: string;
  month_start: string; // YYYY-MM-01
  net_sales_goal: number;
  transactions_goal: number;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DailyGoalRow = {
  store_id: string;
  goal_date: string; // YYYY-MM-DD
  net_sales_goal: number;
  transactions_goal: number;
  is_locked: boolean;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
};

function addMonths(dateIsoYYYYMMDD: string, months: number) {
  const y = Number(dateIsoYYYYMMDD.slice(0, 4));
  const m = Number(dateIsoYYYYMMDD.slice(5, 7)) - 1;
  const d = Number(dateIsoYYYYMMDD.slice(8, 10));
  const dt = new Date(y, m, d);
  dt.setMonth(dt.getMonth() + months);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchMonthlyGoal(storeId: string, monthStartIso: string): Promise<MonthlyGoalRow | null> {
  const { data, error } = await supabase
    .from("monthly_goals")
    .select("store_id,month_start,net_sales_goal,transactions_goal,is_published,created_at,updated_at")
    .eq("store_id", storeId)
    .eq("month_start", monthStartIso)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    store_id: data.store_id,
    month_start: data.month_start,
    net_sales_goal: Number(data.net_sales_goal ?? 0),
    transactions_goal: Number(data.transactions_goal ?? 0),
    is_published: Boolean(data.is_published),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function upsertMonthlyGoal(row: MonthlyGoalRow): Promise<void> {
  const payload = {
    store_id: row.store_id,
    month_start: row.month_start,
    net_sales_goal: row.net_sales_goal,
    transactions_goal: row.transactions_goal,
    is_published: row.is_published,
  };

  const { error } = await supabase
    .from("monthly_goals")
    .upsert(payload, { onConflict: "store_id,month_start" });

  if (error) throw error;
}

/**
 * IMPORTANT: load all daily goals in the selected month by goal_date range.
 * This fixes the common bug where only goal_date = 'YYYY-MM-01' shows up.
 */
export async function fetchDailyGoalsForMonth(storeId: string, monthStartIso: string): Promise<DailyGoalRow[]> {
  const monthStart = monthStartIso; // YYYY-MM-01
  const nextMonthStart = addMonths(monthStartIso, 1);

  const { data, error } = await supabase
    .from("daily_goals")
    .select("store_id,goal_date,net_sales_goal,transactions_goal,is_locked,is_published,created_at,updated_at")
    .eq("store_id", storeId)
    .gte("goal_date", monthStart)
    .lt("goal_date", nextMonthStart)
    .order("goal_date", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    store_id: r.store_id,
    goal_date: r.goal_date,
    net_sales_goal: Number(r.net_sales_goal ?? 0),
    transactions_goal: Number(r.transactions_goal ?? 0),
    is_locked: Boolean(r.is_locked),
    is_published: Boolean(r.is_published),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function upsertDailyGoals(rows: DailyGoalRow[]): Promise<void> {
  if (!rows.length) return;

  const payload = rows.map((r) => ({
    store_id: r.store_id,
    goal_date: r.goal_date,
    net_sales_goal: r.net_sales_goal,
    transactions_goal: r.transactions_goal,
    is_locked: r.is_locked,
    is_published: r.is_published,
  }));

  const { error } = await supabase
    .from("daily_goals")
    .upsert(payload, { onConflict: "store_id,goal_date" });

  if (error) throw error;
}
