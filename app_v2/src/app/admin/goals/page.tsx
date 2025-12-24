"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/supabase/client";
import { fetchStores, StoreRow } from "@/shared/db/stores";
import { fetchMonthlyGoal, upsertMonthlyGoal } from "@/shared/db/goals";
import {
  fetchDailyGoalsForMonthAdmin,
  setDailyGoalsPublishedForMonth,
  upsertDailyGoals,
} from "@/shared/db/daily_goals";

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
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function atv(sales: number, txns: number) {
  if (!txns) return 0;
  return sales / txns;
}
function money0(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
function money2(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}
function int(n: number) {
  return n.toLocaleString();
}

/** ---------------------------
 * UI
 * --------------------------*/
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const BG = "#f6f8fb";
const CARD = "#ffffff";
const BORDER = "1px solid #e8edf4";
const SOFT_SHADOW = "0 1px 0 rgba(2,6,23,0.03), 0 10px 22px rgba(2,6,23,0.06)";
const SHADOW = "0 1px 0 rgba(2,6,23,0.03), 0 14px 34px rgba(2,6,23,0.08)";
const ACE_RED = "#dc2626";
const ACE_GREEN = "#16a34a";

/** ---------------------------
 * History fetch + suggestion helpers
 * --------------------------*/
type HistRow = {
  store_id: string;
  date: string; // YYYY-MM-DD
  net_sales: number;
  transactions: number;
};

async function fetchHistoricalRange(storeId: string | null, startIso: string, endIso: string): Promise<HistRow[]> {
  let q = supabase
    .from("historical_daily_sales")
    .select("store_id,date,net_sales,transactions")
    .gte("date", startIso)
    .lt("date", endIso);

  if (storeId) q = q.eq("store_id", storeId);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    store_id: String(r.store_id),
    date: String(r.date),
    net_sales: Number(r.net_sales ?? 0),
    transactions: Number(r.transactions ?? 0),
  }));
}

type MetricKey = "transactions" | "net_sales";

/** Weights per day-of-month based on LY metric share */
function makeWeightsFromLyDayOfMonth(targetMonthStartIso: string, lyRows: HistRow[], metric: MetricKey) {
  const n = daysInMonth(targetMonthStartIso);
  const totals = new Array(n).fill(0);

  for (const r of lyRows) {
    const d = new Date(r.date + "T00:00:00");
    const day = d.getDate();
    if (day < 1 || day > n) continue;

    const v = metric === "transactions" ? Number(r.transactions || 0) : Number(r.net_sales || 0);
    totals[day - 1] += v;
  }

  const sum = totals.reduce((a, b) => a + b, 0);
  if (!sum) return totals.map(() => 1 / n);
  return totals.map((v) => v / sum);
}

/** DOW multipliers based on last-70-day metric share, mean = 1 */
function computeDowTrendMultiplier(rows: HistRow[], metric: MetricKey) {
  const totals = new Array(7).fill(0);

  for (const r of rows) {
    const d = new Date(r.date + "T00:00:00");
    const dow = d.getDay();
    const v = metric === "transactions" ? Number(r.transactions || 0) : Number(r.net_sales || 0);
    totals[dow] += v;
  }

  const sum = totals.reduce((a, b) => a + b, 0);
  if (!sum) return new Array(7).fill(1);

  const avgShare = 1 / 7;
  const shares = totals.map((v) => v / sum);
  const mult = shares.map((s) => (avgShare > 0 ? s / avgShare : 1));

  return mult.map((m) => clamp(m, 0.7, 1.35));
}

function applyGuardrail(weights: number[], total: number, maxVariancePct: number) {
  // Convert weights -> values, clamp each day to avg*(1±pct), renormalize
  const n = weights.length;
  const avg = total / n;
  const minDay = avg * (1 - maxVariancePct);
  const maxDay = avg * (1 + maxVariancePct);

  let vals = weights.map((w) => w * total);
  vals = vals.map((v) => clamp(v, minDay, maxDay));

  const epsilon = 0.00001;
  for (let iter = 0; iter < 80; iter++) {
    const current = vals.reduce((a, b) => a + b, 0);
    const delta = total - current;
    if (Math.abs(delta) < epsilon) break;

    if (delta > 0) {
      const room = vals.map((v) => Math.max(0, maxDay - v));
      const roomSum = room.reduce((a, b) => a + b, 0);
      if (!roomSum) break;
      vals = vals.map((v, i) => v + (delta * room[i]) / roomSum);
    } else {
      const room = vals.map((v) => Math.max(0, v - minDay));
      const roomSum = room.reduce((a, b) => a + b, 0);
      if (!roomSum) break;
      vals = vals.map((v, i) => v + (delta * room[i]) / roomSum);
    }
  }

  const finalSum = vals.reduce((a, b) => a + b, 0) || 1;
  return vals.map((v) => v / finalSum);
}

/** ---------------------------
 * Draft model (UI-friendly)
 * --------------------------*/
type DraftCell = {
  goal_date: string;
  dayNum: number;
  dow: number;
  transactions_goal: number;
  net_sales_goal: number;
};

function parseClosedDates(text: string) {
  // comma/space/newline separated YYYY-MM-DD
  const raw = (text || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = new Set<string>();
  for (const s of raw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) valid.add(s);
  }
  return valid;
}

/** ---------------------------
 * Allocation rules
 * --------------------------*/
function buildEvenCells(monthStartIso: string, monthlyTxnsGoal: number, monthlySalesGoal: number) {
  const n = daysInMonth(monthStartIso);

  // txns: evenly split integers (exact monthly total)
  const floorTx = Math.floor(monthlyTxnsGoal / n);
  const remainder = monthlyTxnsGoal - floorTx * n; // count of days that get +1

  // sales: evenly split integers (exact monthly total)
  const floorSales = Math.floor(monthlySalesGoal / n);
  const salesRemainder = monthlySalesGoal - floorSales * n;

  const out: DraftCell[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(monthStartIso + "T00:00:00");
    d.setDate(i + 1);
    const dow = d.getDay();
    const goal_date = iso(d);

    const dayTxns = remainder > 0 ? (i < remainder ? floorTx + 1 : floorTx) : floorTx;
    const daySales = salesRemainder > 0 ? (i < salesRemainder ? floorSales + 1 : floorSales) : floorSales;

    out.push({
      goal_date,
      dayNum: i + 1,
      dow,
      transactions_goal: Math.max(0, dayTxns),
      net_sales_goal: Math.max(0, daySales),
    });
  }

  return out;
}

function allocateMetricFromWeights(
  monthStartIso: string,
  weights: number[],
  total: number,
  closedDates: Set<string>,
  rounding: "int"
) {
  const n = daysInMonth(monthStartIso);

  // true-up on last open day so we don’t dump remainder into closed day
  let lastOpenIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(monthStartIso + "T00:00:00");
    d.setDate(i + 1);
    if (!closedDates.has(iso(d))) {
      lastOpenIdx = i;
      break;
    }
  }
  if (lastOpenIdx < 0) lastOpenIdx = n - 1;

  const out = new Array(n).fill(0);
  let soFar = 0;

  for (let i = 0; i < n; i++) {
    const d = new Date(monthStartIso + "T00:00:00");
    d.setDate(i + 1);
    const date = iso(d);

    if (closedDates.has(date)) {
      out[i] = 0;
      continue;
    }

    const isTrueUp = i === lastOpenIdx;
    const raw = total * (weights[i] || 0);

    let v = isTrueUp ? total - soFar : Math.round(raw);
    if (rounding === "int") v = Math.max(0, Math.round(v));
    out[i] = v;
    soFar += out[i];
  }

  return out;
}

/** Combine independent txns + sales allocations into DraftCells */
function allocateTxnsAndSales(
  monthStartIso: string,
  txWeights: number[],
  salesWeights: number[],
  txTotal: number,
  salesTotal: number,
  closedDates: Set<string>
) {
  const n = daysInMonth(monthStartIso);

  const txns = allocateMetricFromWeights(monthStartIso, txWeights, txTotal, closedDates, "int");
  const sales = allocateMetricFromWeights(monthStartIso, salesWeights, salesTotal, closedDates, "int");

  const out: DraftCell[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(monthStartIso + "T00:00:00");
    d.setDate(i + 1);
    out.push({
      goal_date: iso(d),
      dayNum: i + 1,
      dow: d.getDay(),
      transactions_goal: Math.max(0, txns[i] || 0),
      net_sales_goal: Math.max(0, sales[i] || 0),
    });
  }
  return out;
}

/** ---------------------------
 * Page
 * --------------------------*/
export default function AdminGoalsPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [monthStart, setMonthStart] = useState<string>(iso(firstOfMonth(new Date())));

  const [netSales, setNetSales] = useState<string>("100000");
  const [txns, setTxns] = useState<string>("4000");
  const [publishedMonthly, setPublishedMonthly] = useState<boolean>(false);

  // Prepare modal state
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // DOW multipliers apply ONLY to suggestion (applied to BOTH layers)
  const [dowMult, setDowMult] = useState<number[]>(new Array(7).fill(1));

  // closed dates (admin override)
  const [closedDatesText, setClosedDatesText] = useState<string>("");

  const [draftCells, setDraftCells] = useState<DraftCell[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>("");

  const monthKey = useMemo(() => ym(monthStart), [monthStart]);

  const storeName = useMemo(() => {
    return stores.find((s) => s.store_id === storeId)?.store_name ?? storeId;
  }, [stores, storeId]);

  const monthlySalesGoal = useMemo(() => Number(netSales || 0), [netSales]);
  const monthlyTxnsGoal = useMemo(() => Number(txns || 0), [txns]);

  const monthlyAtv = useMemo(() => atv(monthlySalesGoal, monthlyTxnsGoal), [monthlySalesGoal, monthlyTxnsGoal]);

  const dailyTotals = useMemo(() => {
    const s = draftCells.reduce((a, c) => a + Number(c.net_sales_goal || 0), 0);
    const t = draftCells.reduce((a, c) => a + Number(c.transactions_goal || 0), 0);
    return { sales: s, txns: t, atv: atv(s, t) };
  }, [draftCells]);

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
        const existing = await fetchMonthlyGoal(storeId, monthStart);
        if (existing) {
          setNetSales(String(existing.net_sales_goal ?? 0));
          setTxns(String(existing.transactions_goal ?? 0));
          setPublishedMonthly(Boolean(existing.is_published));
        } else {
          setPublishedMonthly(false);
        }
      } catch (e: any) {
        setMsg(e.message || "Failed loading monthly goal.");
      }
    })();
  }, [storeId, monthStart]);

  const saveMonthly = async () => {
    setMsg(null);
    try {
      await upsertMonthlyGoal({
        store_id: storeId,
        month_start: monthStart,
        net_sales_goal: Number(netSales),
        transactions_goal: Number(txns),
        is_published: publishedMonthly,
      });
      setMsg("Monthly goal saved.");
    } catch (e: any) {
      setMsg(e.message || "Save failed.");
    }
  };

  const openPrepare = async () => {
    setMsg(null);

    if (!storeId || monthlySalesGoal <= 0 || monthlyTxnsGoal <= 0) {
      setMsg("Set monthly Sales + Transactions first, then Save Monthly.");
      return;
    }

    setBusy(true);
    try {
      const existing = await fetchDailyGoalsForMonthAdmin(storeId, monthStart);

      // If saved daily rows exist, load them (so admin edits persist)
      if (existing.length) {
        const n = daysInMonth(monthStart);
        const map = new Map(existing.map((r) => [r.goal_date, r]));
        const cells: DraftCell[] = [];

        for (let i = 0; i < n; i++) {
          const d = new Date(monthStart + "T00:00:00");
          d.setDate(i + 1);
          const goal_date = iso(d);
          const row = map.get(goal_date);

          cells.push({
            goal_date,
            dayNum: i + 1,
            dow: d.getDay(),
            transactions_goal: Number(row?.transactions_goal ?? 0),
            net_sales_goal: Number(row?.net_sales_goal ?? 0),
          });
        }

        setDraftCells(cells);
        setSourceLabel("Loaded from existing daily goals (draft/published).");
      } else {
        // Default required behavior: even breakdown on entry
        setDraftCells(buildEvenCells(monthStart, monthlyTxnsGoal, monthlySalesGoal));
        setSourceLabel("Even split (default). Run Suggestion to apply the logic engine.");
      }

      setPrepareOpen(true);
    } catch (e: any) {
      setMsg(e.message || "Failed to prepare daily goals.");
    } finally {
      setBusy(false);
    }
  };

  const resetEven = () => {
    setDraftCells(buildEvenCells(monthStart, monthlyTxnsGoal, monthlySalesGoal));
    setSourceLabel("Reset to even split (default).");
  };

  const resetDow = () => setDowMult(new Array(7).fill(1));
  const setAllDow = (v: number) => setDowMult(new Array(7).fill(v));

  const runSuggestion = async () => {
    if (!storeId || monthlySalesGoal <= 0 || monthlyTxnsGoal <= 0) {
      setMsg("Monthly totals missing.");
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      // Closed dates: explicit admin overrides
      const closedDates = parseClosedDates(closedDatesText);

      // 1) Base weights: store LY month day-of-month; fallback company
      const dt = parseMonthStart(monthStart);
      const lyMonthStart = iso(new Date(dt.getFullYear() - 1, dt.getMonth(), 1));
      const lyMonthEnd = nextMonthStart(lyMonthStart);

      let lyStore = await fetchHistoricalRange(storeId, lyMonthStart, lyMonthEnd);
      let source = `Store last-year month (${ym(lyMonthStart)})`;
      if (!lyStore.length) {
        lyStore = await fetchHistoricalRange(null, lyMonthStart, lyMonthEnd);
        source = `Company last-year month (${ym(lyMonthStart)}) fallback`;
      }

      // Holiday/closure inference based on TRANSACTIONS LY:
      // If LY txns on same day-of-month is 0 → treat as closed for suggestion.
      const lyTxByDom = new Map<number, number>();
      for (const r of lyStore) {
        const d = new Date(r.date + "T00:00:00");
        const dom = d.getDate();
        lyTxByDom.set(dom, (lyTxByDom.get(dom) ?? 0) + Number(r.transactions || 0));
      }
      const n = daysInMonth(monthStart);
      for (let i = 0; i < n; i++) {
        const dayNum = i + 1;
        const inferredClosed = (lyTxByDom.get(dayNum) ?? 0) === 0;
        const d = new Date(monthStart + "T00:00:00");
        d.setDate(dayNum);
        const date = iso(d);
        if (inferredClosed) closedDates.add(date);
      }

      // 2) Trend DOW multiplier (last 70 days), store-first fallback company — computed separately for both metrics
      const today = new Date();
      const start70 = new Date(today);
      start70.setDate(start70.getDate() - 70);
      const start70Iso = iso(start70);
      const endIso = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

      let trend = await fetchHistoricalRange(storeId, start70Iso, endIso);
      if (!trend.length) trend = await fetchHistoricalRange(null, start70Iso, endIso);

      const trendTx = computeDowTrendMultiplier(trend, "transactions");
      const trendSales = computeDowTrendMultiplier(trend, "net_sales");

      // 3) Build independent base weights from LY for each metric
      let txWeights = makeWeightsFromLyDayOfMonth(monthStart, lyStore, "transactions");
      let salesWeights = makeWeightsFromLyDayOfMonth(monthStart, lyStore, "net_sales");

      // 4) Apply trend mult + admin DOW mult; force closed days to 0 weight (for BOTH layers)
      const txAdjusted = new Array(n).fill(0);
      const salesAdjusted = new Array(n).fill(0);

      for (let i = 0; i < n; i++) {
        const d = new Date(monthStart + "T00:00:00");
        d.setDate(i + 1);
        const dow = d.getDay();
        const date = iso(d);

        if (closedDates.has(date)) {
          txAdjusted[i] = 0;
          salesAdjusted[i] = 0;
        } else {
          const admin = dowMult[dow] ?? 1;
          txAdjusted[i] = (txWeights[i] || 0) * (trendTx[dow] || 1) * admin;
          salesAdjusted[i] = (salesWeights[i] || 0) * (trendSales[dow] || 1) * admin;
        }
      }

      // Normalize each independently (fallback to even across open days if needed)
      function normalizeOrEvenOpen(arr: number[]) {
        let sum = arr.reduce((a, b) => a + b, 0);
        if (sum > 0) return arr.map((v) => v / sum);

        const openIdx = arr.map((_, i) => i).filter((i) => {
          const d = new Date(monthStart + "T00:00:00");
          d.setDate(i + 1);
          return !closedDates.has(iso(d));
        });

        const even = openIdx.length ? 1 / openIdx.length : 1 / n;
        const out = new Array(n).fill(0).map((_, i) => (openIdx.includes(i) ? even : 0));
        return out; // already sums to 1 across open days
      }

      txWeights = normalizeOrEvenOpen(txAdjusted);
      salesWeights = normalizeOrEvenOpen(salesAdjusted);

      // 5) Suggested totals (each constrained independently) + guardrails (each independently)
      const SUGGEST_MAX = 1.035; // 103.5%
      const SUGGEST_MIN = 1.0; // 100%
      const DEFAULT_PAD = 1.02; // slight pad by default

      const txTotal = Math.max(
        Math.ceil(monthlyTxnsGoal * SUGGEST_MIN),
        Math.min(Math.ceil(monthlyTxnsGoal * DEFAULT_PAD), Math.ceil(monthlyTxnsGoal * SUGGEST_MAX))
      );
      const salesTotal = Math.max(
        Math.ceil(monthlySalesGoal * SUGGEST_MIN),
        Math.min(Math.ceil(monthlySalesGoal * DEFAULT_PAD), Math.ceil(monthlySalesGoal * SUGGEST_MAX))
      );

      // Guardrail controls volatility for each metric allocation
      txWeights = applyGuardrail(txWeights, txTotal, 0.35);
      salesWeights = applyGuardrail(salesWeights, salesTotal, 0.35);

      // Re-zero closed days post-guardrail and renormalize independently
      function reZeroClosedAndNormalize(w: number[]) {
        const post = w.map((val, i) => {
          const d = new Date(monthStart + "T00:00:00");
          d.setDate(i + 1);
          return closedDates.has(iso(d)) ? 0 : val;
        });
        const sum = post.reduce((a, b) => a + b, 0) || 1;
        return post.map((v) => v / sum);
      }
      txWeights = reZeroClosedAndNormalize(txWeights);
      salesWeights = reZeroClosedAndNormalize(salesWeights);

      // 6) Allocate both layers independently (ATV becomes the true ratio)
      const nextCells = allocateTxnsAndSales(monthStart, txWeights, salesWeights, txTotal, salesTotal, closedDates);

      setDraftCells(nextCells);
      setSourceLabel(
        `Suggestion: ${source} (day-of-month) + last-70-day DOW trend + your DOW tweaks. Txns and Sales are suggested independently (ATV is calculated). Guardrail ±35%. Suggested totals constrained to 100%–103.5%. Closed days inferred from LY txns=0 + your closed dates.`
      );
    } catch (e: any) {
      setMsg(e.message || "Failed running suggestion.");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const payload = draftCells.map((c) => ({
        store_id: storeId,
        goal_date: c.goal_date,
        transactions_goal: Math.max(0, Math.round(Number(c.transactions_goal || 0))),
        net_sales_goal: Math.max(0, Math.round(Number(c.net_sales_goal || 0))),
        is_locked: false,
        is_published: false,
      }));

      await upsertDailyGoals(payload);
      setMsg("Draft saved. (Not visible to store until published.)");
    } catch (e: any) {
      setMsg(e.message || "Save draft failed.");
    } finally {
      setBusy(false);
    }
  };

  const publishToStore = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const payload = draftCells.map((c) => ({
        store_id: storeId,
        goal_date: c.goal_date,
        transactions_goal: Math.max(0, Math.round(Number(c.transactions_goal || 0))),
        net_sales_goal: Math.max(0, Math.round(Number(c.net_sales_goal || 0))),
        is_locked: false,
        is_published: false,
      }));
      await upsertDailyGoals(payload);

      await setDailyGoalsPublishedForMonth(storeId, monthStart, true);

      setMsg("Published. Store users will now see these daily goals.");
      setPrepareOpen(false);
    } catch (e: any) {
      setMsg(e.message || "Publish failed.");
    } finally {
      setBusy(false);
    }
  };

  /** Calendar grid */
  const calendarCells = useMemo(() => {
    const first = parseMonthStart(monthStart);
    const dim = daysInMonth(monthStart);
    const firstDow = first.getDay();

    const out: Array<{ type: "blank" } | { type: "day"; date: string; dayNum: number; dow: number }> = [];
    for (let i = 0; i < firstDow; i++) out.push({ type: "blank" });

    for (let d = 1; d <= dim; d++) {
      const date = iso(new Date(first.getFullYear(), first.getMonth(), d));
      out.push({
        type: "day",
        date,
        dayNum: d,
        dow: new Date(first.getFullYear(), first.getMonth(), d).getDay(),
      });
    }

    while (out.length % 7 !== 0) out.push({ type: "blank" });
    return out;
  }, [monthStart]);

  const draftMap = useMemo(() => new Map(draftCells.map((c) => [c.goal_date, c])), [draftCells]);

  const pctForDate = (date: string) => {
    const sumTx = draftCells.reduce((a, x) => a + Number(x.transactions_goal || 0), 0);
    const cell = draftMap.get(date);
    if (!sumTx || !cell) return null;
    return Number(cell.transactions_goal || 0) / sumTx;
  };

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Admin</div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: -0.3 }}>Goals Setup</h1>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
            Save the month first. Then prepare a daily breakdown (draft) before publishing.
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Store</div>
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
          </div>

          <div>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Month</div>
            <input
              type="month"
              value={monthKey}
              onChange={(e) => setMonthStart(`${e.target.value}-01`)}
              style={{ width: "100%", padding: 10, borderRadius: 12, border: BORDER }}
            />
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Net Sales Goal</div>
            <input
              value={netSales}
              onChange={(e) => setNetSales(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 12, border: BORDER }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Transactions Goal</div>
            <input
              value={txns}
              onChange={(e) => setTxns(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 12, border: BORDER }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>ATV (auto)</div>
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                border: BORDER,
                background: "#fbfcfe",
                fontWeight: 1000,
              }}
            >
              {money2(monthlyAtv)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
            <input type="checkbox" checked={publishedMonthly} onChange={(e) => setPublishedMonthly(e.target.checked)} />
            Published monthly (visible to store users)
          </label>

          <button
            onClick={saveMonthly}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: BORDER,
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: SOFT_SHADOW,
            }}
          >
            Save Monthly
          </button>

          <button
            onClick={openPrepare}
            disabled={busy}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: `1px solid ${busy ? "#e5e7eb" : "#cbd5e1"}`,
              background: busy ? "#f3f4f6" : "white",
              fontWeight: 950,
              cursor: busy ? "not-allowed" : "pointer",
              boxShadow: SOFT_SHADOW,
            }}
          >
            {busy ? "Loading…" : "Prepare Daily Goals"}
          </button>

          <div style={{ marginLeft: "auto", fontWeight: 900, opacity: 0.75 }}>
            {storeName} • {monthKey}
          </div>
        </div>

        {msg ? (
          <div style={{ marginTop: 10, color: msg.toLowerCase().includes("saved") || msg.toLowerCase().includes("published") ? ACE_GREEN : ACE_RED, fontWeight: 800 }}>
            {msg}
          </div>
        ) : null}

        <div style={{ marginTop: 12, opacity: 0.85, fontSize: 13 }}>
          Store users will view the published month on <a href="/goals">/goals</a>.
        </div>
      </div>

      {/* PREPARE MODAL */}
      {prepareOpen ? (
        <div
          onClick={() => setPrepareOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.45)",
            overflowY: "auto",
            padding: 16,
            zIndex: 50,
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1200px, 96vw)",
              margin: "0 auto",
              borderRadius: 18,
              background: CARD,
              border: BORDER,
              boxShadow: SHADOW,
              overflow: "hidden",
              maxHeight: "calc(100vh - 32px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ padding: 14, borderBottom: "1px solid #eef2f7", background: "#fbfbfc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 1100, fontSize: 15, letterSpacing: -0.2 }}>
                    Prepare Daily Goals • {storeName} • {monthKey}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, opacity: 0.75 }}>
                    Draft workspace — nothing becomes visible to the store until you publish.
                  </div>
                </div>

                <button
                  onClick={() => setPrepareOpen(false)}
                  style={{
                    padding: "9px 11px",
                    borderRadius: 12,
                    border: BORDER,
                    background: "white",
                    fontWeight: 1000,
                    cursor: "pointer",
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: 14, background: BG, overflowY: "auto" }}>
              {/* TOP: Monthly goals + daily totals */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, alignItems: "start" }}>
                <div
                  style={{
                    border: BORDER,
                    borderRadius: 16,
                    background: CARD,
                    boxShadow: SOFT_SHADOW,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 1100, fontSize: 13, letterSpacing: -0.1 }}>Store Monthly Goals</div>
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { k: "Sales", v: money0(monthlySalesGoal) },
                      { k: "Txns", v: int(monthlyTxnsGoal) },
                      { k: "ATV", v: money2(monthlyAtv) },
                    ].map((x) => (
                      <div key={x.k} style={{ border: BORDER, borderRadius: 14, padding: 10, background: "#ffffff" }}>
                        <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>{x.k}</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 1100 }}>{x.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, fontWeight: 1100, fontSize: 13, letterSpacing: -0.1 }}>Daily Totals</div>
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { k: "Sales", v: money0(dailyTotals.sales) },
                      { k: "Txns", v: int(dailyTotals.txns) },
                      { k: "ATV", v: money2(dailyTotals.atv) },
                    ].map((x) => (
                      <div key={x.k} style={{ border: BORDER, borderRadius: 14, padding: 10, background: "#fbfcfe" }}>
                        <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 1000 }}>{x.k}</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 1100 }}>{x.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>{sourceLabel}</div>
                  <div style={{ marginTop: 8, fontSize: 11, fontWeight: 900, color: ACE_RED }}>
                    Tip: set closed days to 0 txns / $0 sales. Rows remain (0 values) so history stays clean.
                  </div>
                </div>

                <div
                  style={{
                    border: BORDER,
                    borderRadius: 16,
                    background: CARD,
                    boxShadow: SOFT_SHADOW,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 1100, fontSize: 13 }}>Store</div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ padding: 10, borderRadius: 12, border: BORDER, background: "#fbfcfe", fontWeight: 1000 }}>
                      {storeId} — {storeName}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, fontWeight: 1100, fontSize: 13 }}>Month</div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ padding: 10, borderRadius: 12, border: BORDER, background: "#fbfcfe", fontWeight: 1000 }}>
                      {new Date(monthStart + "T00:00:00").toLocaleString(undefined, { month: "long", year: "numeric" })}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, fontWeight: 1100, fontSize: 13 }}>Closed dates (YYYY-MM-DD)</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, lineHeight: 1.35 }}>
                    Optional. Comma/space/newline separated. These days will be forced to 0 in suggestions.
                  </div>
                  <textarea
                    value={closedDatesText}
                    onChange={(e) => setClosedDatesText(e.target.value)}
                    placeholder="2025-12-25, 2025-01-01"
                    style={{
                      marginTop: 8,
                      width: "100%",
                      minHeight: 72,
                      resize: "vertical",
                      padding: 10,
                      borderRadius: 12,
                      border: BORDER,
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>

              {/* Buttons row */}
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={resetEven}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: BORDER,
                    background: "white",
                    fontWeight: 1000,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  Reset (Even Daily)
                </button>

                <button
                  onClick={resetDow}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: BORDER,
                    background: "white",
                    fontWeight: 1000,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  Reset DOW
                </button>

                <button
                  onClick={() => setAllDow(1)}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: BORDER,
                    background: "white",
                    fontWeight: 1000,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  Set all = 1.00
                </button>

                <button
                  onClick={runSuggestion}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    background: "#0f172a",
                    color: "white",
                    fontWeight: 1100,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  {busy ? "Working…" : "Run Suggestion"}
                </button>
              </div>

              {msg ? (
                <div style={{ marginTop: 10, color: msg.toLowerCase().includes("saved") || msg.toLowerCase().includes("published") ? ACE_GREEN : ACE_RED, fontWeight: 900 }}>
                  {msg}
                </div>
              ) : null}

              {/* Calendar */}
              <div
                style={{
                  marginTop: 12,
                  border: BORDER,
                  borderRadius: 16,
                  overflow: "hidden",
                  background: CARD,
                  boxShadow: SOFT_SHADOW,
                }}
              >
                {/* Header row: DOW labels + inline DOW multiplier inputs */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    background: "#fafafa",
                    borderBottom: "1px solid #eef2f7",
                  }}
                >
                  {DOW.map((d, i) => (
                    <div key={d} style={{ padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 1100, fontSize: 12, color: "#334155" }}>{d}</div>
                      <input
                        type="number"
                        step="0.05"
                        value={dowMult[i]}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDowMult((prev) => {
                            const copy = [...prev];
                            copy[i] = Number.isFinite(v) && v > 0 ? v : 1;
                            return copy;
                          });
                        }}
                        style={{
                          width: 64,
                          padding: "6px 8px",
                          borderRadius: 10,
                          border: BORDER,
                          fontSize: 12,
                          fontWeight: 900,
                          background: "white",
                        }}
                        title="DOW multiplier used by Run Suggestion only"
                      />
                    </div>
                  ))}
                </div>

                {/* Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {calendarCells.map((c, idx) => {
                    const isLastCol = idx % 7 === 6;
                    const cellBorderRight = isLastCol ? "none" : "1px solid #f1f5f9";

                    if (c.type === "blank") {
                      return (
                        <div
                          key={idx}
                          style={{
                            height: 112,
                            borderBottom: "1px solid #f1f5f9",
                            borderRight: cellBorderRight,
                            background: "white",
                          }}
                        />
                      );
                    }

                    const cell = draftMap.get(c.date);
                    const pctVal = pctForDate(c.date);

                    const salesVal = Number(cell?.net_sales_goal ?? 0);
                    const txVal = Number(cell?.transactions_goal ?? 0);
                    const atvVal = atv(salesVal, txVal);

                    return (
                      <div
                        key={c.date}
                        style={{
                          height: 112,
                          padding: 10,
                          borderBottom: "1px solid #f1f5f9",
                          borderRight: cellBorderRight,
                          background: "white",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 1100, fontSize: 13 }}>{c.dayNum}</div>
                          <div style={{ fontSize: 10, opacity: 0.65 }}>
                            {pctVal === null ? "" : `${(pctVal * 100).toFixed(2)}%`}
                          </div>
                        </div>

                        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 58px", gap: 8 }}>
                          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 6 }}>
                            <input
                              type="number"
                              value={salesVal}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setDraftCells((prev) =>
                                  prev.map((x) =>
                                    x.goal_date === c.date ? { ...x, net_sales_goal: Number.isFinite(v) ? v : 0 } : x
                                  )
                                );
                              }}
                              style={{
                                width: "100%",
                                padding: "7px 8px",
                                borderRadius: 12,
                                border: BORDER,
                                fontWeight: 1100,
                                fontSize: 12,
                                lineHeight: "16px",
                              }}
                              aria-label={`Sales for ${c.date}`}
                            />

                            <input
                              type="number"
                              value={txVal}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setDraftCells((prev) =>
                                  prev.map((x) =>
                                    x.goal_date === c.date ? { ...x, transactions_goal: Number.isFinite(v) ? v : 0 } : x
                                  )
                                );
                              }}
                              style={{
                                width: "100%",
                                padding: "7px 8px",
                                borderRadius: 12,
                                border: BORDER,
                                fontWeight: 1100,
                                fontSize: 12,
                                lineHeight: "16px",
                              }}
                              aria-label={`Transactions for ${c.date}`}
                            />
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end" }}>
                            <div style={{ fontSize: 10, opacity: 0.65, lineHeight: "14px" }}>ATV</div>
                            <div style={{ fontSize: 11, fontWeight: 1000, lineHeight: "14px" }}>{money2(atvVal)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save/Publish */}
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  onClick={saveDraft}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: BORDER,
                    background: "white",
                    fontWeight: 1000,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  Save Draft
                </button>

                <button
                  onClick={publishToStore}
                  disabled={busy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${ACE_RED}`,
                    background: "white",
                    color: ACE_RED,
                    fontWeight: 1100,
                    cursor: busy ? "not-allowed" : "pointer",
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  Publish to Store
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
                Daily goals are a distribution of the monthly goal — not forecasting. Keep closures as rows with 0 goals.
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: 12, borderTop: "1px solid #eef2f7", background: "#fbfbfc", fontSize: 11, opacity: 0.75 }}>
              Publish only affects <b>daily_goals.is_published</b> for this month. Monthly “published” controls month visibility separately.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
