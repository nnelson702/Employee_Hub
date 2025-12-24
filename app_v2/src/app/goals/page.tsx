// src/app/goals/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/supabase/client";
import { fetchStores, StoreRow } from "@/shared/db/stores";
import { fetchDailyGoalsForMonthPublished, DailyGoalRow } from "@/shared/db/daily_goals";
import { fetchMonthlyGoal, MonthlyGoalRow } from "@/shared/db/goals";
import { fetchDailyActualsForRange, DailyActualRow } from "@/shared/db/actuals";

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
function nextMonthStart(monthStartIso: string) {
  const dt = parseMonthStart(monthStartIso);
  return iso(new Date(dt.getFullYear(), dt.getMonth() + 1, 1));
}
function daysInMonth(monthStartIso: string) {
  const dt = parseMonthStart(monthStartIso);
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
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
function pct2(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}
function atv(sales: number, txns: number) {
  if (!txns) return 0;
  return sales / txns;
}
function isPastOrToday(dateIso: string) {
  const todayIso = iso(new Date());
  return dateIso <= todayIso;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type HistRow = {
  store_id: string;
  date: string; // YYYY-MM-DD
  net_sales: number;
  transactions: number;
};

async function fetchHistoricalForRange(startIso: string, endIsoExclusive: string, storeId?: string) {
  let q = supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .gte("date", startIso)
    .lt("date", endIsoExclusive);

  if (storeId) q = q.eq("store_id", storeId);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    store_id: String(r.store_id),
    date: String(r.date),
    net_sales: Number(r.net_sales ?? 0),
    transactions: Number(r.transactions ?? 0),
  })) as HistRow[];
}

type DayCell = {
  date: string;
  dayNum: number;
  dow: number;
};

function goalHitIndicator(
  dateIso: string,
  goalSales: number,
  goalTxns: number,
  actSales: number,
  actTxns: number
): "none" | "hit" | "miss" {
  if (!isPastOrToday(dateIso)) return "none";
  if ((actSales ?? 0) <= 0 && (actTxns ?? 0) <= 0) return "none"; // no actuals injected yet
  const hitSales = Number(actSales ?? 0) >= Number(goalSales ?? 0);
  const hitTxns = Number(actTxns ?? 0) >= Number(goalTxns ?? 0);
  return hitSales && hitTxns ? "hit" : "miss";
}

export default function GoalsPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [monthStart, setMonthStart] = useState<string>(iso(firstOfMonth(new Date())));

  const [monthlyGoal, setMonthlyGoal] = useState<MonthlyGoalRow | null>(null);
  const [goals, setGoals] = useState<DailyGoalRow[]>([]);
  const [actuals, setActuals] = useState<DailyActualRow[]>([]);
  const [ly, setLy] = useState<HistRow[]>([]);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const monthKey = useMemo(() => ym(monthStart), [monthStart]);

  const storeName = useMemo(() => {
    return stores.find((s) => s.store_id === storeId)?.store_name ?? storeId;
  }, [stores, storeId]);

  const goalsByDate = useMemo(() => new Map(goals.map((g) => [g.goal_date, g])), [goals]);
  const actualsByDate = useMemo(() => new Map(actuals.map((a) => [a.date, a])), [actuals]);

  // Map LY rows by their LY date (YYYY-MM-DD in LY month)
  const lyByDate = useMemo(() => new Map(ly.map((r) => [r.date, r])), [ly]);

  const calendar = useMemo(() => {
    const first = parseMonthStart(monthStart);
    const dim = daysInMonth(monthStart);
    const firstDow = first.getDay();

    const out: Array<{ type: "blank" } | { type: "day"; cell: DayCell }> = [];
    for (let i = 0; i < firstDow; i++) out.push({ type: "blank" });

    for (let d = 1; d <= dim; d++) {
      const date = iso(new Date(first.getFullYear(), first.getMonth(), d));
      out.push({
        type: "day",
        cell: { date, dayNum: d, dow: new Date(first.getFullYear(), first.getMonth(), d).getDay() },
      });
    }
    while (out.length % 7 !== 0) out.push({ type: "blank" });
    return out;
  }, [monthStart]);

  const dailyTotals = useMemo(() => {
    const sales = goals.reduce((a, g) => a + Number(g.net_sales_goal ?? 0), 0);
    const txns = goals.reduce((a, g) => a + Number(g.transactions_goal ?? 0), 0);
    return { sales, txns, atv: atv(sales, txns) };
  }, [goals]);

  const mtdActuals = useMemo(() => {
    const sales = actuals.reduce((a, r) => a + Number(r.net_sales_actual ?? 0), 0);
    const txns = actuals.reduce((a, r) => a + Number(r.transactions_actual ?? 0), 0);
    return { sales, txns, atv: atv(sales, txns) };
  }, [actuals]);

  const monthTxSum = useMemo(
    () => goals.reduce((a, g) => a + Number(g.transactions_goal ?? 0), 0) || 0,
    [goals]
  );

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          window.location.href = "/auth/login";
          return;
        }
        const rows = await fetchStores();
        setStores(rows);
        setStoreId(rows[0]?.store_id || "");
        setLoading(false);
      } catch (e: any) {
        setMsg(e.message || "Failed to load.");
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!storeId) return;

    (async () => {
      setMsg(null);
      setLoading(true);
      try {
        const start = monthStart;
        const end = nextMonthStart(monthStart);

        // Monthly goal (authoritative monthly goal)
        const mg = await fetchMonthlyGoal(storeId, start);
        setMonthlyGoal(mg ?? null);

        // Published daily allocations (what the store sees)
        const g = await fetchDailyGoalsForMonthPublished(storeId, start);
        setGoals(g);

        // Actuals (optional / may fail if table not created or RLS blocks)
        try {
          const a = await fetchDailyActualsForRange(storeId, start, end);
          setActuals(a);
        } catch (e: any) {
          // Don't break goals page if actuals pipeline isn't ready yet
          setActuals([]);
          const em = String(e?.message ?? "");
          if (em.toLowerCase().includes("daily_actuals")) {
            setMsg((prev) => prev ?? "Actuals are not available yet (daily_actuals not ready / not accessible).");
          } else {
            setMsg((prev) => prev ?? "Actuals could not be loaded yet.");
          }
        }

        // LY range
        const dt = parseMonthStart(monthStart);
        const lyStart = iso(new Date(dt.getFullYear() - 1, dt.getMonth(), 1));
        const lyEnd = nextMonthStart(lyStart);

        const lyRows = await fetchHistoricalForRange(lyStart, lyEnd, storeId);
        setLy(lyRows);
      } catch (e: any) {
        setMsg(e.message || "Failed to load goals.");
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId, monthStart]);

  const openDrawerForDate = async (dateIso: string) => {
    setDrawerBusy(true);
    try {
      setSelectedDate(dateIso);
      setDrawerOpen(true);
    } finally {
      setDrawerBusy(false);
    }
  };

  const selectedLyDate = useMemo(() => {
    if (!selectedDate) return "";
    const d = new Date(selectedDate + "T00:00:00");
    const lyD = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    return iso(lyD);
  }, [selectedDate]);

  const selectedGoal = useMemo(
    () => (selectedDate ? goalsByDate.get(selectedDate) : undefined),
    [selectedDate, goalsByDate]
  );
  const selectedActual = useMemo(
    () => (selectedDate ? actualsByDate.get(selectedDate) : undefined),
    [selectedDate, actualsByDate]
  );
  const selectedLy = useMemo(
    () => (selectedLyDate ? lyByDate.get(selectedLyDate) : undefined),
    [selectedLyDate, lyByDate]
  );

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  const BORDER = "1px solid #e8edf4";
  const BG = "#f6f8fb";
  const CARD = "#ffffff";
  const SOFT = "0 1px 0 rgba(2,6,23,0.03), 0 10px 22px rgba(2,6,23,0.06)";
  const ACE_RED = "#dc2626";
  const HIT_GREEN = "#16a34a";

  const monthlySalesGoal = Number(monthlyGoal?.net_sales_goal ?? 0);
  const monthlyTxGoal = Number(monthlyGoal?.transactions_goal ?? 0);
  const monthlyAtvGoal = atv(monthlySalesGoal, monthlyTxGoal);

  return (
    <div style={{ padding: 18, maxWidth: 1220, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Goals</div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: -0.3 }}>{storeName}</h1>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
            Past/today shows actuals (when injected). Future shows goal allocations.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: BORDER, background: "white", minWidth: 240 }}
          >
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id}>
                {s.store_id} — {s.store_name}
              </option>
            ))}
          </select>

          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthStart(`${e.target.value}-01`)}
            style={{ padding: "10px 12px", borderRadius: 12, border: BORDER, background: "white" }}
          />
        </div>
      </div>

      {msg ? (
        <div style={{ marginTop: 10, color: ACE_RED, fontWeight: 800 }}>{msg}</div>
      ) : null}

      {/* Top summary */}
      <div
        style={{
          marginTop: 14,
          border: BORDER,
          borderRadius: 16,
          background: CARD,
          boxShadow: SOFT,
          padding: 14,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 1100, fontSize: 13, opacity: 0.85 }}>Store Monthly Goal (authoritative)</div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>Sales Goal</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{money0(monthlySalesGoal)}</div>
              </div>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>Txns Goal</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{int(monthlyTxGoal)}</div>
              </div>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>ATV Goal</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{money2(monthlyAtvGoal)}</div>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
              Daily allocations are a planning distribution and may not match the monthly goal exactly.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 1100, fontSize: 13, opacity: 0.85 }}>Daily Allocation Totals + MTD Actuals</div>

            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>Daily Sales Total</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{money0(dailyTotals.sales)}</div>
              </div>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>Daily Txns Total</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{int(dailyTotals.txns)}</div>
              </div>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>Daily ATV</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{money2(dailyTotals.atv)}</div>
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>MTD Sales Actual</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{money0(mtdActuals.sales)}</div>
              </div>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>MTD Customer Count</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{int(mtdActuals.txns)}</div>
              </div>
              <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "#fbfcfe" }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>MTD Actual ATV</div>
                <div style={{ marginTop: 4, fontWeight: 1200 }}>{money2(mtdActuals.atv)}</div>
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", fontSize: 11, opacity: 0.7, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: HIT_GREEN, display: "inline-block" }} />
                Hit goal (sales + txns)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: ACE_RED, display: "inline-block" }} />
                Missed goal (sales or txns)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div
        style={{
          marginTop: 12,
          border: BORDER,
          borderRadius: 16,
          background: CARD,
          boxShadow: SOFT,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "#fafafa",
            borderBottom: "1px solid #eef2f7",
          }}
        >
          {DOW.map((d) => (
            <div key={d} style={{ padding: 12, fontWeight: 1100, fontSize: 12, color: "#334155" }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {calendar.map((c, idx) => {
            if (c.type === "blank") {
              return (
                <div
                  key={`b-${idx}`}
                  style={{
                    height: 124,
                    borderBottom: "1px solid #f1f5f9",
                    borderRight: idx % 7 !== 6 ? "1px solid #f1f5f9" : "none",
                    background: "white",
                  }}
                />
              );
            }

            const { date, dayNum } = c.cell;
            const g = goalsByDate.get(date);
            const a = actualsByDate.get(date);

            const goalTx = Number(g?.transactions_goal ?? 0);
            const goalSales = Number(g?.net_sales_goal ?? 0);

            const actTx = Number(a?.transactions_actual ?? 0);
            const actSales = Number(a?.net_sales_actual ?? 0);

            const share = monthTxSum > 0 ? goalTx / monthTxSum : 0;

            const showActual = isPastOrToday(date);
            const topSales = showActual ? actSales : goalSales;
            const topTx = showActual ? actTx : goalTx;

            const topAtv = atv(topSales, topTx);

            const status = goalHitIndicator(date, goalSales, goalTx, actSales, actTx);
            const statusDot =
              status === "hit" ? HIT_GREEN : status === "miss" ? ACE_RED : "transparent";

            const rightLabel = showActual ? "Actual" : "Goal";

            return (
              <button
                key={date}
                onClick={() => openDrawerForDate(date)}
                disabled={drawerBusy}
                style={{
                  height: 124,
                  padding: 12,
                  textAlign: "left",
                  border: "none",
                  background: "white",
                  borderBottom: "1px solid #f1f5f9",
                  borderRight: idx % 7 !== 6 ? "1px solid #f1f5f9" : "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 1200 }}>{dayNum}</span>
                    <span
                      aria-label={status}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: statusDot,
                        border: "1px solid #e5e7eb",
                        display: "inline-block",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.65 }}>{pct2(share)}</div>
                </div>

                <div style={{ marginTop: 8, lineHeight: 1.25 }}>
                  <div style={{ fontWeight: 1100 }}>{money0(topSales)}</div>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>{int(topTx)} txns</div>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>ATV {money2(topAtv)}</div>
                </div>

                <div style={{ marginTop: 8, fontSize: 10, opacity: 0.65 }}>
                  {rightLabel}
                  {showActual ? "" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drawer (floating panel) */}
      {drawerOpen ? (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.38)",
            zIndex: 60,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 92vw)",
              height: "100vh",
              background: "white",
              borderLeft: BORDER,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: 14, borderBottom: "1px solid #eef2f7", background: "#fbfbfc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 1200, fontSize: 14, letterSpacing: -0.2 }}>
                    {storeName} • {selectedDate}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, opacity: 0.7 }}>
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
                    fontWeight: 1100,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: 14, background: BG, overflowY: "auto", flex: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Today */}
                <div style={{ border: BORDER, borderRadius: 14, background: "white", padding: 12 }}>
                  <div style={{ fontWeight: 1200, fontSize: 12, opacity: 0.85 }}>Today</div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <Metric label="Sales Goal" value={money0(Number(selectedGoal?.net_sales_goal ?? 0))} />
                    <Metric label="Sales Actual" value={money0(Number(selectedActual?.net_sales_actual ?? 0))} />
                    <Metric label="Trans Forecast" value={int(Number(selectedGoal?.transactions_goal ?? 0))} />
                    <Metric label="Customer Count" value={int(Number(selectedActual?.transactions_actual ?? 0))} />
                    <Metric
                      label="ATV Goal"
                      value={money2(
                        atv(
                          Number(selectedGoal?.net_sales_goal ?? 0),
                          Number(selectedGoal?.transactions_goal ?? 0)
                        )
                      )}
                    />
                    <Metric
                      label="Actual ATV"
                      value={money2(
                        atv(
                          Number(selectedActual?.net_sales_actual ?? 0),
                          Number(selectedActual?.transactions_actual ?? 0)
                        )
                      )}
                    />
                  </div>
                </div>

                {/* LY */}
                <div style={{ border: BORDER, borderRadius: 14, background: "white", padding: 12 }}>
                  <div style={{ fontWeight: 1200, fontSize: 12, opacity: 0.85 }}>LY</div>
                  <div style={{ marginTop: 2, fontSize: 11, opacity: 0.65 }}>{selectedLyDate || "—"}</div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <Metric label="Sales Goal" value="—" />
                    <Metric label="Sales Actual" value={money0(Number(selectedLy?.net_sales ?? 0))} />
                    <Metric label="Trans Forecast" value="—" />
                    <Metric label="Customer Count" value={int(Number(selectedLy?.transactions ?? 0))} />
                    <Metric label="ATV Goal" value="—" />
                    <Metric
                      label="Actual ATV"
                      value={money2(atv(Number(selectedLy?.net_sales ?? 0), Number(selectedLy?.transactions ?? 0)))}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>
                Notes: Past/today will show actuals on the calendar when injected. Future days show goal allocations.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #eef2f7", borderRadius: 12, padding: 10, background: "#fbfcfe" }}>
      <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>{props.label}</div>
      <div style={{ marginTop: 4, fontWeight: 1200 }}>{props.value}</div>
    </div>
  );
}
