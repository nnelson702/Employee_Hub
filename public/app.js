// === CONFIG ===
// TODO: replace with your actual Supabase URL and anon key.
const SUPABASE_URL = "https://bvyrxqfffaxthrjfxjue.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2eXJ4cWZmZmF4dGhyamZ4anVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDkwMjEsImV4cCI6MjA3NzY4NTAyMX0.BK3LvTsDdLgFn5qNFHQoa4MTkGIe5sNvmVaA8uujvnM";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === DOM helpers ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const fmtMoney = (v) =>
  v == null
    ? "–"
    : Number(v).toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });

const fmtInt = (v) =>
  v == null ? "–" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

// global-ish state
let session = null;
let profile = null;
let currentStoreId = null;
let currentMonth = null;

// allowed tabs (always allowed)
const ALWAYS_TABS = new Set(["home", "sales", "deptwalk", "deptwalk-results", "b2b", "eir", "pop"]);
let allowedTabs = new Set(["home", "sales"]);

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  bindGlobalButtons();
  initAuth();
});

// === AUTH ===
async function initAuth() {
  // check existing session
  const { data } = await supabase.auth.getSession();
  session = data.session || null;
  updateAuthUI();

  // subscribe
  supabase.auth.onAuthStateChange((_event, sess) => {
    session = sess;
    updateAuthUI();
    if (sess) {
      loadProfileAndBoot();
    } else {
      profile = null;
      allowedTabs = new Set(["home", "sales"]);
      routeTo("home");
    }
  });

  if (session) {
    await loadProfileAndBoot();
  } else {
    routeTo("home");
  }
}

function bindGlobalButtons() {
  $("#btn-signin")?.addEventListener("click", async () => {
    const email = prompt("Email:");
    const password = prompt("Password:");
    if (!email || !password) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(`Sign-in error: ${error.message}`);
      return;
    }
    session = data.session;
    updateAuthUI();
    await loadProfileAndBoot();
  });

  $("#btn-signout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    session = null;
    updateAuthUI();
    routeTo("home");
  });

  $("#btn-close-modal")?.addEventListener("click", () => {
    $("#dayModal")?.classList.add("hidden");
  });
}

function updateAuthUI() {
  const signedIn = !!session;
  $("#btn-signin")?.classList.toggle("hidden", signedIn);
  $("#btn-signout")?.classList.toggle("hidden", !signedIn);
  $("#whoami").textContent = signedIn ? session.user.email : "";
  if (!signedIn) {
    setStatus("Not signed in.");
  }
}

async function loadProfileAndBoot() {
  if (!session) return;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_admin")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    setStatus(`Profile error: ${error.message}`);
    profile = null;
  } else if (data) {
    profile = data;
  } else {
    profile = { id: session.user.id, email: session.user.email, is_admin: false };
  }

  await loadTabPermissions();
  await populateStores();
  wireSalesPage();
  wireAdminPage();
  wireDeptWalkPage();

  routeTo("sales");
}

// === TABS / ROUTING ===
function setupNav() {
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = btn.getAttribute("data-route");
      if (route) routeTo(route);
    });
  });
}

async function loadTabPermissions() {
  allowedTabs = new Set(ALWAYS_TABS);
  if (profile?.is_admin) {
    allowedTabs.add("admin");
  }
  // If you want to use tab_access later, wire it here
  applyTabVisibility();
}

function applyTabVisibility() {
  $$(".nav-btn").forEach((btn) => {
    const route = btn.getAttribute("data-route");
    if (!route) return;
    if (route === "admin") {
      btn.classList.toggle("hidden", !profile?.is_admin);
      return;
    }
    // others always visible for now
  });
}

function routeTo(route) {
  // block admin if not admin
  if (route === "admin" && !profile?.is_admin) {
    setStatus("Admin only.");
    route = "home";
  }

  $$(".nav-btn").forEach((btn) => {
    const r = btn.getAttribute("data-route");
    btn.classList.toggle("active", r === route);
  });

  $$(".page").forEach((pg) => {
    pg.classList.add("hidden");
  });

  const pageEl = $(`#page-${route}`);
  if (pageEl) {
    pageEl.classList.remove("hidden");
  } else {
    $("#page-home")?.classList.remove("hidden");
  }
}

// === STATUS ===
function setStatus(msg) {
  const el = $("#status");
  if (el) el.textContent = msg || "";
}

// === STORES ===
async function populateStores() {
  const { data, error } = await supabase
    .from("stores")
    .select("store_id, store_name")
    .order("store_id", { ascending: true });

  if (error) {
    setStatus(`Store load error: ${error.message}`);
    return;
  }

  const storeSelects = ["#storeSelect", "#dw-store", "#admin-store"];
  storeSelects.forEach((sel) => {
    const s = $(sel);
    if (!s) return;
    s.innerHTML = "";
    data.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = row.store_id;
      opt.textContent = `${row.store_id} — ${row.store_name || ""}`;
      s.appendChild(opt);
    });
  });

  // default current store
  if (data.length > 0) {
    currentStoreId = data[0].store_id;
  }
}

// === SALES PAGE ===
function wireSalesPage() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mInput = $("#monthInput");
  if (mInput && !mInput.value) mInput.value = ym;
  currentMonth = mInput?.value || ym;

  // build DOW row
  buildDowRow();

  $("#btn-load")?.addEventListener("click", () => {
    const storeId = $("#storeSelect")?.value;
    const monthVal = $("#monthInput")?.value;
    if (!storeId || !monthVal) {
      setStatus("Select store and month.");
      return;
    }
    currentStoreId = storeId;
    currentMonth = monthVal;
    loadMonth(storeId, monthVal);
  });

  $("#monthInput")?.addEventListener("change", () => {
    currentMonth = $("#monthInput").value;
    if (currentStoreId && currentMonth) {
      loadMonth(currentStoreId, currentMonth);
    }
  });

  $("#storeSelect")?.addEventListener("change", () => {
    currentStoreId = $("#storeSelect").value;
    if (currentStoreId && currentMonth) {
      loadMonth(currentStoreId, currentMonth);
    }
  });

  $("#btn-apply-dow")?.addEventListener("click", () => {
    applyDowWeightsToMonth();
  });

  $("#btn-reset-dow")?.addEventListener("click", async () => {
    // reset weights to equal
    for (let i = 0; i < 7; i++) {
      const inp = document.getElementById(`dow-weight-${i}`);
      if (inp) inp.value = "1";
    }
    $("#dow-status").textContent = "Weights reset to equal. Applying…";
    await applyDowWeightsToMonth();
  });

  $("#btn-suggest-dow")?.addEventListener("click", async () => {
    await suggestDowFromHistory();
  });

  $("#btnSaveModal")?.addEventListener("click", async () => {
    await saveDayActualsFromModal();
  });

  // initial load
  if (currentStoreId && currentMonth) {
    loadMonth(currentStoreId, currentMonth);
  }
}

// load month data and render calendar
async function loadMonth(storeId, yyyyMM) {
  if (!storeId || !yyyyMM) return;

  setStatus("Loading forecast data…");

  // optional: call edge function to build forecast
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/build-forecast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ storeId, month: yyyyMM }),
    }).catch(() => {});
  } catch (e) {
    // ignore
  }

  const [yearStr, monthStr] = yyyyMM.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const firstDay = `${yearStr}-${monthStr}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStr = String(nextMonth).padStart(2, "0");
  const firstOfNext = `${nextYear}-${nextMonthStr}-01`;

  const { data, error } = await supabase
    .from("forecast_daily")
    .select("*")
    .eq("store_id", storeId)
    .gte("date", firstDay)
    .lt("date", firstOfNext)
    .order("date", { ascending: true });

  if (error) {
    setStatus(`Error loading forecast_daily: ${error.message}`);
    return;
  }

  const rows = data || [];
  renderSummary(rows);
  renderCalendar(yyyyMM, rows);
  updateDowHeaderFromRows(rows);
  setStatus("Month loaded.");
}

function renderSummary(rows) {
  const totalGoal = rows.reduce((sum, r) => sum + Number(r.sales_goal || 0), 0);
  const totalActual = rows.reduce((sum, r) => sum + Number(r.sales_actual || 0), 0);
  const totalTxnGoal = rows.reduce((sum, r) => sum + Number(r.txn_goal || 0), 0);
  const totalTxnActual = rows.reduce((sum, r) => sum + Number(r.txn_actual || 0), 0);

  $("#summary-sales").textContent = `${fmtMoney(totalActual)} / ${fmtMoney(totalGoal)}`;
  $("#summary-txns").textContent = `${fmtInt(totalTxnActual)} / ${fmtInt(totalTxnGoal)}`;
  const pct = totalGoal > 0 ? (totalActual / totalGoal) * 100 : 0;
  $("#summary-progress").textContent = totalGoal ? `${pct.toFixed(2)}%` : "–";
}

function renderCalendar(yyyyMM, rows) {
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

  // leading blanks
  for (let i = 0; i < firstDow; i++) {
    const blank = document.createElement("div");
    blank.className = "day-cell";
    cal.appendChild(blank);
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${yyyyMM}-${String(day).padStart(2, "0")}`;
    const row = rows.find((r) => r.date === dateStr) || {};
    const cell = document.createElement("div");
    cell.className = "day-cell";

    const isPast = new Date(dateStr) < new Date(todayKey);
    cell.classList.add(isPast ? "day-past" : "day-future");

    const gSales = Number(row.sales_goal || 0);
    const aSales = Number(row.sales_actual || 0);
    const gTxn = Number(row.txn_goal || 0);
    const aTxn = Number(row.txn_actual || 0);
    const gAtv = Number(row.atv_goal || 0);
    const aAtv = Number(row.atv_actual || 0);

    const showSales = isPast ? aSales : gSales;
    const showTxn = isPast ? aTxn : gTxn;
    const showAtv = isPast ? aAtv : gAtv;

    const pct = gSales > 0 && isPast ? (aSales / gSales) * 100 : 0;

    if (isPast && gSales > 0) {
      cell.classList.add(pct >= 100 ? "day-hit" : "day-miss");
    }

    cell.innerHTML = `
      <div class="day-cell-header">
        <span class="day-number">${String(day).padStart(2, "0")}</span>
        <button type="button" class="pill small">Details</button>
      </div>
      <div class="day-sales">${fmtMoney(showSales)}</div>
      <div class="day-row">
        <span class="label">Txn</span>
        <span>${fmtInt(showTxn)}</span>
      </div>
      <div class="day-row">
        <span class="label">ATV</span>
        <span>${fmtMoney(showAtv)}</span>
      </div>
      <div class="day-pct ${pct >= 100 ? "ok" : "bad"}">
        ${isPast && gSales > 0 ? pct.toFixed(1) + "%" : "&nbsp;"}
      </div>
    `;

    const btn = cell.querySelector("button");
    btn.addEventListener("click", () => openDayModal(dateStr, row));
    cal.appendChild(cell);
  }
}

// === DAY MODAL ===
let modalDate = null;
let modalRow = null;

function openDayModal(dateStr, row) {
  modalDate = dateStr;
  modalRow = row || {};
  $("#modalTitle").textContent = `Details – ${dateStr}`;
  const container = $("#modal-body");
  if (!container) return;

  const gSales = Number(row.sales_goal || 0);
  const aSales = Number(row.sales_actual || 0);
  const gTxn = Number(row.txn_goal || 0);
  const aTxn = Number(row.txn_actual || 0);
  const gAtv = Number(row.atv_goal || 0);
  const aAtv = Number(row.atv_actual || 0);

  container.innerHTML = `
    <div class="field">
      <label>Sales Goal</label>
      <div>${fmtMoney(gSales)}</div>
    </div>
    <div class="field">
      <label>Sales Actual</label>
      <input type="number" id="modal-sales-actual" value="${aSales || ""}" step="0.01" />
    </div>
    <div class="field">
      <label>Txn Goal</label>
      <div>${fmtInt(gTxn)}</div>
    </div>
    <div class="field">
      <label>Txn Actual</label>
      <input type="number" id="modal-txn-actual" value="${aTxn || ""}" step="1" />
    </div>
    <div class="field">
      <label>ATV Goal</label>
      <div>${fmtMoney(gAtv)}</div>
    </div>
    <div class="field">
      <label>ATV Actual</label>
      <input type="number" id="modal-atv-actual" value="${aAtv || ""}" step="0.01" />
    </div>
  `;

  $("#dayModal").classList.remove("hidden");
}

async function saveDayActualsFromModal() {
  if (!modalDate || !currentStoreId) return;
  const sAct = Number($("#modal-sales-actual")?.value || 0) || null;
  const tAct = Number($("#modal-txn-actual")?.value || 0) || null;
  const aAct = Number($("#modal-atv-actual")?.value || 0) || null;

  const payload = {
    store_id: currentStoreId,
    date: modalDate,
    sales_actual: sAct,
    txn_actual: tAct,
    atv_actual: aAct,
  };

  const { error } = await supabase.from("forecast_daily").upsert(payload, {
    onConflict: "store_id,date",
  });

  if (error) {
    setStatus(`Error saving actuals: ${error.message}`);
  } else {
    setStatus("Actuals saved.");
  }

  $("#dayModal").classList.add("hidden");
  if (currentStoreId && currentMonth) {
    loadMonth(currentStoreId, currentMonth);
  }
}

// === DOW WEIGHTS ===
function getMonthMeta(yyyyMM) {
  const [y, m] = yyyyMM.split("-");
  const year = Number(y);
  const month = Number(m);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yyyyMM}-${String(d).padStart(2, "0")}`;
    const dt = new Date(`${dateStr}T00:00:00`);
    days.push({
      date: dateStr,
      dayNum: d,
      dow: dt.getDay(), // 0=Sun…6=Sat
    });
  }
  return { daysInMonth, days };
}

function buildDowRow() {
  const rowEl = $("#dow-weights-row");
  if (!rowEl) return;
  if (rowEl.childElementCount > 0) return;

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = "";
  for (let i = 0; i < 7; i++) {
    html += `
      <div class="dow-cell">
        <div class="dow-cell-header">
          <span class="dow-name">${labels[i]}</span>
          <span class="dow-current" id="dow-pct-${i}">–</span>
        </div>
        <div class="dow-input-row">
          <input type="number" step="0.1" id="dow-weight-${i}" value="1" />
          <span class="dow-unit">weight</span>
        </div>
      </div>
    `;
  }
  rowEl.innerHTML = html;
}

function updateDowHeaderFromRows(rows) {
  const totalsByDow = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let total = 0;
  rows.forEach((r) => {
    const dt = new Date(`${r.date}T00:00:00`);
    const dow = dt.getDay();
    const goal = Number(r.sales_goal || 0);
    totalsByDow[dow] += goal;
    total += goal;
  });

  for (let i = 0; i < 7; i++) {
    const span = document.getElementById(`dow-pct-${i}`);
    if (!span) continue;
    if (!total) {
      span.textContent = "–";
    } else {
      const pct = (totalsByDow[i] / total) * 100;
      span.textContent = `${pct.toFixed(1)}%`;
    }
  }
}

// compute suggestions based on weights
function computeSuggestions(yyyyMM, monthlySales, monthlyTxn, dowWeights) {
  const { days } = getMonthMeta(yyyyMM);

  if (!monthlySales && !monthlyTxn) {
    const res = {};
    days.forEach((d) => {
      res[d.date] = { sales: 0, txn: 0, share: 0 };
    });
    return res;
  }

  let totalWeight = 0;
  const weightByDate = {};
  days.forEach((d) => {
    const w = Number(dowWeights[d.dow] || 1) || 1;
    weightByDate[d.date] = w;
    totalWeight += w;
  });
  if (totalWeight <= 0) totalWeight = days.length;

  // initial allocation
  const raw = [];
  days.forEach((d) => {
    const w = weightByDate[d.date];
    const share = w / totalWeight;
    const s = monthlySales ? monthlySales * share : 0;
    const t = monthlyTxn ? monthlyTxn * share : 0;
    raw.push({
      date: d.date,
      dow: d.dow,
      dayNum: d.dayNum,
      share,
      salesRaw: s,
      txnRaw: t,
    });
  });

  // round and adjust to exactly match monthly totals
  let salesRoundedTotal = 0;
  let txnRoundedTotal = 0;
  raw.forEach((r) => {
    r.sales = Math.round(r.salesRaw * 100) / 100;
    r.txn = Math.round(r.txnRaw);
    salesRoundedTotal += r.sales;
    txnRoundedTotal += r.txn;
  });

  const salesDelta = (monthlySales || 0) - salesRoundedTotal;
  const txnDelta = (monthlyTxn || 0) - txnRoundedTotal;

  // distribute deltas by adding/subtracting 0.01 or 1 tx at a time
  function distributeSalesDelta(delta) {
    let remaining = Math.round(delta * 100);
    const sign = remaining >= 0 ? 1 : -1;
    remaining = Math.abs(remaining);
    let idx = 0;
    while (remaining > 0 && raw.length > 0) {
      raw[idx].sales += sign * 0.01;
      remaining -= 1;
      idx = (idx + 1) % raw.length;
    }
  }

  function distributeTxnDelta(delta) {
    let remaining = delta;
    const sign = remaining >= 0 ? 1 : -1;
    remaining = Math.abs(remaining);
    let idx = 0;
    while (remaining > 0 && raw.length > 0) {
      raw[idx].txn += sign * 1;
      remaining -= 1;
      idx = (idx + 1) % raw.length;
    }
  }

  if (Math.abs(salesDelta) > 0.0001) distributeSalesDelta(salesDelta);
  if (Math.abs(txnDelta) > 0.5) distributeTxnDelta(txnDelta);

  const result = {};
  raw.forEach((r) => {
    result[r.date] = {
      sales: Math.round(r.sales * 100) / 100,
      txn: r.txn,
      share: Math.round(r.share * 1000000) / 1000000,
    };
  });
  return result;
}

async function applyDowWeightsToMonth() {
  if (!profile?.is_admin) {
    $("#dow-status").textContent = "Only admins can push daily goals.";
    return;
  }

  const storeId = $("#storeSelect")?.value;
  const monthVal = $("#monthInput")?.value;
  if (!storeId || !monthVal) {
    $("#dow-status").textContent = "Select store and month first.";
    return;
  }

  // load monthly goals
  const { data: mg, error: mgErr } = await supabase
    .from("monthly_goals")
    .select("store_id, month, sales_goal, txn_goal")
    .eq("store_id", storeId)
    .eq("month", monthVal)
    .maybeSingle();

  if (mgErr) {
    $("#dow-status").textContent = `Error loading monthly goals: ${mgErr.message}`;
    return;
  }
  if (!mg) {
    $("#dow-status").textContent = "No monthly goals set for this store/month.";
    return;
  }

  const monthlySales = Number(mg.sales_goal || 0);
  const monthlyTxn = Number(mg.txn_goal || 0);
  if (!monthlySales && !monthlyTxn) {
    $("#dow-status").textContent = "Monthly goals are zero; nothing to allocate.";
    return;
  }

  // collect weights
  const dowWeights = {};
  for (let i = 0; i < 7; i++) {
    const inp = document.getElementById(`dow-weight-${i}`);
    dowWeights[i] = inp ? Number(inp.value || 1) || 1 : 1;
  }

  const suggestions = computeSuggestions(monthVal, monthlySales, monthlyTxn, dowWeights);
  const { days } = getMonthMeta(monthVal);

  const payload = days.map((d) => {
    const sugg = suggestions[d.date] || { sales: 0, txn: 0, share: 0 };
    const jsDate = new Date(`${d.date}T00:00:00`);
    const weekOfMonth = Math.ceil((d.dayNum + jsDate.getDay()) / 7);
    const weekdayIndex = jsDate.getDay();
    return {
      store_id: storeId,
      date: d.date,
      sales_goal: sugg.sales,
      txn_goal: sugg.txn,
      daily_share: sugg.share,
      week_of_month: weekOfMonth,
      weekday_index: weekdayIndex,
    };
  });

  $("#dow-status").textContent = "Saving daily goals…";

  const { error } = await supabase.from("forecast_daily").upsert(payload, {
    onConflict: "store_id,date",
  });

  if (error) {
    console.error("Error saving daily goals from DOW weights", error);
    $("#dow-status").textContent = `Error saving: ${error.message}`;
    return;
  }

  $("#dow-status").textContent = "Daily goals updated from day-of-week weights.";
  if (storeId === currentStoreId && monthVal === currentMonth) {
    await loadMonth(storeId, monthVal);
  }
}

// suggest DOW from previous year same month
async function suggestDowFromHistory() {
  const storeId = $("#storeSelect")?.value;
  const monthVal = $("#monthInput")?.value;
  if (!storeId || !monthVal) {
    $("#dow-status").textContent = "Select store and month first.";
    return;
  }

  const [yearStr, monthStr] = monthVal.split("-");
  const prevYear = Number(yearStr) - 1;
  if (prevYear < 2000) {
    $("#dow-status").textContent = "No prior year data available.";
    return;
  }

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
    $("#dow-status").textContent = `Error loading history: ${error.message}`;
    return;
  }
  if (!data || data.length === 0) {
    $("#dow-status").textContent = "No historical data found for prior year.";
    return;
  }

  const totals = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  data.forEach((row) => {
    const dt = new Date(`${row.date}T00:00:00`);
    const dow = dt.getDay();
    const s = Number(row.net_sales || 0);
    totals[dow] += s;
    counts[dow] += 1;
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
    $("#dow-status").textContent = "Insufficient data to suggest weights.";
    return;
  }

  const overallAvg = sumAvgs / dowCount;
  const weights = {};
  for (let i = 0; i < 7; i++) {
    weights[i] = avg[i] != null ? avg[i] / overallAvg : 1;
  }

  for (let i = 0; i < 7; i++) {
    const inp = document.getElementById(`dow-weight-${i}`);
    if (inp) inp.value = weights[i].toFixed(2);
  }

  $("#dow-status").textContent = "Suggested weights loaded from prior-year history.";
}

// === ADMIN ===
function wireAdminPage() {
  $("#btn-admin-load-goals")?.addEventListener("click", async () => {
    const storeId = $("#admin-store")?.value;
    const monthVal = $("#admin-month")?.value;
    if (!storeId || !monthVal) return;

    const { data, error } = await supabase
      .from("monthly_goals")
      .select("sales_goal, txn_goal")
      .eq("store_id", storeId)
      .eq("month", monthVal)
      .maybeSingle();

    if (error) {
      $("#admin-goals-status").textContent = `Error: ${error.message}`;
      return;
    }
    $("#admin-sales-goal").value = data?.sales_goal ?? "";
    $("#admin-txn-goal").value = data?.txn_goal ?? "";
    $("#admin-goals-status").textContent = "Goals loaded.";
  });

  $("#btn-admin-save-goals")?.addEventListener("click", async () => {
    const storeId = $("#admin-store")?.value;
    const monthVal = $("#admin-month")?.value;
    const sGoal = Number($("#admin-sales-goal")?.value || 0) || 0;
    const tGoal = Number($("#admin-txn-goal")?.value || 0) || 0;

    if (!storeId || !monthVal) return;

    const payload = {
      store_id: storeId,
      month: monthVal,
      sales_goal: sGoal,
      txn_goal: tGoal,
    };

    const { error } = await supabase.from("monthly_goals").upsert(payload, {
      onConflict: "store_id,month",
    });

    if (error) {
      $("#admin-goals-status").textContent = `Error saving goals: ${error.message}`;
    } else {
      $("#admin-goals-status").textContent = "Goals saved.";
    }
  });
}

// === DEPT WALK ===
function wireDeptWalkPage() {
  $("#btn-dw-save")?.addEventListener("click", () => {
    // Placeholder: front-end only for now to avoid breaking if table not defined
    alert("Dept Walk save is not wired to a table yet. This is a safe placeholder.");
  });
}
