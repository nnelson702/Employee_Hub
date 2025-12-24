import { supabase } from "@/shared/supabase/client";

export type DailyGoalRow = {
  store_id: string;
  goal_date: string; // YYYY-MM-DD
  net_sales_goal: number | null;
  transactions_goal: number | null;
  is_locked: boolean;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
};

function iso(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseMonthStart(monthStartIso: string) {
  const y = Number(monthStartIso.slice(0, 4));
  const m = Number(monthStartIso.slice(5, 7)) - 1;
  return new Date(y, m, 1);
}

function monthBounds(monthStartIso: string) {
  // Always use real month boundaries (NO YYYY-MM-32)
  const startDt = parseMonthStart(monthStartIso);
  const start = iso(startDt);
  const end = iso(new Date(startDt.getFullYear(), startDt.getMonth() + 1, 1));
  return { start, end };
}

export async function fetchDailyGoalsForMonthAdmin(storeId: string, monthStartIso: string) {
  // Admin can see draft + published
  const { start, end } = monthBounds(monthStartIso);

  const { data, error } = await supabase
    .from("daily_goals")
    .select("store_id,goal_date,net_sales_goal,transactions_goal,is_locked,is_published,created_at,updated_at")
    .eq("store_id", storeId)
    .gte("goal_date", start)
    .lt("goal_date", end)
    .order("goal_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyGoalRow[];
}

export async function fetchDailyGoalsForMonthPublished(storeId: string, monthStartIso: string) {
  // Store users should only see published
  const { start, end } = monthBounds(monthStartIso);

  const { data, error } = await supabase
    .from("daily_goals")
    .select("store_id,goal_date,net_sales_goal,transactions_goal,is_locked,is_published")
    .eq("store_id", storeId)
    .eq("is_published", true)
    .gte("goal_date", start)
    .lt("goal_date", end)
    .order("goal_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyGoalRow[];
}

export async function upsertDailyGoals(
  rows: Array<{
    store_id: string;
    goal_date: string;
    net_sales_goal: number;
    transactions_goal: number;
    is_locked?: boolean;
    is_published?: boolean;
  }>
) {
  const payload = rows.map((r) => ({
    store_id: r.store_id,
    goal_date: r.goal_date,
    net_sales_goal: r.net_sales_goal,
    transactions_goal: r.transactions_goal,
    is_locked: r.is_locked ?? false,
    is_published: r.is_published ?? false,
  }));

  const { error } = await supabase.from("daily_goals").upsert(payload, { onConflict: "store_id,goal_date" });
  if (error) throw error;
}

export async function setDailyGoalsPublishedForMonth(storeId: string, monthStartIso: string, published: boolean) {
  const { start, end } = monthBounds(monthStartIso);

  const { error } = await supabase
    .from("daily_goals")
    .update({ is_published: published })
    .eq("store_id", storeId)
    .gte("goal_date", start)
    .lt("goal_date", end);

  if (error) throw error;
}

/**
 * If you ever get: "there is no unique constraint matching given keys for referenced table"
 * for daily_goals upsert, run this ONCE:
 *
 * alter table public.daily_goals
 *   add constraint daily_goals_store_id_goal_date_key unique (store_id, goal_date);
 */
