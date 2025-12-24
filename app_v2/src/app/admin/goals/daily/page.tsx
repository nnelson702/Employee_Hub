"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/supabase/client";
import { fetchStores, StoreRow } from "@/shared/db/stores";
import { fetchMonthlyGoal } from "@/shared/db/goals";

type DailyGoalRow = {
  store_id: string;
  goal_date: string; // YYYY-MM-DD
  net_sales_goal: number;
  transactions_goal: number;
  is_locked: boolean;
  is_published: boolean;
};

function toIsoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function parseMonthParam(monthParam: string | null) {
  // accepts "YYYY-MM-01" or "YYYY-MM"
  if (!monthParam) return firstOfMonth(new Date());
  if (monthParam.length === 7) return new Date(`${monthParam}-01T00:00:00`);
  return new Date(`${monthParam}T00:00:00`);
}

function startOfCalendarGrid(monthStart: Date) {
  const d = new Date(monthStart);
  const dow = d.getDay(); // 0 Sun
  d.setDate(d.getDate() - dow);
  return d;
}

export default function AdminDailyGoalsPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState("");
  const [monthStart, setMonthStart] = useState<Date>(firstOfMonth(new Date()));

  const [monthlySales, setMonthlySales] = useState<number>(0);
  const [monthlyTxns, setMonthlyTxns] = useState<number>(0);

  // map goal_date -> editable values
  const [cells, setCells] = useState<Record<string, { sales: number; txns: number }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // pull query params on load
  useEffect(() => {
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    const qStore = sp.get("store_id") || "";
    const qMonth = sp.get("month");
    const m = parseMonthParam(qMonth);

    setMonthStart(firstOfMonth(m));
    if (qStore) setStoreId(qStore);
  }, []);

  // auth + stores
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/auth/login";
        return;
      }
      const rows = await fetchStores();
      setStores(rows);
      // if storeId not set from query, default to first
      if (!storeId) setStoreId(rows[0]?.store_id || "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthStartIso = useMemo(() => toIsoDate(monthStart), [monthStart]);
  const monthEndIso = useMemo(() => toIsoDate(lastOfMonth(monthStart)), [monthStart]);

  const monthlyAtv = useMemo(() => {
    if (!monthlyTxns) return 0;
    return monthlySales / monthlyTxns;
  }, [monthlySales, monthlyTxns]);

  // load monthly goal + existing daily goals for month
  useEffect(() => {
    if (!storeId) return;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        // monthly goal
        const mg = await fetchMonthlyGoal(storeId, monthStartIso);
        setMonthlySales(mg?.net_sales_goal ?? 0);
        setMonthlyTxns(mg?.transactions_goal ?? 0);

        // daily goals for selected month only
        const { data, error } = await supabase
          .from("daily_goals")
          .select("store_id,goal_date,net_sales_goal,transactions_goal,is_locked,is_published")
          .eq("store_id", storeId)
          .gte("goal_date", monthStartIso)
          .lte("goal_date", monthEndIso);

        if (error) throw error;

        const next: Record<string, { sales: number; txns: number }> = {};
        (data || []).forEach((r: any) => {
          next[r.goal_date] = {
            sales: Number(r.net_sales_goal || 0),
            txns: Number(r.transactions_goal || 0),
          };
        });
        setCells(next);
      } catch (e: any) {
        setMsg(e.message || "Failed to load daily goals.");
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId, monthStartIso, monthEndIso]);

  // build grid dates (includes leading/trailing days but those are NOT editable/saved)
  const gridDates = useMemo(() => {
    const start = startOfCalendarGrid(monthStart);
    const end = new Date(lastOfMonth(monthStart));
    // extend to Saturday
    const endDow = end.getDay();
    const endPlus = new Date(end);
    endPlus.setDate(endPlus.getDate() + (6 - endDow));

    const out: Date[] = [];
    const cur = new Date(start);
    while (cur <= endPlus) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [monthStart]);

  const inMonth = (d: Date) => d.getMonth() === monthStart.getMonth() && d.getFullYear() === monthStart.getFullYear();

  const totals = useMemo(() => {
    let s = 0;
    let t = 0;
    for (const d of gridDates) {
      if (!inMonth(d)) continue;
      const key = toIsoDate(d);
      const v = cells[key];
      if (v) {
        s += Number(v.sales || 0);
        t += Number(v.txns || 0);
      }
    }
    const atv = t ? s / t : 0;
    return { s, t, atv };
  }, [cells, gridDates, monthStart]);

  const setCell = (dateIso: string, patch: Partial<{ sales: number; txns: number }>) => {
    setCells((prev) => {
      const cur = prev[dateIso] || { sales: 0, txns: 0 };
      return { ...prev, [dateIso]: { ...cur, ...patch } };
    });
  };

  const autoFillEven = () => {
    setMsg(null);
    const daysInMonth = lastOfMonth(monthStart).getDate();
    if (!daysInMonth) return;

    const perSales = monthlySales ? monthlySales / daysInMonth : 0;
    const perTxns = monthlyTxns ? Math.round(monthlyTxns / daysInMonth) : 0;

    const next: Record<string, { sales: number; txns: number }> = { ...cells };
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const iso = toIsoDate(d);
      next[iso] = { sales: Number(perSales.toFixed(2)), txns: perTxns };
    }
    setCells(next);
  };

  const saveDaily = async () => {
    setMsg(null);
    try {
      const daysInMonth = lastOfMonth(monthStart).getDate();
      const rows: DailyGoalRow[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
        const iso = toIsoDate(d);
        const v = cells[iso] || { sales: 0, txns: 0 };
        rows.push({
          store_id: storeId,
          goal_date: iso,
          net_sales_goal: Number(v.sales || 0),
          transactions_goal: Number(v.txns || 0),
          is_locked: false,     // IMPORTANT: never null
          is_published: true,   // you can change this later if you want a separate publish step
        });
      }

      const { error } = await supabase
        .from("daily_goals")
        .upsert(rows as any, { onConflict: "store_id,goal_date" });

      if (error) throw error;
      setMsg("Saved daily goals.");
    } catch (e: any) {
      setMsg(e.message || "Save failed.");
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin • Goals • Daily</h1>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Monthly ATV: <b>${monthlyAtv.toFixed(2)}</b>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/admin/goals" style={{ textDecoration: "none" }}>Back to Monthly</a>
          <a href="/home" style={{ textDecoration: "none" }}>Home</a>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Store</div>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ width: "100%", padding: 10 }}>
              {stores.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.store_id} — {s.store_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Month</div>
            <input
              type="month"
              value={`${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`}
              onChange={(e) => setMonthStart(firstOfMonth(new Date(`${e.target.value}-01T00:00:00`)))}
              style={{ width: "100%", padding: 10 }}
            />
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={autoFillEven} style={{ padding: "10px 14px" }}>
            Auto-fill (even split from monthly)
          </button>
          <button onClick={saveDaily} style={{ padding: "10px 14px" }}>
            Save Daily Goals
          </button>

          <div style={{ marginLeft: "auto", fontWeight: 600 }}>
            Totals: ${totals.s.toFixed(2)} / {totals.t} txns / ATV ${totals.atv.toFixed(2)}
          </div>
        </div>

        {msg && <div style={{ marginTop: 10, color: msg.includes("Saved") ? "green" : "crimson" }}>{msg}</div>}
      </div>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Daily Goals Calendar (edit Sales + Txns)</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 8, fontWeight: 700, opacity: 0.8 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} style={{ textAlign: "left" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
          {gridDates.map((d) => {
            const iso = toIsoDate(d);
            const isIn = inMonth(d);
            const v = cells[iso] || { sales: 0, txns: 0 };
            const atv = v.txns ? v.sales / v.txns : 0;

            return (
              <div
                key={iso}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 105,
                  background: isIn ? "white" : "#fafafa",
                  opacity: isIn ? 1 : 0.55,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{iso}</div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    disabled={!isIn}
                    value={Number(v.sales || 0).toFixed(2)}
                    onChange={(e) => setCell(iso, { sales: Number(e.target.value || 0) })}
                    style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #eee" }}
                  />
                  <input
                    disabled={!isIn}
                    value={String(v.txns || 0)}
                    onChange={(e) => setCell(iso, { txns: Number(e.target.value || 0) })}
                    style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #eee" }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.75 }}>ATV: ${atv.toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
