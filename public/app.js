/* =========================================================
   app_final_part01_of_10.txt
   Baseline Repair + Locks + P&L Placeholder
   PART 1/10 — Core bootstrap, config, auth, global state
   ========================================================= */

// NOTE: Concatenate parts 01 → 10 in order to form final app.js

const SUPABASE_URL = "https://bvyrxqfffaxthrjfxjue.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2eXJ4cWZmZmF4dGhyamZ4anVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDkwMjEsImV4cCI6MjA3NzY4NTAyMX0.BK3LvTsDdLgFn5qNFHQoa4MTkGIe5sNvmVaA8uujvnM";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let session = null;
let profile = null;
let currentStoreId = null;
let currentMonth = null;

let monthlyLocked = false;
let dailyLocked = false;

const BASE_TABS = new Set([
  "home",
  "sales",
  "pl-tools",
  "deptwalk",
  "deptwalk-results",
  "b2b",
  "eir",
  "pop"
]);

let allowedTabs = new Set([...BASE_TABS]);

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

async function initAuth() {
  const { data } = await supabase.auth.getSession();
  session = data?.session ?? null;

  supabase.auth.onAuthStateChange((_e, s) => {
    session = s;
    s ? onSignedIn() : onSignedOut();
  });

  session ? onSignedIn() : onSignedOut();
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = $("#email")?.value;
  const password = $("#password")?.value;
  if (!email || !password) return alert("Missing credentials");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
}

async function handleSignOut() {
  await supabase.auth.signOut();
}

async function onSignedIn() {
  $("#auth-block")?.classList.add("hidden");
  $("#app-shell")?.classList.remove("hidden");

  const { data } = await supabase.auth.getUser();
  $("#signedInUser").textContent = data?.user?.email ?? "";

  await loadProfile();
  await loadStores();
  await loadAccessAndTabs();
    const last = (() => {
      try { return localStorage.getItem("activeTab"); } catch (_) { return null; }
  })();

  showTab(last && allowedTabs.has(last) ? last : "home");

}

function onSignedOut() {
  $("#auth-block")?.classList.remove("hidden");
  $("#app-shell")?.classList.add("hidden");
}

async function loadProfile() {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  profile = data ?? { is_admin: false };
}

async function loadAccessAndTabs() {
  allowedTabs = new Set([...BASE_TABS]);
  const { data: accessRows, error } = await supabase
    .from("tab_access")
    .select("tab_key")
    .eq("user_id", session?.user?.id);

if (!error && accessRows?.length) {
  accessRows.forEach(r => allowedTabs.add(r.tab_key));
}

  if (profile?.is_admin) allowedTabs.add("admin");

  $$("[data-tab]").forEach((btn) =>
    btn.classList.toggle("hidden", !allowedTabs.has(btn.dataset.tab))
  );
}

function showTab(tab) {
  if (!allowedTabs.has(tab)) return;
  try { localStorage.setItem("activeTab", tab); } catch {}

  // persist last tab
  try { localStorage.setItem("activeTab", tab); } catch (_) {}

  $$("[data-tab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  $$(".tab-view").forEach((v) =>
    v.classList.toggle("hidden", v.id !== `tab-${tab}`)
  );
}

async function loadStores() {
  const sel = $("#storeSelect");
  if (!sel) return;
  sel.length = 1;

  const { data } = await supabase
    .from("stores_v")
    .select("store_id, name")
    .order("id");

  data?.forEach((s) => {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = `${s.store_id} — ${s.store_name}`;
    sel.appendChild(o);
  });

  if (!currentStoreId && data?.length) {
    currentStoreId = data[0].id;
    sel.value = currentStoreId;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-signin")?.addEventListener("click", handleSignIn);
  $("#auth-form")?.addEventListener("submit", handleSignIn);
  $("#btn-signout")?.addEventListener("click", handleSignOut);
  $$("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => showTab(b.dataset.tab))
  );
  initAuth();
});

/* ==== END PART 1 ==== */
/* =========================================================
   app_final_part02_of_10.txt
   PART 2/10 — Monthly Goals: load, save, lock/unlock
   ========================================================= */

// =====================
// MONTH HELPERS
// =====================
function getSelectedMonthValue() {
  const input = document.querySelector("#monthInput");
  if (!input || !input.value) return null;

  // Accept "YYYY-MM" or "YYYY-MM-DD"
  const m = input.value.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;

  return `${m[1]}-${m[2]}`;
}
function setMonthlyUIState(locked) {
  monthlyLocked = !!locked;
  const fields = [
    "#monthlySalesGoal",
    "#monthlyTxnGoal"
  ];
  fields.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.disabled = monthlyLocked;
  });

  const saveBtn = document.querySelector("#saveMonthlyBtn");
  const unlockBtn = document.querySelector("#unlockMonthlyBtn");
  if (saveBtn) saveBtn.disabled = monthlyLocked;
  if (unlockBtn) unlockBtn.classList.toggle("hidden", !monthlyLocked);
}

// =====================
// LOAD MONTHLY GOALS
// =====================
async function loadMonthlyGoals(storeId, monthVal) {
  const status = document.querySelector("#sales-status");
  if (status) status.textContent = "Loading monthly goals…";

  const { data, error } = await supabase
    .from("monthly_goals")
    .select("sales_goal, txn_goal, locked")
    .eq("store_id", storeId)
    .eq("month", monthVal)
    .maybeSingle();

  if (error) {
    if (status) status.textContent = `Error loading monthly goals: ${error.message}`;
    return;
  }

  document.querySelector("#monthlySalesGoal").value = data?.sales_goal ?? "";
  document.querySelector("#monthlyTxnGoal").value = data?.txn_goal ?? "";

  setMonthlyUIState(!!data?.locked);
  if (status) status.textContent = "";
}

// =====================
// SAVE + LOCK MONTHLY
// =====================
async function saveMonthlyGoals() {
  const storeId = document.querySelector("#storeSelect")?.value;
  const monthVal = getSelectedMonthValue();
  if (!storeId || !monthVal) return alert("Select store and month first.");

  const salesGoal = document.querySelector("#monthlySalesGoal").value
    ? Number(document.querySelector("#monthlySalesGoal").value)
    : null;
  const txnGoal = document.querySelector("#monthlyTxnGoal").value
    ? Number(document.querySelector("#monthlyTxnGoal").value)
    : null;

  const status = document.querySelector("#sales-status");
  if (status) status.textContent = "Saving and locking monthly goals…";

  const { error } = await supabase.from("monthly_goals").upsert(
    {
      store_id: storeId,
      month: monthVal,
      sales_goal: salesGoal,
      txn_goal: txnGoal,
      locked: true
    },
    { onConflict: "store_id,month" }
  );

  if (error) {
    if (status) status.textContent = `Error saving: ${error.message}`;
    return;
  }

  setMonthlyUIState(true);
  if (status) status.textContent = "Monthly goals saved and locked.";
}

// =====================
// UNLOCK MONTHLY (ADMIN)
// =====================
async function unlockMonthlyGoals() {
  if (!profile?.is_admin) {
    alert("Admin only.");
    return;
  }

  const storeId = document.querySelector("#storeSelect")?.value;
  const monthVal = getSelectedMonthValue();
  if (!storeId || !monthVal) return;

  const status = document.querySelector("#sales-status");
  if (status) status.textContent = "Unlocking monthly goals…";

  const { error } = await supabase
    .from("monthly_goals")
    .update({ locked: false })
    .eq("store_id", storeId)
    .eq("month", monthVal);

  if (error) {
    if (status) status.textContent = `Error unlocking: ${error.message}`;
    return;
  }

  setMonthlyUIState(false);
  if (status) status.textContent = "Monthly goals unlocked.";
}

// =====================
// BIND MONTHLY EVENTS
// =====================
document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#saveMonthlyBtn")
    ?.addEventListener("click", saveMonthlyGoals);
  document.querySelector("#unlockMonthlyBtn")
    ?.addEventListener("click", unlockMonthlyGoals);
});

/* ==== END PART 2 ==== */
/* =========================================================
   app_final_part03_of_10.txt
   PART 3/10 — Daily load, calendar render hookup, daily lock state
   ========================================================= */

// =====================
// DAILY UI STATE
// =====================
function setDailyUIState(locked) {
  dailyLocked = !!locked;

  // Disable DOW inputs + apply/suggest buttons when locked
  const dowInputs = [
    "#dow-sun","#dow-mon","#dow-tue","#dow-wed","#dow-thu","#dow-fri","#dow-sat"
  ];
  dowInputs.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.disabled = dailyLocked;
  });

  const applyBtn = document.querySelector("#applyDowBtn");
  const suggestBtn = document.querySelector("#suggestDowBtn");
  const saveDailyBtn = document.querySelector("#saveDailyBtn");
  const unlockDailyBtn = document.querySelector("#unlockDailyBtn");

  if (applyBtn) applyBtn.disabled = dailyLocked;
  if (suggestBtn) suggestBtn.disabled = dailyLocked;
  if (saveDailyBtn) saveDailyBtn.disabled = dailyLocked;

  if (unlockDailyBtn) unlockDailyBtn.classList.toggle("hidden", !dailyLocked);

  // Add a subtle lock indicator (if present in DOM)
  const lockBadge = document.querySelector("#dailyLockBadge");
  if (lockBadge) {
    lockBadge.textContent = dailyLocked ? "🔒 Locked" : "";
    lockBadge.classList.toggle("hidden", !dailyLocked);
  }
}

// =====================
// LOAD DAILY ROWS + LOCK STATE
// =====================
async function loadDailyRows(storeId, monthVal) {
  const status = document.querySelector("#dow-status");
  if (status) status.textContent = "Loading daily…";

  // Prefer unified view if present (has TY + LY + goals + actuals)
  try {
    const { data, error } = await supabase
      .from("v_calendar_month")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", monthVal)
      .order("date", { ascending: true });

    if (!error && data) {
      const monthLocked = (data || []).some(r => r.locked === true);
      setDailyUIState(monthLocked);
      if (status) status.textContent = "";
      return { rows: data || [], locked: monthLocked };
    }
  } catch (e) {
    // fall through
  }

  // Fallback: goals only from forecast_daily
  const start = `${monthVal}-01`;
  const end = `${monthVal}-31`;

  const { data, error } = await supabase
    .from("forecast_daily")
    .select("id,date,sales_goal,txn_goal,atv_goal,daily_share,week_of_month,weekday_index,locked")
    .eq("store_id", storeId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (error) {
    if (status) status.textContent = `Error loading daily: ${error.message}`;
    return { rows: [], locked: false };
  }

  const monthLocked = (data || []).some(r => r.locked === true);
  setDailyUIState(monthLocked);

  if (status) status.textContent = "";
  return { rows: data || [], locked: monthLocked };
}

// =====================
// LOAD ENTIRE MONTH (monthly + daily + calendar)
// ===================== (monthly + daily + calendar)
// =====================
async function loadMonth(storeId, monthVal) {
  currentStoreId = storeId;
  currentMonth = monthVal;

  // Monthly first
  await loadMonthlyGoals(storeId, monthVal);

  // Then daily
  const { rows } = await loadDailyRows(storeId, monthVal);

  // Render calendar if calendar container exists
  if (typeof buildCalendar === "function") {
    buildCalendar(storeId, monthVal, rows);
  }
}

// =====================
// LOAD MONTH BUTTON
// =====================
async function handleLoadMonthClick() {
  const storeId = document.querySelector("#storeSelect")?.value;
  const monthVal = getSelectedMonthValue();
  if (!storeId || !monthVal) return alert("Select store and month first.");
  await loadMonth(storeId, monthVal);
}

// =====================
// UNLOCK DAILY (ADMIN)
// =====================
async function unlockDailyPlan() {
  if (!profile?.is_admin) return alert("Admin only.");

  const storeId = document.querySelector("#storeSelect")?.value;
  const monthVal = getSelectedMonthValue();
  if (!storeId || !monthVal) return;

  const status = document.querySelector("#dow-status");
  if (status) status.textContent = "Unlocking daily plan…";

  const start = `${monthVal}-01`;
  const end = `${monthVal}-31`;

  const { error } = await supabase
    .from("forecast_daily")
    .update({ locked: false })
    .eq("store_id", storeId)
    .gte("date", start)
    .lte("date", end);

  if (error) {
    if (status) status.textContent = `Error unlocking: ${error.message}`;
    return;
  }

  setDailyUIState(false);
  if (status) status.textContent = "Daily plan unlocked.";
}

// =====================
// BIND MONTH LOAD + DAILY UNLOCK
// =====================
document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#loadMonthBtn")
    ?.addEventListener("click", handleLoadMonthClick);

  document.querySelector("#unlockDailyBtn")
    ?.addEventListener("click", unlockDailyPlan);
});

/* ==== END PART 3 ==== */
/* =========================================================
   app_final_part04_of_10.txt
   PART 4/10 — DOW weights → daily suggestions, save + lock daily plan
   ========================================================= */

// =====================
// DOW WEIGHTS HELPERS
// =====================
function getDowWeights() {
  return {
    0: Number(document.querySelector("#dow-sun")?.value || 0),
    1: Number(document.querySelector("#dow-mon")?.value || 0),
    2: Number(document.querySelector("#dow-tue")?.value || 0),
    3: Number(document.querySelector("#dow-wed")?.value || 0),
    4: Number(document.querySelector("#dow-thu")?.value || 0),
    5: Number(document.querySelector("#dow-fri")?.value || 0),
    6: Number(document.querySelector("#dow-sat")?.value || 0)
  };
}

function normalizeDowWeights(weights) {
  const sum = Object.values(weights).reduce((a,b)=>a+b,0);
  if (sum <= 0) return null;
  const out = {};
  for (let i=0;i<7;i++) out[i] = weights[i] / sum;
  return out;
}

// =====================
// APPLY DOW WEIGHTS → UPSERT DAILY GOALS
// =====================
async function applyDowWeightsToMonth() {
  if (dailyLocked) return alert("Daily plan is locked. Unlock to modify.");

  const storeId = document.querySelector("#storeSelect")?.value;
  const monthVal = getSelectedMonthValue();
  if (!storeId || !monthVal) return alert("Select store and month first.");

  // Require monthly goals exist (saved/locked or saved/unlocked)
  const { data: mg, error: mgErr } = await supabase
    .from("monthly_goals")
    .select("sales_goal, txn_goal, locked")
    .eq("store_id", storeId)
    .eq("month", monthVal)
    .maybeSingle();

  if (mgErr) return alert("Error loading monthly goals: " + mgErr.message);
  if (!mg || (mg.sales_goal == null && mg.txn_goal == null)) {
    alert("You must save monthly goals before generating daily breakdown.");
    return;
  }

  const monthlySales = Number(mg.sales_goal || 0);
  const monthlyTxn = Number(mg.txn_goal || 0);
  if (monthlySales === 0 && monthlyTxn === 0) {
    alert("Monthly goals are zero. Set monthly goals before generating daily breakdown.");
    return;
  }

  const weights = getDowWeights();
  const norm = normalizeDowWeights(weights);
  if (!norm) {
    alert("Day-of-week weights must sum to > 0.");
    return;
  }

  const status = document.querySelector("#dow-status");
  if (status) status.textContent = "Building daily breakdown…";

  const [yearStr, monthStr] = monthVal.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();

  // Build daily suggestions
  let runningSales = 0;
  let runningTxn = 0;
  const dailyPayload = [];

  for (let day=1; day<=daysInMonth; day++) {
    const dateObj = new Date(year, month-1, day);
    const dow = dateObj.getDay();
    const share = norm[dow];

    const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2,"0")}`;

    const salesGoal = Math.round(monthlySales * share * 100) / 100;
    const txnGoal = Math.round(monthlyTxn * share);

    runningSales += salesGoal;
    runningTxn += txnGoal;

    const atvGoal = txnGoal > 0 ? Number((salesGoal / txnGoal).toFixed(2)) : 0;

    // week_of_month rough calc
    const weekOfMonth = Math.ceil((day + dateObj.getDay()) / 7);
    const weekdayIndex = dow;

    dailyPayload.push({
      store_id: storeId,
      date: dateStr,
      sales_goal: salesGoal,
      txn_goal: txnGoal,
      atv_goal: atvGoal,
      daily_share: share,
      week_of_month: weekOfMonth,
      weekday_index: weekdayIndex,
      locked: false
    });
  }

  // Fix rounding drift on last day
  if (daysInMonth > 0) {
    const salesDiff = Math.round((monthlySales - runningSales) * 100) / 100;
    const txnDiff = Math.round(monthlyTxn - runningTxn);
    const lastIdx = dailyPayload.length - 1;
    if (salesDiff !== 0) dailyPayload[lastIdx].sales_goal = Math.round((dailyPayload[lastIdx].sales_goal + salesDiff) * 100) / 100;
    if (txnDiff !== 0) dailyPayload[lastIdx].txn_goal = Math.max(0, dailyPayload[lastIdx].txn_goal + txnDiff);
    if (dailyPayload[lastIdx].txn_goal > 0) {
      dailyPayload[lastIdx].atv_goal = Number((dailyPayload[lastIdx].sales_goal / dailyPayload[lastIdx].txn_goal).toFixed(2));
    }
  }

  const { error } = await supabase
    .from("forecast_daily")
    .upsert(dailyPayload, { onConflict: "store_id,date" });

  if (error) {
    if (status) status.textContent = "Error saving daily breakdown: " + error.message;
    console.error("applyDowWeightsToMonth error:", error);
    return;
  }

  if (status) status.textContent = "Daily breakdown updated.";
  await loadMonth(storeId, monthVal);
}

// =====================
// SAVE + LOCK DAILY PLAN (ADMIN)
// =====================
async function saveAndLockDailyPlan() {
  if (!profile?.is_admin) return alert("Admin only.");
  if (dailyLocked) return alert("Daily plan is already locked.");

  const storeId = document.querySelector("#storeSelect")?.value;
  const monthVal = getSelectedMonthValue();
  if (!storeId || !monthVal) return alert("Select store and month first.");

  const status = document.querySelector("#dow-status");
  if (status) status.textContent = "Locking daily plan…";

  const start = `${monthVal}-01`;
  const end = `${monthVal}-31`;

  const { error } = await supabase
    .from("forecast_daily")
    .update({ locked: true })
    .eq("store_id", storeId)
    .gte("date", start)
    .lte("date", end);

  if (error) {
    if (status) status.textContent = "Error locking daily plan: " + error.message;
    return;
  }

  setDailyUIState(true);
  if (status) status.textContent = "Daily plan saved and locked.";
}

// =====================
// OPTIONAL: SUGGEST DOW FROM HISTORY (placeholder hook)
// =====================
async function suggestDowFromHistory() {
  // If you have an RPC, wire it here. This keeps compatibility with your UI.
  const status = document.querySelector("#dow-status");
  if (status) status.textContent = "Dow suggestion not configured yet.";
}

// =====================
// BIND DOW + DAILY LOCK BUTTONS
// =====================
document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#applyDowBtn")
    ?.addEventListener("click", applyDowWeightsToMonth);

  document.querySelector("#suggestDowBtn")
    ?.addEventListener("click", suggestDowFromHistory);

  // Admin "Save Daily Plan" button (locks)
  document.querySelector("#saveDailyBtn")
    ?.addEventListener("click", saveAndLockDailyPlan);
});

/* ==== END PART 4 ==== */
/* =========================================================
   app_final_part05_of_10.txt
   PART 5/10 — Daily Details Modal (TY / LY split) + ATV calc
   ========================================================= */

// =====================
// DAY MODAL CREATION
// =====================
function ensureDayModal() {
  let modal = document.querySelector("#dayDetailsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "dayDetailsModal";
  modal.className = "modal-overlay hidden";
  modal.innerHTML = `
    <div class="modal">
      <h2 id="dayModalTitle">Daily Details</h2>

      <div class="modal-body two-col">
        <div class="col">
          <h3>This Year</h3>

          <label><span>Sales Goal</span>
            <input id="dd_sales_goal" type="number" step="0.01" />
          </label>

          <label><span>Sales Actual</span>
            <input id="dd_sales_actual" type="number" step="0.01" />
          </label>

          <label><span>Txn Goal</span>
            <input id="dd_txn_goal" type="number" />
          </label>

          <label><span>Txn Actual</span>
            <input id="dd_txn_actual" type="number" />
          </label>

          <label><span>ATV Goal</span>
            <input id="dd_atv_goal" type="number" step="0.01" />
          </label>

          <label><span>ATV Actual</span>
            <input id="dd_atv_actual" type="text" disabled />
          </label>
        </div>

        <div class="col">
          <h3>Last Year</h3>

          <label><span>Sales Actual</span>
            <input id="dd_sales_actual_ly" type="text" disabled />
          </label>

          <label><span>Txn Actual</span>
            <input id="dd_txn_actual_ly" type="text" disabled />
          </label>

          <label><span>ATV Actual</span>
            <input id="dd_atv_actual_ly" type="text" disabled />
          </label>
        </div>
      </div>

      <div class="modal-footer">
        <span id="dayModalStatus" class="modal-status"></span>
        <button id="saveDayBtn" class="btn-primary" type="button">Save Day</button>
        <button id="closeDayBtn" class="btn-secondary" type="button">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.querySelector("#closeDayBtn").onclick = closeDayModal;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDayModal();
  });

  return modal;
}

function closeDayModal() {
  document.querySelector("#dayDetailsModal")?.classList.add("hidden");
}

// =====================
// OPEN DAY MODAL
// =====================
async function openDayModal(dateStr, row) {
  ensureDayModal();

  document.querySelector("#dayModalTitle").textContent = dateStr;
  document.querySelector("#dayModalStatus").textContent = "";

  document.querySelector("#dd_sales_goal").value = row?.sales_goal ?? "";
  document.querySelector("#dd_sales_actual").value = row?.sales_actual ?? "";
  document.querySelector("#dd_txn_goal").value = row?.txn_goal ?? "";
  document.querySelector("#dd_txn_actual").value = row?.txn_actual ?? "";
  document.querySelector("#dd_atv_goal").value = row?.atv_goal ?? "";

  // ATV actual calculation
  if (row?.sales_actual != null && row?.txn_actual > 0) {
    document.querySelector("#dd_atv_actual").value =
      (row.sales_actual / row.txn_actual).toFixed(2);
  } else {
    document.querySelector("#dd_atv_actual").value = "";
  }

// Load Last Year actuals
// If v_calendar_month provided LY fields, use them
const lySales = row?.sales_actual_ly ?? row?.sales_ly ?? row?.ly_sales ?? null;
const lyTxn   = row?.txn_actual_ly ?? row?.txn_ly ?? row?.ly_txn ?? null;

if (lySales != null || lyTxn != null) {
  document.querySelector("#dd_sales_actual_ly").value = (lySales ?? "—");
  document.querySelector("#dd_txn_actual_ly").value = (lyTxn ?? "—");
  document.querySelector("#dd_atv_actual_ly").value =
    (lySales != null && lyTxn) ? (Number(lySales) / Number(lyTxn)).toFixed(2) : "—";
} else {
  // Fallback: hit historical_sales by date (if present)
  try {
    const d = new Date(dateStr);
    d.setFullYear(d.getFullYear() - 1);
    const lyDate = d.toISOString().slice(0, 10);

    const { data } = await supabase
      .from("historical_sales")
      .select("*")
      .eq("store_id", currentStoreId)
      .eq("date", lyDate)
      .maybeSingle();

    const hsSales = data?.sales ?? data?.net_sales ?? data?.sales_actual ?? null;
    const hsTxn = data?.txn ?? data?.txns ?? data?.transactions ?? data?.txn_actual ?? null;

    document.querySelector("#dd_sales_actual_ly").value = hsSales ?? "—";
    document.querySelector("#dd_txn_actual_ly").value = hsTxn ?? "—";
    document.querySelector("#dd_atv_actual_ly").value =
      (hsSales != null && hsTxn) ? (Number(hsSales) / Number(hsTxn)).toFixed(2) : "—";
  } catch {
    document.querySelector("#dd_sales_actual_ly").value = "—";
    document.querySelector("#dd_txn_actual_ly").value = "—";
    document.querySelector("#dd_atv_actual_ly").value = "—";
  }
}

document.querySelector("#saveDayBtn").onclickdocument.querySelector("#saveDayBtn").onclick = () => saveDayEdits(dateStr);
  document.querySelector("#dayDetailsModal").classList.remove("hidden");
}

// =====================
// SAVE DAY EDITS
// =====================
async function saveDayEdits(dateStr) {
  if (dailyLocked) {
    alert("Daily plan is locked. Unlock to edit.");
    return;
  }

  const salesGoal = Number(document.querySelector("#dd_sales_goal").value || 0);
  const salesActual = Number(document.querySelector("#dd_sales_actual").value || 0);
  const txnGoal = Number(document.querySelector("#dd_txn_goal").value || 0);
  const txnActual = Number(document.querySelector("#dd_txn_actual").value || 0);
  const atvGoal = Number(document.querySelector("#dd_atv_goal").value || 0);

  const atvActual =
    txnActual > 0 ? Number((salesActual / txnActual).toFixed(2)) : null;

  document.querySelector("#dayModalStatus").textContent = "Saving…";

  // Save GOALS (forecast_daily)
  const { error: goalErr } = await supabase.from("forecast_daily").upsert(
    {
      store_id: currentStoreId,
      date: dateStr,
      sales_goal: salesGoal,
      txn_goal: txnGoal,
      atv_goal: atvGoal
    },
    { onConflict: "store_id,date" }
  );

  if (goalErr) {
    document.querySelector("#dayModalStatus").textContent = goalErr.message;
    return;
  }

  // Save ACTUALS (actual_daily) if table exists
  // NOTE: Some schemas store actuals separately; we try and ignore failures.
  try {
    const { error: actErr } = await supabase.from("actual_daily").upsert(
      {
        store_id: currentStoreId,
        date: dateStr,
        sales_actual: salesActual,
        txn_actual: txnActual,
        atv_actual: atvActual
      },
      { onConflict: "store_id,date" }
    );

    if (actErr) {
      // don't block goals save
      console.warn("actual_daily save skipped:", actErr.message);
    }
  } catch (e) {
    // ignore if table not accessible
  }

  document.querySelector("#dayModalStatus").textContent = "Saved.";
  await loadMonth(currentStoreId, currentMonth);
}

/* ==== END PART 5 ==== */
/* =========================================================
   app_final_part06_of_10.txt
   PART 6/10 — Calendar click hook + lock enforcement
   ========================================================= */

// =====================
// CALENDAR CELL CLICK HOOK
// =====================
function attachCalendarHandlers() {
  const cells = document.querySelectorAll(".calendar-cell[data-date]");
  cells.forEach((cell) => {
    cell.onclick = () => {
      const date = cell.dataset.date;
      const row = cell._rowData;
      if (!row) return;
      openDayModal(date, row);
    };
  });
}

// =====================
// PATCH buildCalendar SAFELY
// =====================
//
// This wraps your existing buildCalendar without rewriting it.
// It injects row data per cell and enforces lock styling.
//
if (typeof buildCalendar === "function") {
  const _buildCalendar = buildCalendar;

  buildCalendar = function (storeId, monthVal, rows) {
    // Call original calendar renderer
    _buildCalendar(storeId, monthVal, rows);

    // Attach row data + lock state (DATE-BASED MAPPING)
const rowByDate = new Map((rows || []).map(r => [r.date, r]));

const cells = document.querySelectorAll(".calendar-cell[data-date]");
cells.forEach((cell) => {
  const date = cell.dataset.date;
  const row = rowByDate.get(date) || null;
  cell._rowData = row;

  if (dailyLocked) cell.classList.add("locked");
  else cell.classList.remove("locked");
});
    attachCalendarHandlers();
  };
}

/* ==== END PART 6 ==== */
/* =========================================================
   app_final_part07_of_10.txt
   PART 7/10 — Admin: Manage Employees (profiles + tab access)
   ========================================================= */

/*
  Manage Employees UI (browser-safe):

  - profiles (id, email, full_name, is_admin)
  - tab_access (user_id, tab_name)

  NOTE: Inviting/creating users requires Supabase Admin API (service role key),
  which must NOT be used in the browser. This UI covers managing access for
  users that already exist in Auth/profiles.
*/

function adminOnlyGuard() {
  if (!profile?.is_admin) {
    alert("Admin only.");
    return false;
  }
  return true;
}

function adminSetStatus(msg) {
  const s = document.querySelector("#admin-users-status");
  if (s) s.textContent = msg || "";
}

function _el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  children.forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}

async function adminLoadUsers() {
  if (!adminOnlyGuard()) return;

  adminSetStatus("Loading users…");

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_admin")
    .order("email", { ascending: true });

  if (error) {
    console.error("adminLoadUsers error:", error);
    adminSetStatus("Error: " + error.message);
    return;
  }

  renderAdminUsersTable(data || []);
  adminSetStatus("");
}

function renderAdminUsersTable(users) {
  const host = document.querySelector("#admin-users-table");
  if (!host) return;

  host.innerHTML = "";
  const table = _el("table", { class: "admin-table" });
  const thead = _el("thead", {}, [
    _el("tr", {}, [
      _el("th", {}, ["Email"]),
      _el("th", {}, ["Name"]),
      _el("th", {}, ["Admin"]),
      _el("th", {}, ["Access"]),
    ]),
  ]);

  const tbody = _el("tbody");

  users.forEach((u) => {
    const cb = _el("input", { type: "checkbox" });
    cb.checked = !!u.is_admin;
    cb.addEventListener("change", async () => {
      const ok = confirm(`Set admin=${cb.checked} for ${u.email}?`);
      if (!ok) {
        cb.checked = !cb.checked;
        return;
      }
      await adminSetIsAdmin(u.id, cb.checked);
    });

    const btn = _el(
      "button",
      { class: "btn-secondary", type: "button", onclick: () => adminOpenAccessEditor(u) },
      ["Edit Tabs"]
    );

    tbody.appendChild(
      _el("tr", {}, [
        _el("td", {}, [u.email || "—"]),
        _el("td", {}, [(u.full_name || u.name || u.display_name || "—")]),
        _el("td", {}, [cb]),
        _el("td", {}, [btn]),
      ])
    );
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  host.appendChild(table);
}

async function adminSetIsAdmin(userId, isAdmin) {
  adminSetStatus("Saving…");
  const { error } = await supabase.from("profiles").update({ is_admin: !!isAdmin }).eq("id", userId);
  if (error) {
    console.error("adminSetIsAdmin error:", error);
    alert("Error saving admin flag: " + error.message);
  }
  adminSetStatus("");
}

function ensureAccessModal() {
  let modal = document.querySelector("#adminAccessModal");
  if (modal) return modal;

  modal = _el("div", { id: "adminAccessModal", class: "modal-overlay hidden" }, [
    _el("div", { class: "modal" }, [
      _el("h2", { id: "adminAccessTitle" }, ["Edit User Access"]),
      _el("div", { class: "modal-body" }, [_el("div", { id: "adminAccessBody" }, ["Loading…"])]),
      _el("div", { class: "modal-footer" }, [
        _el("span", { id: "adminAccessStatus", class: "modal-status" }, [""]),
        _el("button", { id: "adminAccessCloseBtn", class: "btn-secondary", type: "button" }, ["Close"]),
      ]),
    ]),
  ]);

  document.body.appendChild(modal);
  document.querySelector("#adminAccessCloseBtn").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  return modal;
}

async function adminOpenAccessEditor(user) {
  if (!adminOnlyGuard()) return;

  const modal = ensureAccessModal();
  const title = document.querySelector("#adminAccessTitle");
  const body = document.querySelector("#adminAccessBody");
  const status = document.querySelector("#adminAccessStatus");

  if (title) title.textContent = `Access — ${user.email}`;
  if (body) body.textContent = "Loading…";
  if (status) status.textContent = "";

const { data, error } = await supabase.from("tab_access").select("tab_key").eq("user_id", user.id);
  if (error) {
    console.error("adminOpenAccessEditor error:", error);
    if (body) body.textContent = "Error: " + error.message;
    modal.classList.remove("hidden");
    return;
  }

const current = new Set((data || []).map((r) => r.tab_key));
  const tabs = Array.from(BASE_TABS);
  tabs.push("admin"); // allow grant admin tab visibility too (is_admin still required)

  if (body) body.innerHTML = "";
  const grid = _el("div", { class: "access-grid" });

  tabs.forEach((t) => {
    const id = `acc_${user.id}_${t}`;
    const cb = _el("input", { type: "checkbox", id });
    cb.checked = current.has(t);

    cb.addEventListener("change", async () => {
      if (status) status.textContent = "Saving…";
      if (cb.checked) {
        const { error: insErr } = await supabase
          .from("tab_access")
          .upsert({ user_id: user.id, tab_key: t }, { onConflict: "user_id,tab_key" });
        if (insErr) {
          console.error("grant tab error:", insErr);
          alert("Error granting: " + insErr.message);
          cb.checked = false;
        }
      } else {
        const { error: delErr } = await supabase.from("tab_access").delete().eq("user_id", user.id).eq("tab_key", t);
        if (delErr) {
          console.error("revoke tab error:", delErr);
          alert("Error revoking: " + delErr.message);
          cb.checked = true;
        }
      }
      if (status) status.textContent = "";
    });

    const label = _el("label", { class: "access-item", for: id }, [cb, _el("span", {}, [t])]);
    grid.appendChild(label);
  });

  body.appendChild(grid);
  modal.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#adminLoadUsersBtn")?.addEventListener("click", adminLoadUsers);
});

/* ==== END PART 7 ==== */
/* =========================================================
   app_final_part08_of_10.txt
   PART 8/10 — P&L Tools placeholder + Dept Walk placeholder (safe)
   ========================================================= */

function initPLToolsPlaceholder() {
  const host = document.querySelector("#tab-pl-tools");
  if (!host) return;
  if (host.dataset.initialized === "true") return;
  host.dataset.initialized = "true";

  const text = (host.textContent || "").trim();
  if (text.length > 20) return;

  host.innerHTML = `
    <div class="panel">
      <h2>P&L Tools</h2>
      <p>This tab is restored as a placeholder.</p>
      <div class="callout">
        <strong>Next phase:</strong> P&L imports, payroll/labor models, dashboards, and forecast vs actual variance.
      </div>
      <ul>
        <li>Upload / map monthly P&amp;L</li>
        <li>Labor % and RPLH tracking</li>
        <li>Variance reporting</li>
      </ul>
    </div>
  `;
}

function initDeptWalkPlaceholder() {
  const host = document.querySelector("#tab-deptwalk");
  if (!host) return;
  if (host.dataset.initialized === "true") return;
  host.dataset.initialized = "true";

  const text = (host.textContent || "").trim();
  if (text.length > 20) return;

  host.innerHTML = `
    <div class="panel">
      <h2>Dept Walks</h2>
      <p>Placeholder UI restored. Wiring to your backend comes next.</p>
      <p><strong>Status:</strong> UI placeholder only</p>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  initPLToolsPlaceholder();
  initDeptWalkPlaceholder();
});

/* ==== END PART 8 ==== */
/* =========================================================
   app_final_part09_of_10.txt
   PART 9/10 — Stability: defaults, change listeners, safe reload
   ========================================================= */

function ensureDefaultMonthInput() {
  const input = document.querySelector("#monthInput");
  if (!input) return;
  if (input.value) return;

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  input.value = `${ym}-01`;
}

async function onStoreOrMonthChange() {
  const storeId = document.querySelector("#storeSelect")?.value;
  const monthVal = getSelectedMonthValue();
  if (!storeId || !monthVal) return;
  if (typeof loadMonth !== "function") return;
  await loadMonth(storeId, monthVal);
}

function bindChangeReloads() {
  document.querySelector("#storeSelect")?.addEventListener("change", onStoreOrMonthChange);
  document.querySelector("#monthInput")?.addEventListener("change", onStoreOrMonthChange);
}

document.addEventListener("DOMContentLoaded", () => {
  ensureDefaultMonthInput();
  bindChangeReloads();
});

/* ==== END PART 9 ==== */
/* =========================================================
   app_final_part10_of_10.txt
   PART 10/10 — Final glue: lock badges + initial load safety net
   ========================================================= */

function _applyMonthlyLockBadge() {
  const badge = document.querySelector("#monthlyLockBadge");
  if (!badge) return;
  badge.textContent = monthlyLocked ? "🔒 Locked" : "";
  badge.classList.toggle("hidden", !monthlyLocked);
}

if (typeof setMonthlyUIState === "function") {
  const _old = setMonthlyUIState;
  setMonthlyUIState = function(locked) {
    _old(locked);
    _applyMonthlyLockBadge();
  };
}

document.addEventListener("DOMContentLoaded", () => {
  // Safety net: if signed in and selectors exist, load month once.
  setTimeout(() => {
    const storeId = document.querySelector("#storeSelect")?.value;
    const monthVal = getSelectedMonthValue();
    if (storeId && monthVal && typeof loadMonth === "function") {
      loadMonth(storeId, monthVal);
    }
  }, 0);
});

/* ==== END PART 10 ==== */
/* =========================================================
   HOTFIX OVERRIDES (append to END of app.js)
   Fixes schema mismatches causing:
   - stores dropdown not populating (bad column names)
   - profiles.full_name missing
   - tab_access.tab_name missing
   ========================================================= */

async function _trySelect(table, selectExpr, whereFn) {
  // Helper: try a select; return {data,error,selectExpr}
  try {
    let q = supabase.from(table).select(selectExpr);
    if (typeof whereFn === "function") q = whereFn(q);
    const { data, error } = await q;
    return { data, error, selectExpr };
  } catch (e) {
    return { data: null, error: { message: String(e) }, selectExpr };
  }
}

// ---------------------
// STORES: robust loader
// ---------------------
async function loadStores() {
  const sel = document.querySelector("#storeSelect");
  if (!sel) return;
  sel.length = 1;

  const candidates = [
    { id: "store_id", name: "name" },
    { id: "store_id", name: "store_name" },
    { id: "id", name: "name" },
    { id: "id", name: "store_name" },
    { id: "store_number", name: "name" },
    { id: "store_number", name: "store_name" },
  ];

  let rows = null;
  let used = null;
  let lastErr = null;

  for (const c of candidates) {
    const { data, error } = await _trySelect(
      "stores",
      `${c.id},${c.name}`,
      (q) => q.order(c.id, { ascending: true })
    );
    if (!error) {
      rows = data || [];
      used = c;
      break;
    }
    lastErr = error;
    // If it's not "undefined column" we stop early
    if (error?.code && error.code !== "42703") break;
  }

  if (!rows) {
    console.error("loadStores failed:", lastErr);
    const status = document.querySelector("#sales-status") || document.querySelector("#dow-status");
    if (status) status.textContent = "Error loading stores (check table columns / RLS).";
    return;
  }

  rows.forEach((s) => {
    const o = document.createElement("option");
    o.value = s[used.id];
    o.textContent = `${s[used.id]} — ${s[used.name] ?? ""}`.trim();
    sel.appendChild(o);
  });

  if (!currentStoreId && rows.length) {
    currentStoreId = rows[0][used.id];
    sel.value = currentStoreId;
  }
}

// ---------------------------------------
// TAB ACCESS: robust loader + editor
// ---------------------------------------
async function _loadTabAccessRows(userId) {
  const cols = ["tab_name", "tab", "tabkey", "tab_slug"];
  let lastErr = null;
  for (const col of cols) {
    const { data, error } = await _trySelect("tab_access", col, (q) => q.eq("user_id", userId));
    if (!error) return { data: data || [], col };
    lastErr = error;
    if (error?.code && error.code !== "42703") break;
  }
  console.warn("tab_access not readable (or column mismatch):", lastErr);
  return { data: [], col: null, error: lastErr };
}

async function loadAccessAndTabs() {
  allowedTabs = new Set([...BASE_TABS]);

  // tab_access is optional; if absent/mismatched, app still works with BASE_TABS
  const { data: accessRows } = await _loadTabAccessRows(session.user.id);
  (accessRows || []).forEach((r) => {
    const name = r.tab_name ?? r.tab ?? r.tabkey ?? r.tab_slug;
    if (name) allowedTabs.add(name);
  });

  if (profile?.is_admin) allowedTabs.add("admin");

  document.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.classList.toggle("hidden", !allowedTabs.has(btn.dataset.tab))
  );
}

// ---------------------------------------
// PROFILES: robust admin user loader
// ---------------------------------------
async function adminLoadUsers() {
  if (!profile?.is_admin) return alert("Admin only.");

  const setStatus = (msg) => {
    const s = document.querySelector("#admin-users-status");
    if (s) s.textContent = msg || "";
  };

  setStatus("Loading users…");

  // Try the widest set first, then fall back if columns don't exist.
  const selects = [
    "id,email,full_name,is_admin",
    "id,email,name,is_admin",
    "id,email,display_name,is_admin",
    "id,email,is_admin",
  ];

  let users = null;
  let lastErr = null;

  for (const sel of selects) {
    const { data, error } = await _trySelect("profiles", sel, (q) => q.order("email", { ascending: true }));
    if (!error) {
      users = data || [];
      break;
    }
    lastErr = error;
    if (error?.code && error.code !== "42703") break;
  }

  if (!users) {
    console.error("adminLoadUsers failed:", lastErr);
    setStatus("Error loading users (profiles columns mismatch).");
    return;
  }

  const host = document.querySelector("#admin-users-table");
  if (!host) return;

  host.innerHTML = "";
  const table = document.createElement("table");
  table.className = "admin-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Email</th><th>Name</th><th>Admin</th><th>Access</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  users.forEach((u) => {
    const tr = document.createElement("tr");

    const tdEmail = document.createElement("td");
    tdEmail.textContent = u.email ?? "—";

    const tdName = document.createElement("td");
    tdName.textContent = u.full_name ?? u.name ?? u.display_name ?? "—";

    const tdAdmin = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!u.is_admin;
    cb.addEventListener("change", async () => {
      const ok = confirm(`Set admin=${cb.checked} for ${u.email}?`);
      if (!ok) {
        cb.checked = !cb.checked;
        return;
      }
      setStatus("Saving…");
      const { error } = await supabase.from("profiles").update({ is_admin: !!cb.checked }).eq("id", u.id);
      setStatus("");
      if (error) {
        console.error("adminSetIsAdmin error:", error);
        alert("Error saving admin flag: " + error.message);
      }
    });
    tdAdmin.appendChild(cb);

    const tdAccess = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-secondary";
    btn.textContent = "Edit Tabs";
    btn.addEventListener("click", () => adminOpenAccessEditor(u));
    tdAccess.appendChild(btn);

    tr.appendChild(tdEmail);
    tr.appendChild(tdName);
    tr.appendChild(tdAdmin);
    tr.appendChild(tdAccess);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  host.appendChild(table);
  setStatus("");
}

async function adminOpenAccessEditor(user) {
  if (!profile?.is_admin) return alert("Admin only.");

  // Ensure modal exists (created by prior code). If not, create a minimal one.
  let modal = document.querySelector("#adminAccessModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminAccessModal";
    modal.className = "modal-overlay hidden";
    modal.innerHTML = `
      <div class="modal">
        <h2 id="adminAccessTitle">Edit User Access</h2>
        <div class="modal-body"><div id="adminAccessBody">Loading…</div></div>
        <div class="modal-footer">
          <span id="adminAccessStatus" class="modal-status"></span>
          <button id="adminAccessCloseBtn" class="btn-secondary" type="button">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.querySelector("#adminAccessCloseBtn").onclick = () => modal.classList.add("hidden");
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }

  const title = document.querySelector("#adminAccessTitle");
  const body = document.querySelector("#adminAccessBody");
  const status = document.querySelector("#adminAccessStatus");

  if (title) title.textContent = `Access — ${user.email}`;
  if (body) body.textContent = "Loading…";
  if (status) status.textContent = "";

  const { data: accessRows, col } = await _loadTabAccessRows(user.id);
  const current = new Set((accessRows || []).map((r) => r.tab_name ?? r.tab ?? r.tabkey ?? r.tab_slug).filter(Boolean));

  const tabs = Array.from(BASE_TABS);
  tabs.push("admin");

  if (body) body.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "access-grid";

  for (const t of tabs) {
    const id = `acc_${user.id}_${t}`;
    const label = document.createElement("label");
    label.className = "access-item";
    label.htmlFor = id;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = current.has(t);

    cb.addEventListener("change", async () => {
      if (status) status.textContent = "Saving…";

      if (!col) {
        // If tab_access column unknown, we can't write safely.
        alert("tab_access table/column mismatch. Fix schema or update hotfix mapping.");
        cb.checked = !cb.checked;
        if (status) status.textContent = "";
        return;
      }

      if (cb.checked) {
        const payload = { user_id: user.id };
        payload[col] = t;

        const { error } = await supabase.from("tab_access").upsert(payload, { onConflict: `user_id,${col}` });
        if (error) {
          console.error("grant tab error:", error);
          alert("Error granting: " + error.message);
          cb.checked = false;
        }
      } else {
        let q = supabase.from("tab_access").delete().eq("user_id", user.id);
        q = q.eq(col, t);
        const { error } = await q;
        if (error) {
          console.error("revoke tab error:", error);
          alert("Error revoking: " + error.message);
          cb.checked = true;
        }
      }

      if (status) status.textContent = "";
    });

    const span = document.createElement("span");
    span.textContent = t;

    label.appendChild(cb);
    label.appendChild(span);
    grid.appendChild(label);
  }

  body.appendChild(grid);
  modal.classList.remove("hidden");
}

/* =========================
   END HOTFIX OVERRIDES
   ========================= */
/* ===========================
   Calendar + Day Click Restore
   Paste at VERY BOTTOM of app.js
=========================== */
(function () {
  const $ = (s) => document.querySelector(s);

  function _money(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function _money2(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Only define buildCalendar if missing
  if (typeof window.buildCalendar !== "function") {
    window.buildCalendar = function buildCalendar(storeId, monthVal, rows) {
      // Try common calendar hosts
      const host =
        $("#calendarGrid") ||
        $("#calendar") ||
        document.querySelector(".calendar") ||
        $("#calendarHost");

      if (!host) return;

      const rowByDate = new Map((rows || []).map((r) => [r.date, r]));

      const [yStr, mStr] = (monthVal || "").split("-");
      const year = Number(yStr);
      const month = Number(mStr);
      if (!year || !month) {
        host.innerHTML = `<div class="muted">Select a store + month, then Load.</div>`;
        return;
      }

      const first = new Date(year, month - 1, 1);
      const startDow = first.getDay();
      const daysInMonth = new Date(year, month, 0).getDate();
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      let html = `
        <div class="calendar-wrap">
          <div class="calendar-header">
            ${dow.map((d) => `<div class="calendar-dow">${d}</div>`).join("")}
          </div>
          <div class="calendar-body">
      `;

      for (let i = 0; i < startDow; i++) html += `<div class="calendar-cell empty"></div>`;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yStr}-${mStr}-${String(day).padStart(2, "0")}`;
        const r = rowByDate.get(dateStr);

        const salesGoal = r?.sales_goal ?? null;
        const txnGoal = r?.txn_goal ?? null;
        const atvGoal = r?.atv_goal ?? (txnGoal ? (salesGoal / txnGoal) : null);

        const locked =
          typeof window.dailyLocked !== "undefined"
            ? !!window.dailyLocked
            : !!r?.locked;

        html += `
          <div class="calendar-cell ${locked ? "locked" : ""}" data-date="${dateStr}">
            <div class="calendar-daynum">${day}</div>
            <div class="calendar-metrics">
              <div class="mrow"><span class="mlabel">Sales</span><span class="mval">${_money(salesGoal)}</span></div>
              <div class="mrow"><span class="mlabel">Txn</span><span class="mval">${_money(txnGoal)}</span></div>
              <div class="mrow"><span class="mlabel">ATV</span><span class="mval">${_money2(atvGoal)}</span></div>
            </div>
          </div>
        `;
      }

      html += `</div></div>`;
      host.innerHTML = html;

      const cells = host.querySelectorAll(".calendar-cell[data-date]");
      cells.forEach((cell) => {
        const date = cell.dataset.date;
        cell._rowData = rowByDate.get(date) || { store_id: storeId, date };
        cell.onclick = () => {
          if (typeof window.openDayModal === "function") {
            window.openDayModal(date, cell._rowData);
          } else {
            alert("Day modal missing (openDayModal not loaded).");
          }
        };
      });
    };
  }
})();
