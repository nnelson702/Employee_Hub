import { supabase } from "@/shared/supabase/client";

export type DailyGoalRow = {
  store_id: string;
  goal_date: string; // YYYY-MM-DD
  transactions_goal: number;
  net_sales_goal: number;
};

export async function fetchDailyGoalsForMonth(storeId: string, monthStart: string) {
  // monthStart = YYYY-MM-01
  const start = monthStart;
  const end = nextMonthStart(monthStart);

  const { data, error } = await supabase
    .from("daily_goals")
    .select("*")
    .eq("store_id", storeId)
    .gte("goal_date", start)
    .lt("goal_date", end)
    .order("goal_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyGoalRow[];
}

export async function upsertDailyGoals(rows: DailyGoalRow[]) {
  if (!rows.length) return;

  // Requires unique constraint on (store_id, goal_date)
  const { error } = await supabase.from("daily_goals").upsert(rows, {
    onConflict: "store_id,goal_date",
  });

  if (error) throw error;
}

function nextMonthStart(monthStart: string) {
  const [y, m] = monthStart.split("-").map((v) => Number(v));
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return toIsoDate(d);
}

function toIsoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
