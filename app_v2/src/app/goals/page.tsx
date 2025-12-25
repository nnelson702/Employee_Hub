"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetchStores, type StoreRow } from "../../shared/db/stores";
import { fetchMonthlyGoal, type MonthlyGoalRow } from "../../shared/db/goals";
import { fetchDailyGoalsForMonthPublished, type DailyGoalRow } from "../../shared/db/daily_goals";
import { fetchActualsForMonth, type DailyActualRow } from "../../shared/db/actuals";
import { fetchHistoricalForRange, type HistoricalDailyRow } from "../../shared/db/historical_daily_sales";

function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStartFromMonthKey(monthKey: string) {
  return `${monthKey}-01`;
}

function atv(sales: number, txns: number) {
  if (!txns) return 0;
  return sales / txns;
}

function money0(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function money2(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function int(n: number) {
  return Math.round(n).toLocaleString();
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export default function GoalsPage() {
  const todayIso = useMemo(() => iso(new Date()), []);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string>("18228");

  const [monthStart, setMonthStart] = useState<string>(() => {
    const now = new Date();
    return iso(startOfMonth(now));
  });
  const monthKey = useMemo(() => monthStart.slice(0, 7), [monthStart]);

  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string>("");

  const [monthlyGoal, setMonthlyGoal] = useState<MonthlyGoalRow | null>(null);
  const [dailyGoals, setDailyGoals] = useState<DailyGoalRow[]>([]);
  const [dailyActuals, setDailyActuals] = useState<DailyActualRow[]>([]);
  const [lyRows, setLyRows] = useState<HistoricalDailyRow[]>([]);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg("");
      try {
        const s = await fetchStores();
        if (!alive) return;
        setStores(s);

        // monthly goal for selected store/month
        const mg = await fetchMonthlyGoal(storeId, monthStart);
        if (!alive) return;
        setMonthlyGoal(mg ?? null);

        // published goals for month (store-facing)
        const goals = await fetchDailyGoalsForMonthPublished(storeId, monthStart);
        if (!alive) return;
        setDailyGoals(goals ?? []);

        // actuals for month (business_date)
        const acts = await fetchActualsForMonth(storeId, monthStart);
        if (!alive) return;
        setDailyActuals(acts ?? []);

        // LY actuals for same month prior year (historical_daily_sales.date)
        const d = new Date(monthStart + "T00:00:00");
        const lyStart = new Date(d.getFullYear() - 1, d.getMonth(), 1);
        const lyEnd = new Date(d.getFullYear() - 1, d.getMonth() + 1, 1);
        const lyStartIso = iso(lyStart);
        const lyEndIso = iso(lyEnd);

        const ly = await fetchHistoricalForRange({
          storeId,
          startDate: lyStartIso,
          endDateExclusive: lyEndIso,
        });
        if (!alive) return;
        setLyRows(ly ?? []);
      } catch (e: any) {
        console.error(e);
        setMsg(e?.message ?? "Failed to load goals");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [storeId, monthStart]);

  const storeName = useMemo(() => {
    const s = stores.find((x) => String(x.store_id) === String(storeId));
    return s ? `${s.store_name} • ${monthKey}` : `Store ${storeId} • ${monthKey}`;
  }, [stores, storeId, monthKey]);

  const goalsByDate = useMemo(() => {
    const m = new Map<string, DailyGoalRow>();
    for (const g of dailyGoals) m.set(g.goal_date, g);
    return m;
  }, [dailyGoals]);

  const actualsByDate = useMemo(() => {
    const m = new Map<string, DailyActualRow>();
    for (const a of dailyActuals) m.set(a.business_date, a);
    return m;
  }, [dailyActuals]);

  const lyByDate = useMemo(() => {
    const m = new Map<string, HistoricalDailyRow>();
    for (const r of lyRows) m.set(r.date, r);
    return m;
  }, [lyRows]);

  const dailyTotals = useMemo(() => {
    let sales = 0;
    let txns = 0;
    for (const g of dailyGoals) {
      sales += Number(g.net_sales_goal || 0);
      txns += Number(g.transactions_goal || 0);
    }
    return { sales, txns, atv: atv(sales, txns) };
  }, [dailyGoals]);

  const monthDays = useMemo(() => {
    const start = new Date(monthStart + "T00:00:00");
    const end = addMonths(start, 1);
    const arr: { date: string; day: number; dow: number }[] = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      arr.push({ date: iso(d), day: d.getDate(), dow: d.getDay() });
    }
    return arr;
  }, [monthStart]);

  const calendarGrid = useMemo(() => {
    const start = new Date(monthStart + "T00:00:00");
    const firstDow = start.getDay(); // 0 Sun
    const cells: Array<{ date?: string; day?: number; dow?: number }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({});
    for (const d of monthDays) cells.push({ date: d.date, day: d.day, dow: d.dow });
    while (cells.length % 7 !== 0) cells.push({});
    return cells;
  }, [monthDays, monthStart]);

  const openDrawer = async (dateIso: string) => {
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
            onChange={(e) => setMonthStart(monthStartFromMonthKey(e.target.value))}
            style={{ padding: "10px 12px", borderRadius: 12, border: BORDER, background: "white" }}
          />
        </div>
      </div>

      {msg ? <div style={{ marginTop: 10, color: ACE_RED, fontWeight: 800 }}>{msg}</div> : null}

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

            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
              Notes: Past/today will show actuals on the calendar when injected. Future days show goal allocations.
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div
        style={{
          marginTop: 14,
          border: BORDER,
          borderRadius: 16,
          background: CARD,
          boxShadow: SOFT,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: BG, borderBottom: BORDER }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} style={{ padding: "10px 12px", fontWeight: 1000, fontSize: 12, opacity: 0.8 }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {calendarGrid.map((c, idx) => {
            const date = c.date;
            const isPastOrToday = !!date && date <= todayIso;

            const goal = date ? goalsByDate.get(date) : undefined;
            const act = date ? actualsByDate.get(date) : undefined;

            const salesGoal = Number(goal?.net_sales_goal ?? 0);
            const txGoal = Number(goal?.transactions_goal ?? 0);

            const salesActual = Number(act?.net_sales_actual ?? 0);
            const txActual = Number(act?.transactions_actual ?? 0);

            const displaySales = isPastOrToday ? salesActual : salesGoal;
            const displayTx = isPastOrToday ? txActual : txGoal;
            const displayAtv = atv(displaySales, displayTx);

            const hit = isPastOrToday && goal && act ? salesActual >= salesGoal && txActual >= txGoal : false;

            const barColor = isPastOrToday
              ? hit
                ? HIT_GREEN
                : ACE_RED
              : "#e5e7eb";

            return (
              <button
                key={idx}
                onClick={() => (date ? openDrawer(date) : undefined)}
                disabled={!date || drawerBusy}
                style={{
                  height: 110,
                  borderRight: (idx + 1) % 7 === 0 ? "none" : BORDER,
                  borderBottom: idx >= calendarGrid.length - 7 ? "none" : BORDER,
                  padding: 12,
                  textAlign: "left",
                  background: "white",
                  cursor: date ? "pointer" : "default",
                  position: "relative",
                  opacity: date ? 1 : 0.35,
                }}
              >
                {date ? (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        background: barColor,
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ fontSize: 14, fontWeight: 1200 }}>{c.day}</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{isPastOrToday ? "Actual" : "Goal"}</div>
                    </div>

                    <div style={{ marginTop: 8, fontWeight: 1200, fontSize: 13 }}>{money0(displaySales)}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>{int(displayTx)} txns</div>
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7 }}>ATV {money2(displayAtv)}</div>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.40)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              background: "white",
              borderRadius: 18,
              border: BORDER,
              boxShadow: "0 20px 60px rgba(2,6,23,0.35)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 16, borderBottom: BORDER, display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 1300, fontSize: 16 }}>
                  {stores.find((s) => String(s.store_id) === String(storeId))?.store_name ?? storeId} • {selectedDate}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, opacity: 0.7 }}>Day details (Today vs LY)</div>
              </div>

              <button
                onClick={() => setDrawerOpen(false)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: BORDER,
                  background: "white",
                  fontWeight: 1100,
                  cursor: "pointer",
                  height: 42,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Today */}
                <div style={{ border: BORDER, borderRadius: 16, padding: 14, background: "#fbfcfe" }}>
                  <div style={{ fontWeight: 1100, opacity: 0.85 }}>Today</div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <Card label="Sales Goal" value={money0(Number(selectedGoal?.net_sales_goal ?? 0))} />
                    <Card label="Sales Actual" value={money0(Number(selectedActual?.net_sales_actual ?? 0))} />
                    <Card label="Trans Forecast" value={int(Number(selectedGoal?.transactions_goal ?? 0))} />
                    <Card label="Customer Count" value={int(Number(selectedActual?.transactions_actual ?? 0))} />
                    <Card
                      label="ATV Goal"
                      value={money2(atv(Number(selectedGoal?.net_sales_goal ?? 0), Number(selectedGoal?.transactions_goal ?? 0)))}
                    />
                    <Card
                      label="Actual ATV"
                      value={money2(atv(Number(selectedActual?.net_sales_actual ?? 0), Number(selectedActual?.transactions_actual ?? 0)))}
                    />
                  </div>
                </div>

                {/* LY */}
                <div style={{ border: BORDER, borderRadius: 16, padding: 14, background: "#fbfcfe" }}>
                  {/* FIX: date on same line as LY, small, no wrapping */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontWeight: 1100, opacity: 0.85 }}>LY</div>
                    <div style={{ fontSize: 11, opacity: 0.65, whiteSpace: "nowrap" }}>{selectedLyDate}</div>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <Card label="Sales Goal" value={"—"} />
                    <Card label="Sales Actual" value={money0(Number(selectedLy?.net_sales ?? 0))} />
                    <Card label="Trans Forecast" value={"—"} />
                    <Card label="Customer Count" value={int(Number(selectedLy?.transactions ?? 0))} />
                    <Card label="ATV Goal" value={"—"} />
                    <Card label="Actual ATV" value={money2(atv(Number(selectedLy?.net_sales ?? 0), Number(selectedLy?.transactions ?? 0)))} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
                Notes: Past/today will show actuals on the calendar when injected. Future days show goal allocations.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  const BORDER = "1px solid #e8edf4";
  return (
    <div style={{ border: BORDER, borderRadius: 14, padding: 12, background: "white" }}>
      <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 1100 }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 1300 }}>{value}</div>
    </div>
  );
}
