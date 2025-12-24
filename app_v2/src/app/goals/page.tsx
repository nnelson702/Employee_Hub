"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/supabase/client";
import { fetchStores, StoreRow } from "@/shared/db/stores";
import { fetchMonthlyGoal } from "@/shared/db/goals";
import { DailyGoalRow, fetchDailyGoalsForMonthPublished } from "@/shared/db/daily_goals";
import { fetchDailyActualsForMonth, DailyActualRow } from "@/shared/db/actuals";
import { fetchHistoricalForRange, HistoricalDailyRow } from "@/shared/db/historical_daily_sales";

/** ---------------------------
 * Date helpers
 * --------------------------*/
function iso(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function parseMonthStart(monthStartIso: string) {
  const y = Number(monthStartIso.slice(0, 4));
  const m = Number(monthStartIso.slice(5, 7)) - 1;
  return new Date(y, m, 1);
}
function daysInMonth(monthStartIso: string) {
  const dt = parseMonthStart(monthStartIso);
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
}
function nextMonthStart(monthStartIso: string) {
  const dt = parseMonthStart(monthStartIso);
  return iso(new Date(dt.getFullYear(), dt.getMonth() + 1, 1));
}
function ym(monthStartIso: string) {
  return monthStartIso.slice(0, 7);
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
function sameOrBefore(aIso: string, bIso: string) {
  // ISO date strings compare lexicographically
  return aIso <= bIso;
}

/** ---------------------------
 * Styles
 * --------------------------*/
const BG = "#f6f8fb";
const CARD = "#ffffff";
const BORDER = "1px solid #e8edf4";
const SOFT_SHADOW = "0 1px 0 rgba(2,6,23,0.03), 0 10px 22px rgba(2,6,23,0.06)";
const ACE_RED = "#dc2626";
const ACE_GREEN = "#16a34a";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type DayCell = {
  date: string; // YYYY-MM-DD
  dayNum: number;
  dow: number;
};

type DrawerRow = {
  sales_goal: number;
  sales_actual: number;
  trans_forecast: number; // goal txns
  customer_count: number; // actual txns
  atv_goal: number;
  atv_actual: number;
};

export default function GoalsPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [monthStart, setMonthStart] = useState<string>(iso(firstOfMonth(new Date())));

  const [monthlyNetSales, setMonthlyNetSales] = useState<number>(0);
  const [monthlyTxns, setMonthlyTxns] = useState<number>(0);

  const [dailyGoals, setDailyGoals] = useState<DailyGoalRow[]>([]);
  const [dailyActuals, setDailyActuals] = useState<DailyActualRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDate, setDrawerDate] = useState<string>("");

  const [lyRow, setLyRow] = useState<HistoricalDailyRow | null>(null);

  const todayIso = useMemo(() => iso(new Date()), []);

  const storeName = useMemo(() => {
    return stores.find((s) => s.store_id === storeId)?.store_name ?? storeId;
  }, [stores, storeId]);

  const monthKey = useMemo(() => ym(monthStart), [monthStart]);

  // Calendar grid cells
  const calendarCells = useMemo(() => {
    const first = parseMonthStart(monthStart);
    const dim = daysInMonth(monthStart);
    const firstDow = first.getDay();

    const out: Array<{ type: "blank" } | { type: "day"; cell: DayCell }> = [];
    for (let i = 0; i < firstDow; i++) out.push({ type: "blank" });

    for (let d = 1; d <= dim; d++) {
      const dt = new Date(first.getFullYear(), first.getMonth(), d);
      out.push({
        type: "day",
        cell: { date: iso(dt), dayNum: d, dow: dt.getDay() },
      });
    }
    while (out.length % 7 !== 0) out.push({ type: "blank" });
    return out;
  }, [monthStart]);

  const goalsByDate = useMemo(() => {
    const m = new Map<string, DailyGoalRow>();
    for (const r of dailyGoals) m.set(r.goal_date, r);
    return m;
  }, [dailyGoals]);

  const actualsByDate = useMemo(() => {
    const m = new Map<string, DailyActualRow>();
    for (const r of dailyActuals) m.set(r.business_date, r);
    return m;
  }, [dailyActuals]);

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

  // Load monthly goal + published daily goals + actuals for month
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      setMsg(null);
      try {
        const mg = await fetchMonthlyGoal(storeId, monthStart);
        setMonthlyNetSales(Number(mg?.net_sales_goal ?? 0));
        setMonthlyTxns(Number(mg?.transactions_goal ?? 0));

        const dg = await fetchDailyGoalsForMonthPublished(storeId, monthStart);
        setDailyGoals(dg);

        const act = await fetchDailyActualsForMonth(storeId, monthStart);
        setDailyActuals(act);
      } catch (e: any) {
        setMsg(e.message || "Failed loading goals/actuals.");
      }
    })();
  }, [storeId, monthStart]);

  // Drawer: compute "today" side from goal+actual, and fetch LY
  const drawerLeft: DrawerRow | null = useMemo(() => {
    if (!drawerDate) return null;

    const g = goalsByDate.get(drawerDate);
    const a = actualsByDate.get(drawerDate);

    const salesGoal = Number(g?.net_sales_goal ?? 0);
    const txGoal = Number(g?.transactions_goal ?? 0);

    const salesActual = Number(a?.net_sales_actual ?? 0);
    const txActual = Number(a?.transactions_actual ?? 0);

    return {
      sales_goal: salesGoal,
      sales_actual: salesActual,
      trans_forecast: txGoal,
      customer_count: txActual,
      atv_goal: atv(salesGoal, txGoal),
      atv_actual: atv(salesActual, txActual),
    };
  }, [drawerDate, goalsByDate, actualsByDate]);

  const drawerLy: DrawerRow | null = useMemo(() => {
    if (!drawerDate) return null;
    if (!lyRow) {
      return {
        sales_goal: 0,
        sales_actual: 0,
        trans_forecast: 0,
        customer_count: 0,
        atv_goal: 0,
        atv_actual: 0,
      };
    }

    const sales = Number(lyRow.net_sales ?? 0);
    const tx = Number(lyRow.transactions ?? 0);

    return {
      sales_goal: 0,
      sales_actual: sales,
      trans_forecast: 0,
      customer_count: tx,
      atv_goal: 0,
      atv_actual: atv(sales, tx),
    };
  }, [drawerDate, lyRow]);

  const openDrawer = async (dateIso: string) => {
    setDrawerDate(dateIso);
    setDrawerOpen(true);
    setLyRow(null);

    try {
      const d = new Date(dateIso + "T00:00:00");
      const ly = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
      const lyStart = iso(ly);
      const lyEnd = iso(new Date(ly.getFullYear(), ly.getMonth(), ly.getDate() + 1));

      const rows = await fetchHistoricalForRange(lyStart, lyEnd, storeId);
      setLyRow(rows[0] ?? null);
    } catch {
      setLyRow(null);
    }
  };

  // Cell values: actuals for today/past, goals for future
  function cellDisplay(dateIso: string) {
    const g = goalsByDate.get(dateIso);
    const a = actualsByDate.get(dateIso);

    const isPastOrToday = sameOrBefore(dateIso, todayIso);

    const salesGoal = Number(g?.net_sales_goal ?? 0);
    const txGoal = Number(g?.transactions_goal ?? 0);

    const salesActual = Number(a?.net_sales_actual ?? 0);
    const txActual = Number(a?.transactions_actual ?? 0);

    const showActual = isPastOrToday && a; // only use actual if row exists

    const sales = showActual ? salesActual : salesGoal;
    const tx = showActual ? txActual : txGoal;

    // hit/miss indicator only for completed days with actuals present
    let status: "hit" | "miss" | "none" = "none";
    if (isPastOrToday && a) {
      status = salesActual >= salesGoal ? "hit" : "miss";
    }

    return {
      label: showActual ? "Actual" : "Goal",
      sales,
      tx,
      atv: atv(sales, tx),
      status,
    };
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: -0.3 }}>Goals</h1>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
            Past/today shows actuals when available. Future shows goal allocations.
          </div>
        </div>
        <a href="/home" style={{ fontWeight: 800 }}>
          Home
        </a>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: BORDER,
          borderRadius: 16,
          background: CARD,
          boxShadow: SOFT_SHADOW,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, alignItems: "start" }}>
          {/* LEFT: Monthly goal display (must be the saved monthly goal) */}
          <div style={{ border: BORDER, borderRadius: 16, background: "#fbfcfe", padding: 12 }}>
            <div style={{ fontWeight: 1100, fontSize: 13 }}>Store Monthly Goals</div>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { k: "Sales", v: money0(monthlyNetSales) },
                { k: "Txns", v: int(monthlyTxns) },
                { k: "ATV", v: money2(atv(monthlyNetSales, monthlyTxns)) },
              ].map((x) => (
                <div key={x.k} style={{ border: BORDER, borderRadius: 14, padding: 12, background: "white" }}>
                  <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>{x.k}</div>
                  <div style={{ marginTop: 4, fontSize: 14, fontWeight: 1200 }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Store/month controls */}
          <div style={{ border: BORDER, borderRadius: 16, background: "white", padding: 12 }}>
            <div style={{ fontWeight: 1100, marginBottom: 8 }}>Store</div>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 12, border: BORDER }}
            >
              {stores.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.store_id} — {s.store_name}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 12, fontWeight: 1100, marginBottom: 8 }}>Month</div>
            <input
              type="month"
              value={monthKey}
              onChange={(e) => setMonthStart(`${e.target.value}-01`)}
              style={{ width: "100%", padding: 10, borderRadius: 12, border: BORDER }}
            />

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
              {storeName} • {monthKey}
            </div>
          </div>
        </div>

        {msg ? (
          <div style={{ marginTop: 12, color: ACE_RED, fontWeight: 900 }}>
            {msg}
          </div>
        ) : null}

        {/* Calendar */}
        <div style={{ marginTop: 14, border: BORDER, borderRadius: 16, overflow: "hidden" }}>
          {/* DOW header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#fafafa", borderBottom: "1px solid #eef2f7" }}>
            {DOW.map((d) => (
              <div key={d} style={{ padding: 12, fontWeight: 1100, fontSize: 12, color: "#334155" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {calendarCells.map((c, idx) => {
              if (c.type === "blank") {
                return (
                  <div
                    key={idx}
                    style={{
                      height: 96,
                      borderBottom: "1px solid #f1f5f9",
                      borderRight: idx % 7 !== 6 ? "1px solid #f1f5f9" : "none",
                      background: "white",
                    }}
                  />
                );
              }

              const { date, dayNum } = c.cell;
              const disp = cellDisplay(date);

              const statusBar =
                disp.status === "hit"
                  ? ACE_GREEN
                  : disp.status === "miss"
                    ? ACE_RED
                    : "transparent";

              return (
                <button
                  key={date}
                  onClick={() => openDrawer(date)}
                  style={{
                    height: 96,
                    padding: 12,
                    textAlign: "left",
                    border: "none",
                    background: "white",
                    borderBottom: "1px solid #f1f5f9",
                    borderRight: idx % 7 !== 6 ? "1px solid #f1f5f9" : "none",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: statusBar,
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 1200 }}>{dayNum}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{disp.label}</div>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 1100 }}>
                    {money0(disp.sales)}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, opacity: 0.8 }}>
                    {int(disp.tx)} txns
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, opacity: 0.75 }}>
                    ATV {money2(disp.atv)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Note: Past/today shows actuals when injected. Future days show goal allocations.
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen ? (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.42)",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "flex-end",
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 96vw)",
              background: "white",
              borderLeft: BORDER,
              boxShadow: "0 0 0 1px rgba(2,6,23,0.05), 0 20px 60px rgba(2,6,23,0.25)",
              padding: 16,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 1300, fontSize: 16 }}>
                Daily Details • {storeName}
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{
                  padding: "8px 10px",
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

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
              {drawerDate}
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Left: Today */}
              <div style={{ border: BORDER, borderRadius: 16, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontWeight: 1200, marginBottom: 10 }}>Today</div>

                {drawerLeft ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <Card k="Sales Goal" v={money0(drawerLeft.sales_goal)} />
                    <Card k="Sales Actual" v={money0(drawerLeft.sales_actual)} />
                    <Card k="Trans Forecast" v={int(drawerLeft.trans_forecast)} />
                    <Card k="Customer Count" v={int(drawerLeft.customer_count)} />
                    <Card k="ATV Goal" v={money2(drawerLeft.atv_goal)} />
                    <Card k="Actual ATV" v={money2(drawerLeft.atv_actual)} />
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>No data.</div>
                )}
              </div>

              {/* Right: LY */}
              <div style={{ border: BORDER, borderRadius: 16, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontWeight: 1200, marginBottom: 2 }}>LY</div>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900, marginBottom: 10 }}>
                  {(() => {
                    if (!drawerDate) return "";
                    const d = new Date(drawerDate + "T00:00:00");
                    const ly = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
                    return iso(ly);
                  })()}
                </div>

                {drawerLy ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <Card k="Sales Goal" v="—" />
                    <Card k="Sales Actual" v={drawerLy.sales_actual ? money0(drawerLy.sales_actual) : "$0"} />
                    <Card k="Trans Forecast" v="—" />
                    <Card k="Customer Count" v={drawerLy.customer_count ? int(drawerLy.customer_count) : "0"} />
                    <Card k="ATV Goal" v="—" />
                    <Card k="Actual ATV" v={drawerLy.atv_actual ? money2(drawerLy.atv_actual) : "$0.00"} />
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>No LY data.</div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
              Notes: Past/today will show actuals on the calendar when injected. Future days show goal allocations.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ border: "1px solid #e8edf4", borderRadius: 14, padding: 12, background: "white" }}>
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 1000 }}>{k}</div>
      <div style={{ marginTop: 6, fontWeight: 1200, fontSize: 14 }}>{v}</div>
    </div>
  );
}
