// src/app/goals/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/supabase/client";
import { fetchStores, StoreRow } from "@/shared/db/stores";
import { fetchMonthlyGoal } from "@/shared/db/goals";
import { fetchDailyGoalsForMonthPublished, DailyGoalRow } from "@/shared/db/daily_goals";
import { fetchDailyActualsForRange, DailyActualRow } from "@/shared/db/actuals";
import { fetchHistoricalRange, HistoricalDailyRow } from "@/shared/db/historical_daily_sales";

function iso(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function ym(monthStartIso: string) {
  return monthStartIso.slice(0, 7);
}
function parseMonthStart(monthStartIso: string) {
  const y = Number(monthStartIso.slice(0, 4));
  const m = Number(monthStartIso.slice(5, 7)) - 1;
  return new Date(y, m, 1);
}
function nextMonthStart(monthStartIso: string) {
  const dt = parseMonthStart(monthStartIso);
  return iso(new Date(dt.getFullYear(), dt.getMonth() + 1, 1));
}
function daysInMonth(monthStartIso: string) {
  const dt = parseMonthStart(monthStartIso);
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
}
function money0(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function money2(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function int(n: number) {
  return n.toLocaleString();
}
function atv(sales: number, txns: number) {
  if (!txns) return 0;
  return sales / txns;
}
function isPastOrToday(dateIso: string) {
  const todayIso = iso(new Date());
  return dateIso <= todayIso;
}
function addYears(dateIso: string, yearsDelta: number) {
  const d = new Date(dateIso + "T00:00:00");
  return iso(new Date(d.getFullYear() + yearsDelta, d.getMonth(), d.getDate()));
}

const BORDER = "1px solid #e5e7eb";
const SHADOW = "0 1px 0 rgba(2,6,23,0.03), 0 14px 40px rgba(2,6,23,0.08)";
const PAGE_MAX = 1180;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type DayDetails = {
  dateIso: string;
  storeId: string;
  storeName: string;

  salesGoal: number;
  txnsGoal: number;

  salesActual: number;
  txnsActual: number; // also used for customer count if you don’t have a separate field yet

  lyDateIso: string;
  lySales: number;
  lyTxns: number;
};

export default function GoalsPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [monthStart, setMonthStart] = useState<string>(() => {
    const d = new Date();
    return iso(new Date(d.getFullYear(), d.getMonth(), 1));
  });

  const [monthlyNetSales, setMonthlyNetSales] = useState<number>(0);
  const [monthlyTxns, setMonthlyTxns] = useState<number>(0);

  const [dailyGoals, setDailyGoals] = useState<DailyGoalRow[]>([]);
  const [dailyActuals, setDailyActuals] = useState<DailyActualRow[]>([]);
  const [lyRows, setLyRows] = useState<HistoricalDailyRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayDetails | null>(null);

  const storeName = useMemo(() => stores.find((s) => s.store_id === storeId)?.store_name ?? storeId, [stores, storeId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/auth/login";
        return;
      }
      const rows = await fetchStores();
      setStores(rows);
      setStoreId(rows[0]?.store_id || "");
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      setMsg(null);
      try {
        // Monthly goal (store goal) — always source of truth for “Store Monthly Goals”
        const m = await fetchMonthlyGoal(storeId, monthStart);
        setMonthlyNetSales(Number(m?.net_sales_goal ?? 0));
        setMonthlyTxns(Number(m?.transactions_goal ?? 0));

        // Published daily goals for the month (forecast allocations)
        const goals = await fetchDailyGoalsForMonthPublished(storeId, monthStart);
        setDailyGoals(goals);

        // Actuals in-range (daily_actuals.business_date)
        const end = nextMonthStart(monthStart);
        const actuals = await fetchDailyActualsForRange(storeId, monthStart, end);
        setDailyActuals(actuals);

        // LY historical for same month window (historical_daily_sales.date)
        const dt = parseMonthStart(monthStart);
        const lyStart = iso(new Date(dt.getFullYear() - 1, dt.getMonth(), 1));
        const lyEnd = nextMonthStart(lyStart);
        const hist = await fetchHistoricalRange(storeId, lyStart, lyEnd);
        setLyRows(hist);
      } catch (e: any) {
        setMsg(e?.message || "Failed loading goals/actuals.");
      }
    })();
  }, [storeId, monthStart]);

  const dailyGoalsMap = useMemo(() => new Map(dailyGoals.map((r) => [r.goal_date, r])), [dailyGoals]);
  const dailyActualsMap = useMemo(() => new Map(dailyActuals.map((r) => [r.business_date, r])), [dailyActuals]);
  const lyMap = useMemo(() => new Map(lyRows.map((r) => [r.date, r])), [lyRows]);

  // Daily totals (true math of allocations shown)
  const dailyTotals = useMemo(() => {
    const s = dailyGoals.reduce((a, r) => a + Number(r.net_sales_goal ?? 0), 0);
    const t = dailyGoals.reduce((a, r) => a + Number(r.transactions_goal ?? 0), 0);
    return { sales: s, txns: t, atv: atv(s, t) };
  }, [dailyGoals]);

  const calendarCells = useMemo(() => {
    const first = parseMonthStart(monthStart);
    const dim = daysInMonth(monthStart);
    const firstDow = first.getDay();

    const out: Array<{ type: "blank" } | { type: "day"; dateIso: string; dayNum: number; dow: number }> = [];
    for (let i = 0; i < firstDow; i++) out.push({ type: "blank" });
    for (let d = 1; d <= dim; d++) {
      const dateIso = iso(new Date(first.getFullYear(), first.getMonth(), d));
      const dow = new Date(first.getFullYear(), first.getMonth(), d).getDay();
      out.push({ type: "day", dateIso, dayNum: d, dow });
    }
    while (out.length % 7 !== 0) out.push({ type: "blank" });
    return out;
  }, [monthStart]);

  function openDay(dateIso: string) {
    const goal = dailyGoalsMap.get(dateIso);
    const actual = dailyActualsMap.get(dateIso);

    const salesGoal = Number(goal?.net_sales_goal ?? 0);
    const txnsGoal = Number(goal?.transactions_goal ?? 0);

    const past = isPastOrToday(dateIso);
    const salesActual = past ? Number(actual?.net_sales_actual ?? 0) : 0;
    const txnsActual = past ? Number(actual?.transactions_actual ?? 0) : 0;

    const lyDateIso = addYears(dateIso, -1);
    const ly = lyMap.get(lyDateIso);

    const lySales = Number(ly?.net_sales ?? 0);
    const lyTxns = Number(ly?.transactions ?? 0);

    setSelectedDay({
      dateIso,
      storeId,
      storeName,
      salesGoal,
      txnsGoal,
      salesActual,
      txnsActual,
      lyDateIso,
      lySales,
      lyTxns,
    });
    setDrawerOpen(true);
  }

  function hitStatusColor(dateIso: string) {
    // Only show hit/miss for past/today when we have actuals
    if (!isPastOrToday(dateIso)) return null;

    const goal = dailyGoalsMap.get(dateIso);
    const actual = dailyActualsMap.get(dateIso);
    if (!goal || !actual) return null;

    const gSales = Number(goal.net_sales_goal ?? 0);
    const gTxns = Number(goal.transactions_goal ?? 0);
    const aSales = Number(actual.net_sales_actual ?? 0);
    const aTxns = Number(actual.transactions_actual ?? 0);

    // Use a simple combined rule: green if both met, red if either missed.
    const ok = aSales >= gSales && aTxns >= gTxns;
    return ok ? "#16a34a" : "#dc2626";
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, maxWidth: PAGE_MAX, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Goals</div>
          <h1 style={{ margin: 0 }}>Monthly Goals</h1>
          <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
            Past/today show actuals. Future days show goal allocations.
          </div>
        </div>
        <a href="/home">Home</a>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 420px", gap: 12, alignItems: "start" }}>
        {/* LEFT: Monthly + Daily Totals */}
        <div style={{ border: BORDER, borderRadius: 14, background: "white", padding: 14 }}>
          <div style={{ fontWeight: 1000, fontSize: 13 }}>Store Monthly Goals</div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <div style={{ border: BORDER, borderRadius: 12, padding: 12, background: "#f8fafc" }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>Sales</div>
              <div style={{ marginTop: 4, fontWeight: 1100 }}>{money0(monthlyNetSales)}</div>
            </div>
            <div style={{ border: BORDER, borderRadius: 12, padding: 12, background: "#f8fafc" }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>Txns</div>
              <div style={{ marginTop: 4, fontWeight: 1100 }}>{int(monthlyTxns)}</div>
            </div>
            <div style={{ border: BORDER, borderRadius: 12, padding: 12, background: "#f8fafc" }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>ATV</div>
              <div style={{ marginTop: 4, fontWeight: 1100 }}>{money2(atv(monthlyNetSales, monthlyTxns))}</div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontWeight: 1000, fontSize: 13 }}>Daily Totals</div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <div style={{ border: BORDER, borderRadius: 12, padding: 12, background: "#f8fafc" }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>Sales</div>
              <div style={{ marginTop: 4, fontWeight: 1100 }}>{money0(dailyTotals.sales)}</div>
            </div>
            <div style={{ border: BORDER, borderRadius: 12, padding: 12, background: "#f8fafc" }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>Txns</div>
              <div style={{ marginTop: 4, fontWeight: 1100 }}>{int(dailyTotals.txns)}</div>
            </div>
            <div style={{ border: BORDER, borderRadius: 12, padding: 12, background: "#f8fafc" }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 900 }}>ATV</div>
              <div style={{ marginTop: 4, fontWeight: 1100 }}>{money2(dailyTotals.atv)}</div>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>
            Note: Daily allocations can differ from the monthly goal. Monthly goal remains the official target.
          </div>

          {msg && (
            <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 800 }}>
              {msg}
            </div>
          )}
        </div>

        {/* RIGHT: Store + Month selectors */}
        <div style={{ border: BORDER, borderRadius: 14, background: "white", padding: 14 }}>
          <div style={{ fontWeight: 1000, fontSize: 13 }}>Store</div>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 12, border: BORDER, marginTop: 8 }}
          >
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id}>
                {s.store_id} — {s.store_name}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 12, fontWeight: 1000, fontSize: 13 }}>Month</div>
          <input
            type="month"
            value={ym(monthStart)}
            onChange={(e) => setMonthStart(`${e.target.value}-01`)}
            style={{ width: "100%", padding: 10, borderRadius: 12, border: BORDER, marginTop: 8 }}
          />

          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
            <div>{storeName}</div>
            <div>{ym(monthStart)}</div>
          </div>
        </div>
      </div>

      {/* CALENDAR */}
      <div style={{ marginTop: 12, border: BORDER, borderRadius: 14, background: "white", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#fafafa", borderBottom: "1px solid #eef2f7" }}>
          {DOW.map((d) => (
            <div key={d} style={{ padding: 12, fontWeight: 1000, fontSize: 12, color: "#334155" }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {calendarCells.map((c, idx) => {
            if (c.type === "blank") {
              return (
                <div
                  key={idx}
                  style={{
                    height: 108,
                    borderBottom: "1px solid #f1f5f9",
                    borderRight: idx % 7 !== 6 ? "1px solid #f1f5f9" : "none",
                    background: "white",
                  }}
                />
              );
            }

            const dateIso = c.dateIso;
            const goal = dailyGoalsMap.get(dateIso);
            const actual = dailyActualsMap.get(dateIso);

            const past = isPastOrToday(dateIso);

            const salesGoal = Number(goal?.net_sales_goal ?? 0);
            const txnsGoal = Number(goal?.transactions_goal ?? 0);

            const salesActual = past ? Number(actual?.net_sales_actual ?? 0) : 0;
            const txnsActual = past ? Number(actual?.transactions_actual ?? 0) : 0;

            // What the calendar shows:
            // - Past/today: actuals (if present), else $0 / 0
            // - Future: goals
            const showSales = past ? salesActual : salesGoal;
            const showTxns = past ? txnsActual : txnsGoal;
            const showAtv = atv(showSales, showTxns);

            const status = hitStatusColor(dateIso);

            return (
              <button
                key={idx}
                onClick={() => openDay(dateIso)}
                style={{
                  height: 108,
                  padding: 10,
                  textAlign: "left",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  borderRight: idx % 7 !== 6 ? "1px solid #f1f5f9" : "none",
                  background: "white",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {status && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: status,
                    }}
                  />
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontWeight: 1100 }}>{c.dayNum}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    {past ? "Actual" : "Goal"}
                  </div>
                </div>

                <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12 }}>{money0(showSales)}</div>
                <div style={{ marginTop: 2, fontSize: 12 }}>{int(showTxns)} txns</div>
                <div style={{ marginTop: 2, fontSize: 11, opacity: 0.75 }}>ATV {money2(showAtv)}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DRAWER */}
      {drawerOpen && selectedDay ? (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.42)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: 16,
            zIndex: 80,
            backdropFilter: "blur(3px)",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 96vw)",
              borderRadius: 16,
              background: "#ffffff",
              border: BORDER,
              boxShadow: SHADOW,
              overflow: "hidden",
              marginTop: 24,
            }}
          >
            <div style={{ padding: 14, borderBottom: "1px solid #eef2f7", background: "#fbfbfc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 1100, fontSize: 14 }}>
                    {selectedDay.storeName} • {selectedDay.dateIso}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, opacity: 0.75 }}>
                    Day details (Today vs LY)
                  </div>
                </div>

                <button
                  onClick={() => setDrawerOpen(false)}
                  style={{
                    padding: "9px 11px",
                    borderRadius: 12,
                    border: BORDER,
                    background: "white",
                    fontWeight: 1000,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: 16, background: "#f6f8fb" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* TODAY */}
                <div style={{ border: BORDER, borderRadius: 14, background: "white", padding: 14 }}>
                  <div style={{ fontWeight: 1100, fontSize: 12, opacity: 0.8, marginBottom: 10 }}>Today</div>

                  {metricCard("Sales Goal", money0(selectedDay.salesGoal))}
                  {metricCard("Sales Actual", money0(selectedDay.salesActual))}
                  {metricCard("Trans Forecast", int(selectedDay.txnsGoal))}
                  {metricCard("Customer Count", int(selectedDay.txnsActual))}
                  {metricCard("ATV Goal", money2(atv(selectedDay.salesGoal, selectedDay.txnsGoal)))}
                  {metricCard("Actual ATV", money2(atv(selectedDay.salesActual, selectedDay.txnsActual)))}
                </div>

                {/* LY */}
                <div style={{ border: BORDER, borderRadius: 14, background: "white", padding: 14 }}>
                  <div style={{ fontWeight: 1100, fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
                    <span>LY</span>{" "}
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{selectedDay.lyDateIso}</span>
                  </div>

                  // LY doesn’t have “goal” fields in your current model — show dashes for goal lines.
                  {metricCard("Sales Goal", "—")}
                  {metricCard("Sales Actual", selectedDay.lySales ? money0(selectedDay.lySales) : "$0")}
                  {metricCard("Trans Forecast", "—")}
                  {metricCard("Customer Count", int(selectedDay.lyTxns))}
                  {metricCard("ATV Goal", "—")}
                  {metricCard("Actual ATV", money2(atv(selectedDay.lySales, selectedDay.lyTxns)))}
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, opacity: 0.75 }}>
                Notes: Past/today show actuals on the calendar when injected. Future days show goal allocations.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function metricCard(label: string, value: string) {
  return (
    <div style={{ border: "1px solid #eef2f7", borderRadius: 14, padding: 12, background: "#ffffff", marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1100 }}>{value}</div>
    </div>
  );
}
