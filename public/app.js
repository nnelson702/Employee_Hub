// Helper: compute week_of_month (1–5) for a given date
function getWeekOfMonth(date) {
  const d = new Date(date);
  const day = d.getDate();
  const weekDay = d.getDay();
  return Math.ceil((day + (6 - weekDay)) / 7);
}

// Helper: compute weekday index (0=Sun…6=Sat)
function getWeekdayIndex(date) {
  return new Date(date).getDay();
}

// --- query helpers ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtMoney = (n) =>
  n == null
    ? "—"
    : Number(n).toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });

const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString());

// Tabs that require permission (home and sales are always allowed)
const RESTRICTED_TABS = [
  "pl",
  "deptwalk",
  "deptwalk-results",
  "pop",
  "b2b",
  "eir",
];

let allowedTabs = new Set(["home", "sales"]);

// --- state ---
let session = null;
let profile = null;
let currentStoreId = null;

// Supabase init – assumes global supabase script in index.html
// Replace with your actual URL & anon key if needed.
const SUPABASE_URL = "https://bvyrxqfffaxthrjfxjue.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY_HERE"; // <-- replace with your real anon key
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- auth ----------

async function initAuth() {
  const { data } = await supabase.auth.getSession();
  session = data.session || null;

  bindAuthButtons();

  if (session) {
    $("#status").textContent = "Signed in.";
    $("#btn-signout")?.classList.remove("hidden");
    $("#btn-signin")?.classList.add("hidden");
    $("#whoami").textContent = session.user.email;

    $("#topNav")?.classList.remove("hidden");

    await loadProfile();
    setupNav();
    routeTo("sales");
    await populateStoreDropdowns();

    const now = new Date();
    const mval = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    const monthInput = $("#monthInput");
    if (monthInput) monthInput.value = mval;

    const storeSelect = $("#storeSelect");
    if (storeSelect && monthInput && storeSelect.value) {
      currentStoreId = storeSelect.value;
      await loadMonth(storeSelect.value, monthInput.value);
    }
  } else {
    $("#whoami").textContent = "";
    $("#btn-signout")?.classList.add("hidden");
    $("#btn-signin")?.classList.remove("hidden");
    $("#topNav")?.classList.remove("hidden");
    $("#status").textContent = "Please sign in.";
  }
}

function bindAuthButtons() {
  $("#btn-signin")?.addEventListener("click", async () => {
    const email = prompt("Email:");
    const password = prompt("Password:");
    if (!email || !password) return;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      $("#status").textContent = error.message;
      return;
    }
    session = data.session;
    await initAuth();
  });

  $("#btn-signout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload();
  });
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_admin")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    $("#status").textContent = error.message;
    return;
  }

  profile =
    data || { id: session.user.id, email: session.user.email, is_admin: false };

  $("#topNav")
    ?.querySelector('[data-route="admin"]')
    ?.classList.toggle("hidden", !profile.is_admin);

  setupDowWeightsRow();
  const isAdmin = !!profile.is_admin;
  const dowToolbar = $("#dow-toolbar");
  if (dowToolbar) dowToolbar.classList.remove("hidden");

  $$(".dow-weight-input").forEach((inp) => {
    inp.disabled = !isAdmin;
  });

  $("#btn-apply-dow")?.classList.toggle("hidden", !isAdmin);
  $("#btn-reset-dow")?.classList.toggle("hidden", !isAdmin);
  $("#dow-status")?.classList.toggle("hidden", !isAdmin);
  $("#btn-suggest-dow")?.classList.toggle("hidden", !isAdmin);

  await loadTabPermissions();
}

// ----- tab permissions -----

async function loadTabPermissions() {
  allowedTabs = new Set(["home", "sales"]);
  if (!profile) return;

  if (profile.is_admin) {
    RESTRICTED_TABS.forEach((t) => allowedTabs.add(t));
    allowedTabs.add("admin");
    applyTabVisibility();
    return;
  }

  const { data, error } = await supabase
    .from("tab_access")
    .select("tab_key")
    .eq("user_id", profile.id);

  if (!error && data) {
    data.forEach((row) => allowedTabs.add(row.tab_key));
  }

  applyTabVisibility();
}

function applyTabVisibility() {
  const navButtons = $$("#topNav button");
  if (!navButtons.length) return;

  navButtons.forEach((btn) => {
    const route = btn.getAttribute("data-route");
    if (!route) return;

    if (route === "home" || route === "sales") {
      btn.classList.remove("hidden");
      return;
    }

    if (route === "admin") {
      btn.classList.toggle("hidden", !profile?.is_admin);
      return;
    }

    btn.classList.toggle("hidden", !allowedTabs.has(route));
  });
}

// ---------- routing ----------

function setupNav() {
  $("#topNav")?.addEventListener("click", (e) => {
    if (e.target.matches("button[data-route]")) {
      routeTo(e.target.getAttribute("data-route"));
    }
  });
}

function routeTo(route) {
  if (route !== "home" && route !== "sales") {
    if (route === "admin") {
      if (!profile?.is_admin) route = "home";
    } else if (!allowedTabs.has(route)) {
      route = "sales";
    }
  }

  $$("#topNav button").forEach((b) =>
    b.classList.toggle("active", b.getAttribute("data-route") === route)
  );

  $$(".page").forEach((p) => p.classList.add("hidden"));

  switch (route) {
    case "home":
      $("#page-home")?.classList.remove("hidden");
      break;
    case "sales":
      $("#page-sales")?.classList.remove("hidden");
      break;
    case "admin":
      if (profile?.is_admin) {
        $("#page-admin")?.classList.remove("hidden");
        bootAdmin();
      } else {
        $("#status").textContent = "Admin only.";
        routeTo("home");
      }
      break;
    default:
      $("#page-sales")?.classList.remove("hidden");
  }
}

// ---------- sales page ----------

$("#btn-load")?.addEventListener("click", async () => {
  const storeId = $("#storeSelect")?.value;
  const month = $("#monthInput")?.value;
  currentStoreId = storeId;
  if (!storeId || !month) return;
  $("#status").textContent = "Month loaded.";
  await loadMonth(storeId, month);
});

function handleStoreOrMonthChange() {
  const storeId = $("#storeSelect")?.value;
  const month = $("#monthInput")?.value;
  if (!storeId || !month) return;
  currentStoreId = storeId;
  loadMonth(storeId, month);
}

$("#storeSelect")?.addEventListener("change", handleStoreOrMonthChange);
$("#monthInput")?.addEventListener("change", handleStoreOrMonthChange);

async function populateStoreDropdowns() {
  // Attempt to load user-specific stores via view; fallback to all stores
  const { data, error } = await supabase
    .from("v_user_stores")
    .select("store_id, store_name")
    .order("store_id");

  let stores = data;

  if (error && error.code !== "PGRST116") {
    $("#status").textContent = error.message;
    return;
  }

  if (!stores) {
    const { data: d2, error: e2 } = await supabase
      .from("stores")
      .select("store_id, store_name")
      .order("store_id");
    if (e2) {
      $("#status").textContent = e2.message;
      return;
    }
    stores = d2;
  }

  const selIds = ["storeSelect"];
  selIds.forEach((id) => {
    const el = document.querySelector("#" + id);
    if (!el) return;
    el.innerHTML = "";
    for (const s of stores) {
      const opt = document.createElement("option");
      opt.value = s.store_id;
      opt.textContent = `${s.store_id} — ${s.store_name ?? ""}`.trim();
      el.appendChild(opt);
    }
  });
}

async function loadMonth(storeId, yyyyMM) {
  if (!storeId || !yyyyMM) return;

  try {
    await callBuildForecast(storeId, yyyyMM);
  } catch {
    // ignore
  }

  const [yearStr, monthStr] = yyyyMM.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!year || !month) {
    $("#status").textContent = "Invalid month.";
    return;
  }

  const firstDay = `${yearStr}-${monthStr}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStr = String(nextMonth).padStart(2, "0");
  const firstDayOfNextMonth = `${nextYear}-${nextMonthStr}-01`;

  const { data, error } = await supabase
    .from("forecast_daily")
    .select("*")
    .eq("store_id", storeId)
    .gte("date", firstDay)
    .lt("date", firstDayOfNextMonth)
    .order("date");

  if (error) {
    $("#status").textContent = error.message;
    return;
  }

  const rows = data || [];
  renderCalendar(rows, yyyyMM);
  renderSummary(storeId, yyyyMM, rows);
  updateDowHeaderFromRows(yyyyMM, rows);
}

function renderSummary(storeId, yyyyMM, rows) {
  const salesGoal = rows.reduce((a, r) => a + Number(r.sales_goal || 0), 0);
  const salesAct = rows.reduce((a, r) => a + Number(r.sales_actual || 0), 0);
  const pct = salesGoal > 0 ? (salesAct / salesGoal) * 100 : 0;

  $("#summary").textContent = `Sales: ${fmtMoney(
    salesAct
  )} / ${fmtMoney(salesGoal)}  |  ${pct.toFixed(2)}%`;
}

function renderCalendar(rows, yyyyMM) {
  const cal = $("#calendar");
  if (!cal) return;
  cal.innerHTML = "";

  const monthStart = new Date(`${yyyyMM}-01T00:00:00`);
  const firstDow = monthStart.getDay();
  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0
  ).getDate();

  for (let i = 0; i < firstDow; i++) {
    const d = document.createElement("div");
    d.className = "day";
    cal.appendChild(d);
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${yyyyMM}-${String(day).padStart(2, "0")}`;
    const row = rows.find((r) => r.date === date) || {};
    const div = document.createElement("div");
    div.className = "day";

    const isPast = new Date(date) < new Date(todayKey);
    div.classList.add(isPast ? "past" : "future");

    const goalSales = Number(row.sales_goal || 0);
    const actSales = Number(row.sales_actual || 0);
    const goalTxn = Number(row.txn_goal || 0);
    const actTxn = Number(row.txn_actual || 0);
    const goalAtv = Number(row.atv_goal || 0);
    const actAtv = Number(row.atv_actual || 0);
    const pctToGoal = goalSales > 0 ? (actSales / goalSales) * 100 : 0;

    if (isPast && goalSales > 0) {
      div.classList.add(pctToGoal >= 100 ? "goal-hit" : "goal-miss");
    }

    const salesDisplay = isPast ? fmtMoney(actSales) : fmtMoney(goalSales);
    const txnDisplay = isPast ? fmtInt(actTxn) : fmtInt(goalTxn);
    const atvDisplay = isPast ? fmtMoney(actAtv) : fmtMoney(goalAtv);
    const pctDisplay = isPast ? `${pctToGoal.toFixed(2)}%` : "";

    div.innerHTML = `
      <div class="num">
        <span>${String(day).padStart(2, "0")}</span>
        <button class="details pill" type="button">Details</button>
      </div>
      <div class="sales">${salesDisplay}</div>
      <div class="row">
        <div class="bold">${txnDisplay}</div>
        <div class="muted">${atvDisplay}</div>
      </div>
      <div class="pct ${pctToGoal >= 100 ? "ok" : "bad"}">
        ${pctDisplay || "&nbsp;"}
      </div>
    `.replace(/\s+/g, " ");

    div.querySelector(".details")?.addEventListener("click", () =>
      openDayModal(date, row)
    );

    cal.appendChild(div);
  }
}

// ---- modal basics ----

let modalDate = null;

function openDayModal(date, row) {
  modalDate = date;
  $("#modalTitle").textContent = `${date} — Day details`;
  buildKpiCards(row);
  $("#dayModal")?.classList.remove("hidden");
}

$("#btnCloseModal")?.addEventListener("click", () => {
  $("#dayModal")?.classList.add("hidden");
  modalDate = null;
});

$("#btnSaveModal")?.addEventListener("click", async () => {
  if (!currentStoreId || !modalDate) return;
  const payload = { store_id: currentStoreId, date: modalDate };
  const { error } = await supabase.from("actual_daily").upsert(payload);
  if (error) {
    $("#status").textContent = error.message;
    return;
  }

  $("#dayModal")?.classList.add("hidden");

  const month = $("#monthInput")?.value;
  if (currentStoreId && month) {
    await loadMonth(currentStoreId, month);
  }
});

$("#btn-clear-all")?.addEventListener("click", async () => {
  if (!modalDate || !currentStoreId) return;

  const { error } = await supabase
    .from("actual_daily")
    .delete()
    .eq("store_id", currentStoreId)
    .eq("date", modalDate);

  if (error) {
    $("#status").textContent = error.message;
    return;
  }

  $("#dayModal")?.classList.add("hidden");

  const month = $("#monthInput")?.value;
  if (currentStoreId && month) {
    await loadMonth(currentStoreId, month);
  }
});

// ---- Edge function call (best-effort) ----

async function callBuildForecast(storeId, yyyyMM) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/build-forecast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ storeId, month: yyyyMM }),
    });
  } catch (err) {
    console.warn("build-forecast call failed (non-blocking)", err);
  }
}

// --------------------------------------------------------
// DAY-OF-WEEK WEIGHTS
// --------------------------------------------------------

function getMonthMeta(yyyyMM) {
  const [yearStr, monthStr] = yyyyMM.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yyyyMM}-${String(d).padStart(2, "0")}`;
    const dt = new Date(`${dateStr}T00:00:00`);
    days.push({ date: dateStr, dayNum: d, dow: dt.getDay() });
  }

  return { daysInMonth, days };
}

const DOW_LABELS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

// UPDATED: now includes share
function computeSuggestions(yyyyMM, monthlySales, monthlyTxn, dowWeights) {
  const { days } = getMonthMeta(yyyyMM);
  // If no monthly goals, every suggestion is zero
  if (!monthlySales && !monthlyTxn) {
    return days.reduce((acc, d) => {
      acc[d.date] = { sales: 0, txn: 0, share: 0 };
      return acc;
    }, {});
  }
  let totalWeight = 0;
  const perDayWeight = {};
  // Collect weights and total
  days.forEach((d) => {
    const w = Number(dowWeights[d.dow] ?? 1) || 1;
    perDayWeight[d.date] = w;
    totalWeight += w;
  });
  if (totalWeight <= 0) totalWeight = days.length;
  const result = {};
  days.forEach((d) => {
    const w = perDayWeight[d.date];
    const share = w / totalWeight; // fraction of month this day represents
    const s = monthlySales ? monthlySales * share : 0;
    const t = monthlyTxn ? monthlyTxn * share : 0;
    result[d.date] = {
      sales: Math.round(s * 100) / 100,
      txn: Math.round(t),
      share: Math.round(share * 1000000) / 1000000,
    };
  });
  return result;
}

function setupDowWeightsRow() {
  const rowEl = $("#dow-weights-row");
  if (!rowEl) return;
  if (rowEl.childElementCount > 0) return;
  const cells = DOW_LABELS.map((label, idx) => {
    return `
      <div class="dow-cell">
        <div class="dow-header">
          <span class="dow-name">${label}</span>
          <span class="dow-current" id="dow-pct-${idx}">-</span>
        </div>
        <div class="dow-input-row">
          <input type="number" step="0.1" id="dow-weight-${idx}" class="dow-weight-input" value="1" />
          <span class="dow-unit">weight</span>
        </div>
      </div>
    `;
  }).join("");
  rowEl.innerHTML = cells;
}

function updateDowHeaderFromRows(yyyyMM, rows) {
  const totalsByDow = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let totalSales = 0;
  rows.forEach((r) => {
    const dateStr = r.date;
    if (!dateStr) return;
    const dt = new Date(`${dateStr}T00:00:00`);
    const dow = dt.getDay();
    const s = Number(r.sales_goal || 0);
    totalsByDow[dow] += s;
    totalSales += s;
  });
  for (let i = 0; i < 7; i++) {
    const span = document.getElementById(`dow-pct-${i}`);
    if (!span) continue;
    if (!totalSales) {
      span.textContent = "-";
    } else {
      const pct = (totalsByDow[i] / totalSales) * 100;
      span.textContent = `${pct.toFixed(2)}%`;
    }
  }
}

async function applyDowWeightsToMonth() {
  if (!profile?.is_admin) {
    $("#dow-status").textContent = "Day-of-week weights are admin-only.";
    return;
  }
  const storeId = $("#storeSelect")?.value;
  const month = $("#monthInput")?.value;
  if (!storeId || !month) {
    $("#dow-status").textContent = "Select a store and month first.";
    return;
  }
  $("#dow-status").textContent = "Loading monthly goals?";
  const { data: mg, error: mgErr } = await supabase
    .from("monthly_goals")
    .select("store_id,month,sales_goal,txn_goal")
    .eq("store_id", storeId)
    .eq("month", month)
    .maybeSingle();
  if (mgErr) {
    $("#dow-status").textContent = `Error loading monthly goals: ${mgErr.message}`;
    return;
  }
  if (!mg) {
    $("#dow-status").textContent =
      "No monthly goals saved yet (Admin > Monthly Goals).";
    return;
  }
  const monthlySales = Number(mg.sales_goal || 0);
  const monthlyTxn = Number(mg.txn_goal || 0);
  if (!monthlySales && !monthlyTxn) {
    $("#dow-status").textContent =
      "Monthly goals are zero or empty. Set goals in Admin first.";
    return;
  }

  const dowWeights = {};
  for (let i = 0; i < 7; i++) {
    const inp = document.getElementById(`dow-weight-${i}`);
    dowWeights[i] = inp ? Number(inp.value || 1) || 1 : 1;
  }

  const suggestions = computeSuggestions(
    month,
    monthlySales,
    monthlyTxn,
    dowWeights
  );

  const { days } = getMonthMeta(month);
  // Use the same store_id type as monthly_goals (uuid or numeric)
  // The mg.store_id value matches the primary key type expected in forecast_daily.
  const storeKey = mg.store_id || storeId;
  const payload = days.map((d) => {
    const sugg = suggestions[d.date] || { sales: 0, txn: 0, share: 0 };
    return {
      store_id: storeKey,
      date: d.date,
      sales_goal: sugg.sales,
      txn_goal: sugg.txn,
      daily_share: sugg.share,
    };
  });
  $("#dow-status").textContent = "Saving daily goals?";
  // append week_of_month and weekday_index to each record
  payload = payload.map((item) => ({
    ...item,
    week_of_month: getWeekOfMonth(item.date),
    weekday_index: getWeekdayIndex(item.date),
  }));
  // FIXED: removed the bad escaped quotes here
  const { error } = await supabase
    .from("forecast_daily")
    .upsert(payload, { onConflict: "store_id,date" });
  if (error) {
    console.error("Error saving daily goals from DOW weights", error);
    $("#dow-status").textContent = `Error saving: ${error.message}`;
    return;
  }
  $("#dow-status").textContent = "Daily goals updated from day-of-week weights.";
  const uiMonth = $("#monthInput")?.value;
  const uiStore = $("#storeSelect")?.value;
  if (uiMonth === month && uiStore === String(storeId)) {
    await loadMonth(storeId, month);
  }
}

async function resetDowToEqualAndApply() {
  for (let i = 0; i < 7; i++) {
    const inp = document.getElementById(`dow-weight-${i}`);
    if (inp) inp.value = "1";
  }
  $("#dow-status").textContent =
    "Weights reset to equal. Applying to daily goals?";
  await applyDowWeightsToMonth();
}

// --------------------------------------------------------
// Home page post placeholder (simple UI only)
// --------------------------------------------------------

function buildKpiCards(row) {
  $("#modal-body").innerHTML = `
    <div class="microstatus">
      KPI editor placeholder. (We can wire detailed fields later.)
    </div>
  `;
}

// --------------------------------------------------------
// Admin stub
// --------------------------------------------------------

async function bootAdmin() {
  // Admin functionality stub – extend as needed
}

// --------------------------------------------------------
// Start the app
// --------------------------------------------------------

initAuth();

$("#btn-apply-dow")?.addEventListener("click", applyDowWeightsToMonth);
$("#btn-reset-dow")?.addEventListener("click", resetDowToEqualAndApply);
$("#btn-suggest-dow")?.addEventListener("click", async () => {
  const storeId = $("#storeSelect")?.value;
  const monthVal = $("#monthInput")?.value;
  if (!storeId || !monthVal) {
    $("#dow-status").textContent = "Select a store and month first.";
    return;
  }
  $("#dow-status").textContent =
    "Calculating day-of-week weight suggestions…";
  const weights = await suggestDowWeights(storeId, monthVal);
  if (!weights) {
    $("#dow-status").textContent =
      "No historical data available for weight suggestions.";
    return;
  }
  for (let i = 0; i < 7; i++) {
    const inp = document.getElementById(`dow-weight-${i}`);
    if (inp) {
      inp.value = weights[i].toFixed(2);
    }
  }
  $("#dow-status").textContent =
    "Suggested weights loaded. Review and click Apply to daily goals.";
});

// Suggest DOW weights from historical data (unchanged)
async function suggestDowWeights(storeId, yyyyMM) {
  if (!storeId || !yyyyMM) return null;
  const [yearStr, monthStr] = yyyyMM.split("-");
  const prevYear = Number(yearStr) - 1;
  if (prevYear < 2000) return null;
  const start = `${prevYear}-${monthStr}-01`;
  const daysInPrev = new Date(prevYear, Number(monthStr), 0).getDate();
  const end = `${prevYear}-${monthStr}-${String(daysInPrev).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("historical_sales")
    .select("date, net_sales")
    .eq("store_id", storeId)
    .gte("date", start)
    .lte("date", end);
  if (error) {
    console.warn("Error fetching historical sales for DOW suggestion", error);
    return null;
  }
  if (!data || data.length === 0) {
    return null;
  }
  const totals = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  data.forEach((row) => {
    const dateStr = row.date;
    const sale = Number(row.net_sales || 0);
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    totals[dow] += sale;
    counts[dow]++;
  });
  let sumAvgs = 0;
  let dowCount = 0;
  const avg = {};
  for (let i = 0; i < 7; i++) {
    if (counts[i] > 0) {
      avg[i] = totals[i] / counts[i];
      sumAvgs += avg[i];
      dowCount++;
    } else {
      avg[i] = null;
    }
  }
  if (dowCount === 0 || sumAvgs === 0) {
    return null;
  }
  const overallAvg = sumAvgs / dowCount;
  const weights = {};
  for (let i = 0; i < 7; i++) {
    if (avg[i] != null) {
      weights[i] = avg[i] / overallAvg;
    } else {
      weights[i] = 1;
    }
  }
  return weights;
}
