// --- bootstrap Supabase ---
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper: compute week of month (1–5)
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
    ? "-"
    : Number(n).toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });
const fmtInt = (n) => (n == null ? "-" : Number(n).toLocaleString());
const fmtPct = (p) => (p == null ? "-" : `${Number(p).toFixed(2)}%`);

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

// ---------- auth ----------
async function initAuth() {
  const { data } = await supabase.auth.getSession();
  session = data.session || null;
  bindAuthButtons();
  if (session) {
    $("#status").textContent = "Signed in.";
    $("#btn-signout")?.classList.remove("hidden");
    $("#whoami").textContent = session.user.email;
    $("#logged-out")?.classList.add("hidden");
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

    // Initialize home page post feature after login
    setupPostUi();
  } else {
    $("#whoami").textContent = "";
    $("#btn-signout")?.classList.add("hidden");
    $("#topNav")?.classList.add("hidden");
    $("#logged-out")?.classList.remove("hidden");
    $("#status").textContent = "Please sign in.";
  }
}

function bindAuthButtons() {
  $("#btn-signin")?.addEventListener("click", async () => {
    const email = $("#email").value.trim();
    const password = $("#password").value;
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
  $("#nav-admin")?.classList.toggle("hidden", !profile.is_admin);
  // DOW toolbar: visible to all; editable only for admins
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
  // show/hide DOW suggestion button for admin only
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
    case "pl":
      $("#page-pl")?.classList.remove("hidden");
      break;
    case "deptwalk":
      $("#page-deptwalk")?.classList.remove("hidden");
      break;
    case "deptwalk-results":
      $("#page-deptwalk-results")?.classList.remove("hidden");
      break;
    case "b2b":
      $("#page-b2b")?.classList.remove("hidden");
      break;
    case "eir":
      $("#page-eir")?.classList.remove("hidden");
      break;
    case "pop":
      $("#page-pop")?.classList.remove("hidden");
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
  const selIds = ["storeSelect", "sa-storeSelect", "mg-storeSelect"];
  selIds.forEach((id) => {
    const el = document.querySelector("#" + id);
    if (!el) return;
    el.innerHTML = "";
    for (const s of stores) {
      const opt = document.createElement("option");
      opt.value = s.store_id;
      opt.textContent = `${s.store_id} - ${s.store_name ?? ""}`.trim();
      el.appendChild(opt);
    }
  });
  await refreshUsersForSelect();
}

// ---------- loadMonth ----------
async function loadMonth(storeId, yyyyMM) {
  if (!storeId || !yyyyMM) return;
  try {
    await callBuildForecast(storeId, yyyyMM);
  } catch {}
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
  $("#summary").textContent = `Sales: ${fmtMoney(salesAct)} / ${fmtMoney(
    salesGoal
  )}  |  ${pct.toFixed(2)}%`;
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
      <div class="num">${String(day).padStart(2, "0")} <button class="details pill">Details</button></div>
      <div class="sales" style="font-size: clamp(18px, 2.2vw, 28px)">${salesDisplay}</div>
      <div class="row"><div class="bold">${txnDisplay}</div> <div class="muted">${atvDisplay}</div></div>
      <div class="pct ${pctToGoal >= 100 ? "ok" : "bad"}">${pctDisplay || "&nbsp;"}</div>
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
  $("#modalTitle").textContent = `${date} - Day details`;
  buildKpiCards(row);
  $("#dayModal")?.classList.remove("hidden");
}
$("#btnCloseModal")?.addEventListener("click", () => {
  $("#dayModal")?.classList.add("hidden");
  modalDate = null;
});
$("#btnSaveModal")?.addEventListener("click", async () => {
  const payload = collectModalValues();
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
  if (!modalDate) return;
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
  // optional: call serverless function to build forecast
  const { error } = await fetch(`${SUPABASE_URL}/functions/v1/build-forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ storeId, month: yyyyMM }),
  })
    .then((r) => r.json())
    .catch(() => ({ error: null }));
  if (error) console.warn(error);
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
function computeSuggestions(yyyyMM, monthlySales, monthlyTxn, dowWeights) {
  const { days } = getMonthMeta(yyyyMM);
  if (!monthlySales && !monthlyTxn) {
    return days.reduce((acc, d) => {
      acc[d.date] = { sales: 0, txn: 0 };
      return acc;
    }, {});
  }
  let totalWeight = 0;
  const perDayWeight = {};
  days.forEach((d) => {
    const w = Number(dowWeights[d.dow] ?? 1) || 1;
    perDayWeight[d.date] = w;
    totalWeight += w;
  });
  if (totalWeight <= 0) totalWeight = days.length;
  const result = {};
  days.forEach((d) => {
    const w = perDayWeight[d.date];
    const frac = w / totalWeight;
    const s = monthlySales ? monthlySales * frac : 0;
    const t = monthlyTxn ? monthlyTxn * frac : 0;
    result[d.date] = {
      sales: Math.round(s * 100) / 100,
      txn: Math.round(t),
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
    $("#dow-status").textContent = "No monthly goals saved yet (Admin > Monthly Goals).";
    return;
  }
  const monthlySales = Number(mg.sales_goal || 0);
  const monthlyTxn = Number(mg.txn_goal || 0);
  if (!monthlySales && !monthlyTxn) {
    $("#dow-status").textContent = "Monthly goals are zero or empty. Set goals in Admin first.";
    return;
  }
  const dowWeights = {};
  for (let i = 0; i < 7; i++) {
    const inp = document.getElementById(`dow-weight-${i}`);
    dowWeights[i] = inp ? Number(inp.value || 1) || 1 : 1;
  }
  const suggestions = computeSuggestions(month, monthlySales, monthlyTxn, dowWeights);
  const { days } = getMonthMeta(month);
  // Use the same store_id type as monthly_goals (uuid or numeric)
  // The mg.store_id value matches the primary key type expected in forecast_daily.
  const storeKey = mg.store_id || storeId;
  const payload = days.map((d) => {
    const sugg = suggestions[d.date] || { sales: 0, txn: 0 };
    return {
      store_id: storeKey,
      date: d.date,
      sales_goal: sugg.sales,
      txn_goal: sugg.txn,
    };
  });
  $("#dow-status").textContent = "Saving daily goals?";
  // append week_of_month and weekday_index to each record
  payload = payload.map(item => ({
    ...item,
    week_of_month: getWeekOfMonth(item.date),
    weekday_index: getWeekdayIndex(item.date),
  }));
  const { error } = await supabase.from("forecast_daily").upsert(payload, { onConflict: 'store_id,date' });
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
  $("#dow-status").textContent = "Weights reset to equal. Applying to daily goals?";
  await applyDowWeightsToMonth();
}

// --------------------------------------------------------
// Home page post creation and feed
// --------------------------------------------------------
function setupPostUi() {
  // guard to avoid duplicate bindings
  if (setupPostUi.bound) return;
  setupPostUi.bound = true;
  const btnAdd = document.getElementById("btn-add-post");
  const modal = document.getElementById("postModal");
  const btnClose = document.getElementById("btnClosePost");
  const btnCancel = document.getElementById("btnPostCancel");
  const btnSave = document.getElementById("btnPostSave");
  const feed = document.querySelector("#page-home .feed");
  if (!btnAdd || !modal || !btnClose || !btnCancel || !btnSave || !feed) return;
  const hideModal = () => {
    modal.classList.add("hidden");
    // reset inputs
    document.getElementById("post-title").value = "";
    document.getElementById("post-body").value = "";
    document.getElementById("post-file").value = "";
  };
  btnAdd.addEventListener("click", () => {
    modal.classList.remove("hidden");
  });
  btnClose.addEventListener("click", hideModal);
  btnCancel.addEventListener("click", hideModal);
  btnSave.addEventListener("click", () => {
    const title = document.getElementById("post-title").value.trim();
    const body = document.getElementById("post-body").value.trim();
    const fileInput = document.getElementById("post-file");
    if (!title && !body) {
      hideModal();
      return;
    }
    // Create post card element
    const card = document.createElement("div");
    card.className = "post-card";
    if (title) {
      const h4 = document.createElement("h4");
      h4.textContent = title;
      card.appendChild(h4);
    }
    if (body) {
      const p = document.createElement("p");
      p.textContent = body;
      card.appendChild(p);
    }
    // If a file is selected, display its name
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const div = document.createElement("div");
      div.className = "attachment";
      div.textContent = `Attachment: ${file.name}`;
      card.appendChild(div);
    }
    // simple reactions bar
    const footer = document.createElement("div");
    footer.className = "post-footer";
    const likeBtn = document.createElement("button");
    likeBtn.className = "small secondary";
    likeBtn.textContent = "? 0";
    const commentBtn = document.createElement("button");
    commentBtn.className = "small secondary";
    commentBtn.textContent = "? 0";
    footer.appendChild(likeBtn);
    footer.appendChild(commentBtn);
    card.appendChild(footer);
    // Append to top of feed
    feed.insertBefore(card, feed.firstChild);
    hideModal();
  });
}
setupPostUi.bound = false;

// ---- Suggest day-of-week weights based on historical sales ----
/**
 * Suggest DOW weights by analyzing historical sales for the same month in the prior year.
 * For each day of the week, compute the average daily net sales during that month
 * and derive a relative weight by comparing each DOW average to the overall average.
 * The function returns an object mapping dow index (0=Sunday) to a weight (>=0).
 * If no historical data exists, returns null.
 */
async function suggestDowWeights(storeId, yyyyMM) {
  if (!storeId || !yyyyMM) return null;
  const [yearStr, monthStr] = yyyyMM.split("-");
  const prevYear = Number(yearStr) - 1;
  if (prevYear < 2000) return null;
  const start = `${prevYear}-${monthStr}-01`;
  // compute days in previous year's month
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
  // initialize sums and counts per DOW
  const totals = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  data.forEach((row) => {
    const dateStr = row.date;
    const sale = Number(row.net_sales || 0);
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    totals[dow] += sale;
    counts[dow]++;
  });
  // calculate average per dow and overall average
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
      weights[i] = 1; // fallback to 1 if no data
    }
  }
  return weights;
}

/**
 * Resolve a store's UUID based on its numeric store_id code. If the stores table
 * defines a UUID primary key (`id`) alongside a numeric `store_id`, this will
 * return the UUID. Otherwise it returns the original storeId. If the query
 * fails or the id is not found, the fallback is the provided storeId.
 * @param {string|number} storeId
 * @returns {Promise<string|number>}
 */
async function getStoreUuid(storeId) {
  if (!storeId) return storeId;
  try {
    const { data, error } = await supabase
      .from("stores")
      .select("id")
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) {
      console.warn("Error fetching store uuid", error);
      return storeId;
    }
    return data?.id || storeId;
  } catch (err) {
    console.warn("Unexpected error resolving store uuid", err);
    return storeId;
  }
}

// ------ ADMIN ------
async function bootAdmin() {
  // bind buttons only once to avoid duplicates
  if (!bootAdmin.bound) {
    $("#btn-refresh-users")?.addEventListener("click", refreshUsersTable);
    $("#admin-user-search")?.addEventListener("input", refreshUsersTable);
    $("#sa-userSelect")?.addEventListener("change", refreshAccessTable);
    $("#btn-add-access")?.addEventListener("click", grantAccess);
    $("#ta-userSelect")?.addEventListener("change", refreshTabAccessTable);
    $("#btn-load-goals")?.addEventListener("click", loadGoals);
    $("#btn-save-goals")?.addEventListener("click", saveGoals);
    $("#btn-suggest-goals")?.addEventListener("click", async () => {
      const storeId = $("#mg-storeSelect")?.value;
      const month = $("#mg-monthInput")?.value;
      if (!storeId || !month) {
        $("#mg-status").textContent = "Select a store and month first.";
        return;
      }
      $("#mg-status").textContent = "Calculating goal suggestions?";
      const suggestions = await calculateGoalSuggestions(storeId, month);
      if (!suggestions) {
        $("#mg-status").textContent = "No historical data available for suggestions.";
        return;
      }
      renderGoalSuggestions(suggestions);
      $("#mg-status").textContent = "Suggestions loaded. Click a card to apply.";
    });
    bootAdmin.bound = true;
  }
  await Promise.all([
    refreshUsersTable(),
    refreshUsersForSelect(),
    refreshAccessTable(),
    refreshTabAccessTable(),
  ]);

  // automatically load monthly goals when store or month changes
  $("#mg-storeSelect")?.addEventListener("change", () => {
    loadGoals();
  });
  $("#mg-monthInput")?.addEventListener("change", () => {
    loadGoals();
  });
}
bootAdmin.bound = false;

async function refreshUsersForSelect() {
  if (!profile?.is_admin) return;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_admin")
    .order("email");
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  const saSel = $("#sa-userSelect");
  const taSel = $("#ta-userSelect");
  if (saSel) saSel.innerHTML = "";
  if (taSel) taSel.innerHTML = "";
  for (const u of data) {
    const label = u.email + (u.is_admin ? " (admin)" : "");
    if (saSel) {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = label;
      saSel.appendChild(opt);
    }
    if (taSel) {
      const opt2 = document.createElement("option");
      opt2.value = u.id;
      opt2.textContent = label;
      taSel.appendChild(opt2);
    }
  }
  await refreshAccessTable();
  await refreshTabAccessTable();
}

async function refreshUsersTable() {
  if (!profile?.is_admin) return;
  const q = ($("#admin-user-search").value || "").toLowerCase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_admin")
    .order("email");
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  const rows = data.filter(
    (u) => !q || (u.email || "").toLowerCase().includes(q)
  );
  const tb = $("#tbl-users tbody");
  tb.innerHTML = "";
  for (const u of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.email}</td>
      <td>${u.is_admin ? "Yes" : "No"}</td>
      <td class="muted">${u.id}</td>
      <td>
        <button class="secondary" data-act="toggle" data-id="${u.id}" data-admin="${
      u.is_admin ? "1" : "0"
    }">
          ${u.is_admin ? "Revoke Admin" : "Make Admin"}
        </button>
      </td>
    `;
    tb.appendChild(tr);
  }
  tb.querySelectorAll('button[data-act="toggle"]').forEach((btn) => {
    btn.addEventListener("click", () =>
      toggleAdmin(btn.dataset.id, btn.dataset.admin === "1")
    );
  });
}

async function toggleAdmin(userId, currentlyAdmin) {
  const { error } = await supabase
    .from("profiles")
    .update({ is_admin: !currentlyAdmin })
    .eq("id", userId);
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  await Promise.all([refreshUsersTable(), refreshUsersForSelect()]);
  if (userId === profile.id) {
    await loadProfile();
    $("#nav-admin")?.classList.toggle("hidden", !profile.is_admin);
  }
}

// ---- Store access table ----
async function refreshAccessTable() {
  if (!profile?.is_admin) return;
  const userId = $("#sa-userSelect")?.value;
  if (!userId) return;
  const { data, error } = await supabase
    .from("store_access")
    .select("store_id")
    .eq("user_id", userId)
    .order("store_id");
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  const tb = $("#tbl-access tbody");
  tb.innerHTML = "";
  for (const row of data || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.store_id}</td>
      <td><button class="secondary" data-remove="${row.store_id}">Remove</button></td>
    `;
    tr
      .querySelector("button[data-remove]")
      ?.addEventListener("click", () => removeAccess(userId, row.store_id));
    tb.appendChild(tr);
  }
}
async function grantAccess() {
  const userId = $("#sa-userSelect")?.value;
  const storeId = $("#sa-storeSelect")?.value;
  if (!userId || !storeId) return;
  const { error } = await supabase
    .from("store_access")
    .upsert({ user_id: userId, store_id: storeId }, { onConflict: "user_id,store_id" });
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  await refreshAccessTable();
}
async function removeAccess(userId, storeId) {
  const { error } = await supabase
    .from("store_access")
    .delete()
    .eq("user_id", userId)
    .eq("store_id", storeId);
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  await refreshAccessTable();
}

// ---- Tab Access table (Admin) ----
async function refreshTabAccessTable() {
  if (!profile?.is_admin) return;
  const userId = $("#ta-userSelect")?.value;
  if (!userId) return;
  const { data, error } = await supabase
    .from("tab_access")
    .select("tab_key")
    .eq("user_id", userId);
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  const current = new Set((data || []).map((r) => r.tab_key));
  const tb = $("#tbl-tab-access tbody");
  tb.innerHTML = "";
  for (const key of RESTRICTED_TABS) {
    const hasAccess = current.has(key);
    const labelMap = {
      pl: "P&L",
      deptwalk: "Dept Walk",
      "deptwalk-results": "Dept Walk Results & Details",
      pop: "POP Library & Tools",
      b2b: "B2B",
      eir: "Employee Incident Reports",
    };
    const label = labelMap[key] || key;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}</td>
      <td>${hasAccess ? "Yes" : "No"}</td>
      <td><button class="secondary" data-tab="${key}" data-has="${
      hasAccess ? "1" : "0"
    }">${hasAccess ? "Revoke" : "Grant"}</button></td>
    `;
    tr
      .querySelector("button[data-tab]")
      ?.addEventListener("click", () => setTabAccess(userId, key, !hasAccess));
    tb.appendChild(tr);
  }
  const salesRow = document.createElement("tr");
  salesRow.innerHTML = `
    <td>Sales Goals &amp; Current Results</td>
    <td>Always</td>
    <td><span class="muted">Always enabled for all users</span></td>
  `;
  tb.appendChild(salesRow);
}
async function setTabAccess(userId, tabKey, shouldHave) {
  if (shouldHave) {
    const { error } = await supabase
      .from("tab_access")
      .upsert({ user_id: userId, tab_key: tabKey }, { onConflict: "user_id,tab_key" });
    if (error) {
      $("#status").textContent = error.message;
      return;
    }
  } else {
    const { error } = await supabase
      .from("tab_access")
      .delete()
      .eq("user_id", userId)
      .eq("tab_key", tabKey);
    if (error) {
      $("#status").textContent = error.message;
      return;
    }
  }
  await refreshTabAccessTable();
  if (userId === profile.id) {
    await loadTabPermissions();
  }
}

// ---- Monthly Goals ----
async function loadGoals() {
  const storeId = $("#mg-storeSelect")?.value;
  const month = $("#mg-monthInput")?.value;
  if (!storeId || !month) return;
  const { data, error } = await supabase
    .from("monthly_goals")
    .select("store_id,month,sales_goal,txn_goal,atv_goal")
    .eq("store_id", storeId)
    .eq("month", month)
    .maybeSingle();
  if (error) {
    $("#mg-status").textContent = error.message;
    return;
  }
  $("#mg-sales").value = data?.sales_goal ?? "";
  $("#mg-txn").value = data?.txn_goal ?? "";
  $("#mg-atv").value = data?.atv_goal ?? "";
  $("#mg-status").textContent = data ? `Goals loaded for store ${storeId}.` : "No goals saved yet.";
}
async function saveGoals() {
  const storeId = $("#mg-storeSelect")?.value;
  const month = $("#mg-monthInput")?.value;
  const sales = $("#mg-sales")?.value ? Number($("#mg-sales").value) : null;
  const txn = $("#mg-txn")?.value ? Number($("#mg-txn").value) : null;
  const atv = $("#mg-atv")?.value ? Number($("#mg-atv").value) : null;
  if (!storeId || !month) {
    $("#mg-status").textContent = "Select a store and month first.";
    return;
  }
  $("#mg-status").textContent = "Saving monthly goals?";
  const { error } = await supabase
    .from("monthly_goals")
    .upsert(
      { store_id: storeId, month, sales_goal: sales, txn_goal: txn, atv_goal: atv },
      { onConflict: "store_id,month" }
    );
  if (error) {
    console.error("Error saving monthly goals", error);
    $("#mg-status").textContent = `Error: ${error.message}`;
    return;
  }
  $("#mg-status").textContent = `Goals saved for store ${storeId} successfully.`;
}

// ---- Goal Suggestions ----
async function fetchHistoricalMonth(storeId, yyyyMM) {
  // Fetch total net sales, transaction count and atv for the same month last year.
  const [yearStr, monthStr] = yyyyMM.split("-");
  const prevYear = Number(yearStr) - 1;
  if (prevYear < 2000) return null;
  const start = `${prevYear}-${monthStr}-01`;
  const daysInMonth = new Date(prevYear, Number(monthStr), 0).getDate();
  const end = `${prevYear}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("historical_sales")
    .select("net_sales, txn_count, atv")
    .eq("store_id", storeId)
    .gte("date", start)
    .lte("date", end);
  if (error) {
    console.warn("Error fetching historical sales", error);
    return null;
  }
  if (!data || data.length === 0) {
    return null;
  }
  let totalSales = 0;
  let totalTxn = 0;
  data.forEach((row) => {
    totalSales += Number(row.net_sales || 0);
    totalTxn += Number(row.txn_count || 0);
  });
  const avgAtv = totalTxn > 0 ? totalSales / totalTxn : null;
  return { totalSales, totalTxn, avgAtv };
}

async function calculateGoalSuggestions(storeId, yyyyMM) {
  const hist = await fetchHistoricalMonth(storeId, yyyyMM);
  if (!hist) {
    return null;
  }
  const baseSales = hist.totalSales;
  const baseTxn = hist.totalTxn;
  const baseAtv = hist.avgAtv || 0;
  // Apply multipliers for conservative, standard, aggressive scenarios
  const multipliers = {
    conservative: 0.95,
    standard: 1.0,
    aggressive: 1.05,
  };
  const suggestions = {};
  Object.entries(multipliers).forEach(([key, mult]) => {
    suggestions[key] = {
      sales: Math.round(baseSales * mult * 100) / 100,
      txn: Math.round(baseTxn * mult),
      atv: baseTxn > 0 ? Math.round((baseSales * mult) / (baseTxn * mult) * 100) / 100 : baseAtv,
    };
  });
  return suggestions;
}

function renderGoalSuggestions(suggestions) {
  const container = $("#goal-suggestions");
  if (!container) return;
  container.innerHTML = "";
  container.classList.remove("hidden");
  const labels = {
    conservative: "Conservative",
    standard: "Standard",
    aggressive: "Aggressive",
  };
  Object.entries(suggestions).forEach(([key, values]) => {
    const card = document.createElement("div");
    card.className = "suggestion-card";
    card.setAttribute("data-type", key);
    card.innerHTML = `
      <h4>${labels[key]}</h4>
      <div>Sales: <span class="value">${fmtMoney(values.sales)}</span></div>
      <div>Txn: <span class="value">${fmtInt(values.txn)}</span></div>
      <div>ATV: <span class="value">${fmtMoney(values.atv)}</span></div>
    `;
    card.addEventListener("click", () => {
      // highlight selected
      $$(".suggestion-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      // update input fields
      $("#mg-sales").value = values.sales.toFixed(2);
      $("#mg-txn").value = values.txn;
      $("#mg-atv").value = values.atv.toFixed(2);
      $("#mg-status").textContent = `${labels[key]} goal applied. Click Save Goals to persist.`;
    });
    container.appendChild(card);
  });
}

// ---- modal KPI placeholders ----
function buildKpiCards(row) {
  $("#modalKpis").innerHTML = `
    <div class="microstatus muted">KPI editor (unchanged from your current version).</div>
  `;
}
function collectModalValues() {
  return { store_id: currentStoreId, date: modalDate };
}

// --------------------------------------------------------
// Forgot password flow
// --------------------------------------------------------
(function setupPasswordReset() {
  const emailInput = $("#email");
  const btnForgot = $("#btn-forgot");
  const authMessageEl = $("#auth-message");
  const passwordResetSection = $("#password-reset");
  const newPasswordInput = $("#newPassword");
  const confirmPasswordInput = $("#confirmPassword");
  const btnSetPassword = $("#btn-set-password");
  const resetMessageEl = $("#reset-message");
  const loggedOutSection = $("#logged-out");
  const topNav = $("#topNav");
  const pages = $$(".page");
  if (!emailInput || !btnForgot) {
    return;
  }
  function showStatusMessage(el, message, type = "info") {
    if (!el) return;
    el.textContent = message || "";
    if (type === "error") {
      el.style.color = "#c00";
    } else if (type === "success") {
      el.style.color = "#080";
    } else {
      el.style.color = "#555";
    }
  }
  function showLoginView() {
    if (loggedOutSection) loggedOutSection.classList.remove("hidden");
    if (topNav) topNav.classList.add("hidden");
    pages.forEach((p) => p.classList.add("hidden"));
    if (passwordResetSection) passwordResetSection.classList.add("hidden");
  }
  function showResetView() {
    if (loggedOutSection) loggedOutSection.classList.add("hidden");
    if (topNav) topNav.classList.add("hidden");
    pages.forEach((p) => p.classList.add("hidden"));
    if (passwordResetSection) passwordResetSection.classList.remove("hidden");
  }
  btnForgot.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      showStatusMessage(authMessageEl, "Please enter your email address first.", "error");
      return;
    }
    showStatusMessage(authMessageEl, "Sending password reset email?");
    const redirectTo = `${window.location.origin}/#/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      showStatusMessage(authMessageEl, `Error: ${error.message}`, "error");
    } else {
      showStatusMessage(authMessageEl, "Password reset email sent. Please check your inbox.", "success");
    }
  });
  if (window.location.hash && window.location.hash.includes("type=recovery")) {
    showResetView();
    showStatusMessage(resetMessageEl, "Please enter a new password for your account.");
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      showResetView();
      showStatusMessage(resetMessageEl, "Token verified. Please enter a new password for your account.");
    }
  });
  if (btnSetPassword) {
    btnSetPassword.addEventListener("click", async () => {
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;
      if (!newPassword || !confirmPassword) {
        showStatusMessage(resetMessageEl, "Please enter and confirm your new password.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        showStatusMessage(resetMessageEl, "Passwords do not match.", "error");
        return;
      }
      showStatusMessage(resetMessageEl, "Updating password?");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        showStatusMessage(resetMessageEl, `Error: ${error.message}`, "error");
        return;
      }
      showStatusMessage(resetMessageEl, "Password updated. You can now sign in with your new password.", "success");
      setTimeout(() => {
        showLoginView();
      }, 2000);
    });
  }
})();

// ---- start the app ----
initAuth();
// wire DOW buttons
$("#btn-apply-dow")?.addEventListener("click", applyDowWeightsToMonth);
$("#btn-reset-dow")?.addEventListener("click", resetDowToEqualAndApply);

// wire suggestion for DOW weights
$("#btn-suggest-dow")?.addEventListener("click", async () => {
  const storeId = $("#storeSelect")?.value;
  const monthVal = $("#monthInput")?.value;
  if (!storeId || !monthVal) {
    $("#dow-status").textContent = "Select a store and month first.";
    return;
  }
  $("#dow-status").textContent = "Calculating day-of-week weight suggestions?";
  const weights = await suggestDowWeights(storeId, monthVal);
  if (!weights) {
    $("#dow-status").textContent = "No historical data available for weight suggestions.";
    return;
  }
  // Apply weights to inputs
  for (let i = 0; i < 7; i++) {
    const inp = document.getElementById(`dow-weight-${i}`);
    if (inp) {
      inp.value = weights[i].toFixed(2);
    }
  }
  $("#dow-status").textContent =
    "Suggested weights loaded from historical data. Review and click Apply to daily goals.";
});

config.js
// PUBLIC config (safe to commit; anon key is meant to be public)
window.APP_CONFIG = {
  SUPABASE_URL: "https://bvyrxqfffaxthrjfxjue.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2eXJ4cWZmZmF4dGhyamZ4anVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDkwMjEsImV4cCI6MjA3NzY4NTAyMX0.BK3LvTsDdLgFn5qNFHQoa4MTkGIe5sNvmVaA8uujvnM"
};

index.html
<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Skye Bridge Sales Forecasting</title>
  <!-- Supabase (UMD) -->
  <script src="https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
  <!-- Inline config for Supabase credentials -->
  <script>
    window.APP_CONFIG = {
      SUPABASE_URL: "https://bvyrxqfffaxthrjfxjue.supabase.co",
      SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2eXJ4cWZmZmF4dGhyamZ4anVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDkwMjEsImV4cCI6MjA3NzY4NTAyMX0.BK3LvTsDdLgFn5qNFHQoa4MTkGIe5sNvmVaA8uujvnM"
    };
  </script>
  <link rel="stylesheet" href="./styles.css?v=2025-12-08-01" />
  <script defer src="./app.js?v=2025-12-08-01"></script>
</head>

<body>
  <header class="appbar">
    <h1>Sales Forecasting</h1>
    <div class="authbox">
      <span id="whoami"></span>
      <button id="btn-signout" class="secondary hidden">Sign out</button>
    </div>
  </header>
  <!-- Nav -->
  <nav id="topNav" class="nav hidden">
    <button data-route="home">Home</button>
    <button data-route="sales">Sales Goals &amp; Current Results</button>
    <button data-route="pl">P&amp;L</button>
    <button data-route="deptwalk">Dept Walk</button>
    <button data-route="deptwalk-results">Dept Walk Results &amp; Details</button>
    <button data-route="b2b">B2B</button>
    <button data-route="eir">EIR - Incident Reports</button>
    <button data-route="pop">Library &amp; POP Tools</button>
    <button id="nav-admin" data-route="admin" class="admin-only hidden">Admin</button>
  </nav>
  <!-- Status bar -->
  <div id="status" class="status">Loading?</div>
  <!-- Logged-out view -->
  <section id="logged-out" class="container">
    <div id="auth-area">
      <input id="email" type="email" placeholder="Email" />
      <input id="password" type="password" placeholder="Password" />
      <div class="auth-actions">
        <button id="btn-signin">Sign in</button>
        <button id="btn-forgot" type="button" class="link-button">
          Forgot password?
        </button>
      </div>
      <div id="auth-message" class="auth-message"></div>
    </div>
  </section>
  <!-- Pages -->
  <main>
    <!-- Home / Communications Hub -->
    <section id="page-home" class="page hidden">
      <div class="container">
        <h2>Communications Hub</h2>
        <p class="muted">Pinned announcements, role-based posts, comments and reactions.</p>
        <!-- Add post button for creating new announcements -->
        <div class="row" style="justify-content:flex-end;margin-bottom:12px;">
          <button id="btn-add-post" class="primary">Add Post</button>
        </div>
        <div class="feed">
          <!-- Example pinned post -->
          <div class="post-card pinned">
            <div class="post-header">
              <span class="badge">Pinned</span>
              <h4>Holiday Hours Reminder</h4>
            </div>
            <p>All stores will close early at 5PM on December 24th. Please notify your teams.</p>
            <div class="post-footer">
              <button class="small secondary">? 12</button>
              <button class="small secondary">? 3</button>
            </div>
          </div>
          <!-- Sample posts -->
          <div class="post-card">
            <h4>Weekly Tips: Driving ATV</h4>
            <p>Remember to mention add-on items at checkout. Focus on complimentary products to increase ATV.</p>
            <div class="post-footer">
              <button class="small secondary">? 5</button>
              <button class="small secondary">? 1</button>
            </div>
          </div>
          <div class="post-card">
            <h4>Safety Spotlight</h4>
            <p>Please review the updated safety procedures for ladder use. The document is in the Library.</p>
            <div class="post-footer">
              <button class="small secondary">? 8</button>
              <button class="small secondary">? 2</button>
            </div>
          </div>
        </div>
      </div>
    </section>
    <!-- Sales page -->
    <section id="page-sales" class="page hidden">
      <div id="app" class="container">
        <div class="controls">
          <label>Store
            <select id="storeSelect"></select>
          </label>
          <label>Month
            <input id="monthInput" type="month" />
          </label>
          <!-- No explicit load button; data loads automatically when selections change -->
        </div>
        <div class="month-layout">
          <!-- Day-of-week weights aligned over calendar -->
          <div id="dow-toolbar" class="dow-toolbar hidden">
            <div class="dow-weights" id="dow-weights-row"></div>
            <div class="dow-actions">
              <button id="btn-apply-dow" class="secondary">Apply to daily goals</button>
              <button id="btn-reset-dow" class="secondary">Reset to equal &amp; apply</button>
              <!-- Suggest dow weights from historical data (admin only) -->
              <button id="btn-suggest-dow" class="secondary hidden">Suggest weights</button>
              <span id="dow-status" class="microstatus"></span>
            </div>
          </div>
          <div id="summary" class="summary">-</div>
          <div id="calendar" class="calendar"></div>
        </div>
      </div>
    </section>
    <!-- P&L analysis -->
    <section id="page-pl" class="page hidden">
      <div class="container">
        <h2>P&amp;L Analysis</h2>
        <p class="muted">Compare simplified vs. true P&amp;L, controllables, and goals.</p>
        <div class="pl-grid">
          <div class="card">
            <h3>Simplified P&amp;L</h3>
            <p class="muted">High-level view of controllable expenses and margin.</p>
            <table class="table">
              <thead>
                <tr><th>Category</th><th>Actual</th><th>Goal</th><th>Variance</th></tr>
              </thead>
              <tbody>
                <tr><td>Sales</td><td>$0</td><td>$0</td><td>-</td></tr>
                <tr><td>Labor</td><td>$0</td><td>$0</td><td>-</td></tr>
                <tr><td>Shrink</td><td>$0</td><td>$0</td><td>-</td></tr>
                <tr><td>Margin</td><td>$0</td><td>$0</td><td>-</td></tr>
              </tbody>
            </table>
          </div>
          <div class="card">
            <h3>New Month Goals</h3>
            <p class="muted">Set targets for the upcoming month based on forecasts.</p>
            <div class="row">
              <label>Sales Goal ($)
                <input type="number" step="0.01" placeholder="0.00" />
              </label>
              <label>Labor % Goal
                <input type="number" step="0.1" placeholder="0.0" />
              </label>
            </div>
            <div class="row">
              <label>Shrink % Goal
                <input type="number" step="0.1" placeholder="0.0" />
              </label>
              <label>Margin % Goal
                <input type="number" step="0.1" placeholder="0.0" />
              </label>
            </div>
            <button class="secondary">Save P&amp;L Goals</button>
          </div>
          <div class="card">
            <h3>True P&amp;L (Last Month)</h3>
            <p class="muted">Actual results from the completed accounting period.</p>
            <table class="table">
              <thead>
                <tr><th>Category</th><th>Amount</th></tr>
              </thead>
              <tbody>
                <tr><td>Net Sales</td><td>$0</td></tr>
                <tr><td>Cost of Goods</td><td>$0</td></tr>
                <tr><td>Operating Expenses</td><td>$0</td></tr>
                <tr><td>Net Profit</td><td>$0</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
    <!-- Dept Walks -->
    <section id="page-deptwalk" class="page hidden">
      <div class="container">
        <h2>Dept Walk</h2>
        <p class="muted">Capture aisle issues, photos and scores on the go.</p>
        <div class="card">
          <h3>New Observation</h3>
          <div class="row">
            <label>Category
              <select>
                <option value="">Select?</option>
                <option>Safety</option>
                <option>Inventory</option>
                <option>Presentation</option>
                <option>Staffing</option>
              </select>
            </label>
            <label>Photo
              <input type="file" accept="image/*" />
            </label>
          </div>
          <label>Description
            <textarea rows="3" placeholder="Describe the issue?"></textarea>
          </label>
          <button class="secondary">Submit Observation</button>
        </div>
        <div class="card">
          <h3>Recent Observations</h3>
          <table class="table">
            <thead><tr><th>Category</th><th>Issue</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Safety</td><td>Spill in aisle 3</td><td>Open</td></tr>
              <tr><td>Inventory</td><td>Low stock on nails</td><td>In Progress</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <!-- Dept Walk Results & Task Management -->
    <section id="page-deptwalk-results" class="page hidden">
      <div class="container">
        <h2>Dept Walk Results &amp; Task Management</h2>
        <p class="muted">Review photos, notes and track tasks to completion.</p>
        <div class="results-grid">
          <div class="card">
            <h3>Image Gallery</h3>
            <div class="gallery">
              <div class="thumbnail"></div>
              <div class="thumbnail"></div>
              <div class="thumbnail"></div>
            </div>
          </div>
          <div class="card">
            <h3>Notes Archive</h3>
            <ul class="notes-list">
              <li><strong>Spill in aisle 3:</strong> Cleaned up on 12/1</li>
              <li><strong>Low stock on nails:</strong> Restocked 12/2</li>
            </ul>
          </div>
          <div class="card">
            <h3>Tasks</h3>
            <table class="table">
              <thead><tr><th>Task</th><th>Assignee</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>Clean spill in aisle 3</td><td>Alex</td><td><span class="badge">Done</span></td></tr>
                <tr><td>Order nails</td><td>Jamie</td><td><span class="badge">In Progress</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
    <!-- B2B CRM -->
    <section id="page-b2b" class="page hidden">
      <div class="container">
        <h2>B2B CRM</h2>
        <p class="muted">Manage customer pipeline, visit notes and follow-ups.</p>
        <div class="card">
          <h3>Customer List</h3>
          <table class="table">
            <thead><tr><th>Customer</th><th>Stage</th><th>Last Contact</th><th>Next Action</th></tr></thead>
            <tbody>
              <tr><td>Acme Construction</td><td>Quote Sent</td><td>11/30</td><td>Follow up</td></tr>
              <tr><td>Home Builders Inc.</td><td>Initial</td><td>12/1</td><td>Schedule visit</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>Add New Customer</h3>
          <div class="row">
            <label>Name
              <input type="text" placeholder="Customer name" />
            </label>
            <label>Stage
              <select>
                <option value="">Select?</option>
                <option>Initial</option>
                <option>Quote Sent</option>
                <option>Negotiation</option>
                <option>Closed Won</option>
                <option>Closed Lost</option>
              </select>
            </label>
          </div>
          <label>Notes
            <textarea rows="3"></textarea>
          </label>
          <button class="secondary">Add Customer</button>
        </div>
      </div>
    </section>
    <!-- EIR - Incident Reporting -->
    <section id="page-eir" class="page hidden">
      <div class="container">
        <h2>Employee Incident Reports</h2>
        <p class="muted">Submit and track incidents through resolution.</p>
        <div class="card">
          <h3>New Incident</h3>
          <div class="row">
            <label>Type
              <select>
                <option value="">Select?</option>
                <option>Injury</option>
                <option>Harassment</option>
                <option>Customer Complaint</option>
                <option>Equipment Damage</option>
              </select>
            </label>
            <label>Attachment
              <input type="file" />
            </label>
          </div>
          <label>Description
            <textarea rows="3"></textarea>
          </label>
          <button class="secondary">Submit Incident</button>
        </div>
        <div class="card">
          <h3>Reported Incidents</h3>
          <table class="table">
            <thead><tr><th>Type</th><th>Description</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Injury</td><td>Cut finger on blade</td><td>Open</td></tr>
              <tr><td>Customer Complaint</td><td>Rude service at register</td><td>In Review</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Library & POP Tools -->
    <section id="page-pop" class="page hidden">
      <div class="container">
        <h2>Library &amp; POP Tools</h2>
        <p class="muted">Browse documents by category and generate POP signs.</p>
        <div class="card">
          <h3>Document Library</h3>
          <table class="table">
            <thead><tr><th>Name</th><th>Category</th><th>Uploaded</th><th>Actions</th></tr></thead>
            <tbody>
              <tr><td>Holiday Planogram.pdf</td><td>Planogram</td><td>11/28</td><td><button class="small secondary">Download</button></td></tr>
              <tr><td>Safety Training.docx</td><td>Safety</td><td>10/15</td><td><button class="small secondary">Download</button></td></tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>Create POP Sign</h3>
          <div class="row">
            <label>Product Name
              <input type="text" placeholder="e.g. Hammer" />
            </label>
            <label>Price ($)
              <input type="number" step="0.01" placeholder="0.00" />
            </label>
          </div>
          <label>Upload Image
            <input type="file" accept="image/*" />
          </label>
          <button class="secondary">Generate Sign</button>
        </div>
      </div>
    </section>
    <!-- Admin -->
    <section id="page-admin" class="page hidden">
      <div class="container">
        <h2>Admin</h2>
        <div class="admin-grid">
          <!-- Users/Admin toggle -->
          <div class="card">
            <h3>Users</h3>
            <div class="row">
              <input id="admin-user-search" placeholder="Search email?" />
              <button id="btn-refresh-users" class="secondary">Refresh</button>
            </div>
            <table id="tbl-users" class="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Admin?</th>
                  <th>User Id</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <!-- Store access mapping -->
          <div class="card">
            <h3>Store Access</h3>
            <div class="row">
              <label>User
                <select id="sa-userSelect"></select>
              </label>
              <label>Store
                <select id="sa-storeSelect"></select>
              </label>
              <button id="btn-add-access">Grant access</button>
            </div>
            <table id="tbl-access" class="table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>

          <!-- Tab access management -->
          <div class="card">
            <h3>Tab Access</h3>
            <div class="row">
              <label>User
                <select id="ta-userSelect"></select>
              </label>
            </div>
            <table id="tbl-tab-access" class="table">
              <thead>
                <tr>
                  <th>Tab</th>
                  <th>Has access?</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <!-- Sales goal insights and monthly goals -->
          <div class="card">
            <h3>Sales Goal Insights & Monthly Goals</h3>
            <div class="row">
              <label>Store
                <select id="mg-storeSelect"></select>
              </label>
              <label>Month
                <input id="mg-monthInput" type="month" />
              </label>
              <button id="btn-load-goals" class="secondary">Load</button>
            </div>
            <div class="row">
              <label>Sales Goal ($)
                <input id="mg-sales" type="number" step="0.01" />
              </label>
              <label>Txn Goal
                <input id="mg-txn" type="number" step="1" />
              </label>
              <label>ATV Goal ($)
                <input id="mg-atv" type="number" step="0.01" />
              </label>
              <button id="btn-suggest-goals" class="secondary">Suggest Goals</button>
              <button id="btn-save-goals">Save Goals</button>
            </div>
            <!-- Container for goal suggestions -->
            <div id="goal-suggestions" class="goal-suggestions hidden"></div>
            <div id="mg-status" class="microstatus">-</div>
          </div>
        </div>
      </div>
    </section>
  </main>
  <!-- Password reset view -->
  <section id="password-reset" class="container hidden">
    <h2>Set a new password</h2>
    <p>Enter a new password for your account.</p>
    <input id="newPassword" type="password" placeholder="New password" />
    <input id="confirmPassword" type="password" placeholder="Confirm new password" />
    <button id="btn-set-password">Update password</button>
    <div id="reset-message" class="auth-message"></div>
  </section>
  <!-- Day modal -->
  <div id="dayModal" class="modal hidden" aria-hidden="true">
    <div class="sheet">
      <header>
        <h2 id="modalTitle" style="margin:0"></h2>
        <span id="modalBadge" class="badge">-</span>
        <button id="btn-clear-all" class="secondary small">Clear all</button>
      </header>
      <div id="modalKpis"></div>
      <div class="actions">
        <button id="btnCloseModal" class="close">Close</button>
        <button id="btnSaveModal" class="save">Save</button>
      </div>
    </div>
  </div>

  <!-- New Post modal -->
  <div id="postModal" class="modal hidden" aria-hidden="true">
    <div class="sheet">
      <header style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0">Create Post</h2>
        <button id="btnClosePost" class="close">Close</button>
      </header>
      <div class="post-form" style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
        <label>Title
          <input id="post-title" type="text" placeholder="Enter a title" />
        </label>
        <label>Message
          <textarea id="post-body" rows="4" placeholder="Write your update or announcement?"></textarea>
        </label>
        <label>Attachment
          <input id="post-file" type="file" />
        </label>
      </div>
      <div class="actions" style="display:flex;justify-content:flex-end;margin-top:12px;gap:8px;">
        <button id="btnPostCancel" class="secondary">Cancel</button>
        <button id="btnPostSave" class="save">Post</button>
      </div>
    </div>
  </div>
</body>

</html>

style.css
:root{
  --ace-red:#E31837;
  --ok:#119f4a;
  --bad:#cc2b2b;
  --muted:#777;
  --chip:#eef2f7;
  --bg:#fafbfc;
  --border:#e3e6ea;
}

*{box-sizing:border-box}
body{margin:0;background:var(--bg);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111}

.appbar{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border)}
.appbar h1{margin:0;font-size:20px}
.authbox{display:flex;gap:8px;align-items:center}
.authbox #whoami{color:#444}

/* Navigation bar styled for a more corporate look */
.nav{display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--border);background:#fff;position:sticky;top:0;z-index:2;box-shadow:0 1px 2px rgba(0,0,0,0.05);}
.nav button{padding:8px 12px;border:1px solid var(--border);background:#fff;border-radius:10px;cursor:pointer;font-weight:500;transition:background 0.2s,border-color 0.2s;}
.nav button:hover{background:#f5f7fa;}
.nav button.active{border-color:var(--ace-red);font-weight:600;background:#fff5f5;color:var(--ace-red);}
.hidden{display:none !important}

.status{margin:12px 16px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:#f7f8fb;color:#333}

.container{padding:16px}
.controls{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;align-items:end}
.controls label{display:flex;flex-direction:column;gap:4px}
.controls input,.controls select{padding:8px;border:1px solid var(--border);border-radius:8px}
input,textarea,select{background:#fff;border:1px solid var(--border);border-radius:8px;font-family:inherit;}

/* Cards headings spacing */
.card h3{margin-top:0;margin-bottom:8px;}
label{font-size:13px;font-weight:500;color:#333;}
button{padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:#fff;cursor:pointer}
button.primary,#btn-load,#btn-save-goals,#btn-add-access{background:var(--ace-red);border-color:var(--ace-red);color:#fff}
button.secondary{background:#fff}
button.small{padding:6px 8px}

.summary{margin:12px 0;padding:10px;border:1px solid var(--border);border-radius:10px;background:#f8f9fb}

.calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:14px}
.calendar .day{border:1px solid var(--border);border-radius:16px;padding:12px;min-height:140px;background:#fff;position:relative}
.calendar .day .details{position:absolute;top:8px;right:8px}
.day.future{background:#fff}
.day.past.goal-hit{background:#eaffef}
.day.past.goal-miss{background:#ffecec}
.day .num{font-weight:700;margin-bottom:4px}
.day .row{display:flex;align-items:center;gap:8px}
.day .sales{font-weight:800}
.day .italic{font-style:italic}
.day .pct{font-weight:800}
.ok{color:var(--ok)} .bad{color:var(--bad)} .muted{color:#999}

.modal{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px}
.modal .sheet{width:min(1100px,96vw);background:#fff;border-radius:14px;padding:16px;border:1px solid var(--border)}
.modal header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.badge{padding:6px 10px;border-radius:999px;background:var(--chip);border:1px solid var(--border);font-size:12px}
.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}
.microstatus{color:#555;margin-top:8px}

.card{border:1px solid var(--border);border-radius:12px;padding:14px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.05);}
.admin-grid{display:grid;grid-template-columns:1fr;gap:16px}
@media (min-width:1000px){.admin-grid{grid-template-columns:1fr 1fr}}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.table{width:100%;border-collapse:collapse;margin-top:8px}
.table th,.table td{border-bottom:1px solid var(--border);padding:8px}
.table td .pill{display:inline-block;padding:4px 8px;border:1px solid var(--border);border-radius:999px;background:#fff}

/* Auth area + forgot password */
#auth-area{display:flex;flex-direction:column;gap:8px;align-items:flex-start;max-width:320px;}
#auth-area input{padding:10px;border:1px solid var(--border);border-radius:10px;width:100%;}
.auth-actions{display:flex;gap:8px;align-items:center;margin-top:4px;}
.link-button{background:none;border:none;padding:0;color:var(--ace-red);cursor:pointer;font-size:13px;text-decoration:underline;}
.link-button:hover{color:#b11229;}
.auth-message{margin-top:4px;font-size:13px;color:#555;}

/* Month layout + DOW weights */
.month-layout{display:flex;flex-direction:column;gap:8px;}
.dow-toolbar{display:flex;flex-direction:column;gap:6px;}
.dow-weights{display:grid;grid-template-columns:repeat(7,1fr);gap:14px;}
.dow-cell{border-radius:14px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);display:flex;flex-direction:column;gap:4px;}
.dow-header{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;}
.dow-name{letter-spacing:0.03em;}
.dow-current{font-size:11px;color:var(--muted);}
.dow-input-row{display:flex;align-items:center;gap:4px;}
.dow-weight-input{width:70px;padding:4px 6px;border-radius:6px;border:1px solid #ddd;background:#fafafa;font-size:12px;}
.dow-weight-input:disabled{background:transparent;border-color:transparent;cursor:default;}
.dow-unit{font-size:11px;color:var(--muted);}
.dow-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}

/* Goal suggestions styling */
.goal-suggestions{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;}
.suggestion-card{border:1px solid var(--border);background:#fff;border-radius:10px;padding:8px;min-width:150px;cursor:pointer;text-align:left;}
.suggestion-card.selected{border-color:var(--ace-red);background:#fff5f8;}
.suggestion-card h4{margin:0 0 4px 0;font-size:13px;color:#333;}
.suggestion-card .value{font-weight:700;}

/* Mobile tweaks */
@media (max-width:768px){
  .calendar{gap:8px;}
  .calendar .day{min-height:120px;padding:8px;}
  .dow-weights{gap:8px;}
  .dow-cell{padding:4px 6px;}
  .dow-weight-input{width:100%;font-size:11px;}
  .dow-header{font-size:10px;}
}

/* ----- Home / Communications Hub ----- */
.feed{display:flex;flex-direction:column;gap:12px;margin-top:12px;}
.post-card{border:1px solid var(--border);background:#fff;border-radius:12px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,0.05);}
.post-card.pinned{border-color:var(--ace-red);background:#fff5f6;}
.post-card h4{margin:0 0 6px 0;font-size:16px;}
.post-header{display:flex;align-items:center;gap:6px;margin-bottom:6px;}
.post-footer{display:flex;gap:8px;margin-top:8px;}

/* Attachment label inside posts */
.attachment{margin-top:4px;font-size:12px;color:#555;}

/* ----- P&L analysis grid ----- */
.pl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:12px;}

/* ----- Dept Walk Results grid ----- */
.results-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:12px;}
.gallery{display:flex;gap:8px;flex-wrap:wrap;}
.thumbnail{width:80px;height:80px;border:1px solid var(--border);border-radius:8px;background:var(--bg);}
.notes-list{list-style-type:none;padding:0;margin:0;}
.notes-list li{margin-bottom:6px;}

Files for the current department walk tool we have running through google app script I'd like replicate this tool in the platform we are building which I expect to improve the performance of the walk tool drastically.

index.html
<!DOCTYPE html>
<html>
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
 <base target="_top">
 <style>
  html { font-size:18px; }
  body {
   margin:0; padding:0;
   font-family:Arial,sans-serif;
   font-size:1rem; line-height:1.5;
   background:url('https://drive.google.com/uc?export=view&id=1v3JhZ-6icq4NHjoFa-I3rvNgUpiLidcs') repeat;
   background-size:80px 80px;
  }
  #container {
   box-sizing:border-box;
   max-width:480px; margin:auto;
   padding:1rem; background:rgba(255,255,255,0.9);
  }
  label, select, input, textarea, button { font-size:1rem; }
  select, input, textarea {
   width:100%; padding:0.75rem; margin-bottom:1rem;
   border:1px solid #ccc; border-radius:4px;
  }
  .question { margin-bottom:1.5rem; }
  .radios label {
   display:inline-block;
   margin-right:1.5rem;
   cursor:pointer;
  }
  .assign-block {
   margin:0.5rem 0 1rem; padding:0.75rem;
   border:1px solid #ddd; background:#f9f9f9;
  }
  button {
   display:block; width:100%;
   padding:0.75rem; margin:0.75rem 0;
   border:none; border-radius:4px;
   background:#c00; color:#fff;
  }
  button.secondary { background:#555; }
  hr { margin:2rem 0; border-top:1px solid #eee; }

  #main { position:relative; padding-bottom:4rem; }
  button.finish {
   position:fixed; bottom:0; left:0; right:0;
   border-radius:0;
  }

  details summary {
   cursor:pointer; padding:0.5rem 0;
   font-weight:bold; border-bottom:1px solid #ddd;
  }
  details[open] summary { margin-bottom:1rem; }

  #spinner {
   position:fixed; top:0; left:0; right:0; bottom:0;
   background:rgba(255,255,255,0.7);
   display:flex; align-items:center; justify-content:center;
   font-size:1.2rem; z-index:1000;
  }
  .hidden { display:none!important; }
 </style>
</head>
<body>
 <div id="spinner" class="hidden">Loading?</div>
 <div id="container">
  <h2>Shift Readiness Store Walk</h2>

  <div id="step1">
   <label>Store</label>
   <select id="storeSelect" onchange="onWalkTypeChange()">
    <option>-- Select Store --</option>
   </select>

   <label>Walk Type</label>
   <select id="walkType" onchange="onWalkTypeChange()">
    <option>-- Select Walk Type --</option>
    <option>Daily Dept</option>
    <option>Weekly Dept</option>
    <option>Monthly Store Walk</option>
   </select>

   <div id="deptBlock" class="hidden">
    <label>Department</label>
    <select id="deptSelect">
     <option>-- Select Dept --</option>
    </select>
   </div>

   <button onclick="startSession()">Start Walk</button>
  </div>

  <div id="main" class="hidden">
   <h3>Checklist</h3>
   <details open>
    <summary>Checklist (tap to expand)</summary>
    <div id="checklistForm"></div>
   </details>
   <hr>

   <h3>Log Additional Issue</h3>
   <button class="secondary" onclick="showIssueForm()">Log Issue</button>
   <div id="issueForm" class="hidden">
    <label>Location code</label>
    <input id="locCode" placeholder="e.g.01L02">

    <label>Category</label>
    <select id="category">
     <option>OUTS/Restock</option>
     <option>Front/Org/Clean</option>
     <option>KUDOS!!!</option>
     <option>POG Compliance</option>
     <option>Safety concern</option>
    </select>

    <label>Comment</label>
    <textarea id="comment" rows="2"></textarea>

    <label>Take Photo</label>
    <input type="file" id="photoInput" accept="image/*" capture="environment">

    <button class="secondary" onclick="submitIssue()">Submit Issue</button>
   </div>
   <hr>

   <label>Aisles Reviewed</label>
   <input id="aislesInput" placeholder="e.g.12-19">

   <label>Send Summary To</label>
   <input id="emailsInput" placeholder="email1@?,email2@?">

   <label>General Comments</label>
   <textarea id="commentsInput" rows="2"></textarea>

   <button class="finish" onclick="endWalk()">Finish Walk&Send Summary</button>
  </div>
 </div>

 <script>
  var STORES = <?!= JSON.stringify(stores) ?>,
    DEPT_MAP = <?!= JSON.stringify(departmentsMap) ?>;

  function showSpinner(){document.getElementById('spinner').classList.remove('hidden');}
  function hideSpinner(){document.getElementById('spinner').classList.add('hidden');}

  function resizeAndUpload(file, maxW, cb) {
   var img = new Image(), reader = new FileReader();
   reader.onload = e=>{
    img.src=e.target.result;
    img.onload=()=>{
     var c=document.createElement('canvas'),
       s=maxW/img.width;
     c.width=maxW; c.height=img.height*s;
     c.getContext('2d').drawImage(img,0,0,c.width,c.height);
     cb(c.toDataURL('image/jpeg',0.7));
    };
   };
   reader.readAsDataURL(file);
  }

  document.addEventListener('DOMContentLoaded',()=>{
   var sel=document.getElementById('storeSelect');
   sel.innerHTML = '<option>-- Select Store --</option>'
    + STORES.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  });

  function onWalkTypeChange(){
   var wt=document.getElementById('walkType').value,
     st=document.getElementById('storeSelect').value,
     db=document.getElementById('deptBlock');
   APP_STATE.walkType=wt; APP_STATE.storeId=st;
   if(/Dept/.test(wt)&&st){
    var arr=DEPT_MAP[st]||[];
    document.getElementById('deptSelect').innerHTML =
     '<option>-- Select Dept --</option>'
     + arr.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
    db.classList.remove('hidden');
   } else db.classList.add('hidden');
  }

  function startSession(){
   var dept=document.getElementById('deptSelect').value;
   if(!APP_STATE.storeId||!APP_STATE.walkType||(/Dept/.test(APP_STATE.walkType)&&!dept)){
    return alert('Select store, walk type, and dept if required.');
   }
   showSpinner();
   google.script.run
    .withSuccessHandler(id=>{
     hideSpinner();
     APP_STATE.sessionId=id;
     document.getElementById('step1').classList.add('hidden');
     document.getElementById('main').classList.remove('hidden');
     loadChecklistItems(dept);
    })
    .withFailureHandler(err=>{
     hideSpinner();
     alert('Error starting walk: '+err.message);
    })
    .startWalk(APP_STATE.walkType,dept,APP_STATE.storeId);
  }

  function loadChecklistItems(deptId){
   var fn = APP_STATE.walkType==='Monthly Store Walk'
       ? 'getAllChecklistItemsForStore'
       : 'getChecklistItemsFor',
     arg= fn==='getAllChecklistItemsForStore'?APP_STATE.storeId:deptId;
   showSpinner();
   google.script.run
    .withSuccessHandler(items=>{
     hideSpinner();
     APP_STATE.items=items;
     var html='';
     items.forEach((it,i)=>{
      html+=`<div class="question">
       <div>${i+1}. ${it.text}</div>
       <div class="radios">
        <label><input type="radio" name="q${i}" value="Ready"> Ready</label>
        <label><input type="radio" name="q${i}" value="Action Needed"> Action Needed</label>
       </div>
       <div class="assign-block hidden" data-for="q${i}">
        <input type="text" name="assign_q${i}" placeholder="Assigned To">
        <textarea name="comment_q${i}" rows="1" placeholder="Comment"></textarea>
       </div>
      </div>`;
     });
     document.getElementById('checklistForm').innerHTML=html;
     document.querySelectorAll('.radios input').forEach(r=>{
      r.onchange=e=>{
       var b=document.querySelector(
        '.assign-block[data-for="'+e.target.name+'"]'
       );
       b.classList.toggle('hidden',e.target.value!=='Action Needed');
      };
     });
    })
    .withFailureHandler(err=>{
     hideSpinner();
     alert('Error loading checklist: '+err.message);
    })[fn](arg);
  }

  function showIssueForm(){
   document.getElementById('issueForm').classList.toggle('hidden');
  }

  function submitIssue(){
   var loc=document.getElementById('locCode').value.trim(),
     cat=document.getElementById('category').value,
     com=document.getElementById('comment').value.trim(),
     file=document.getElementById('photoInput').files[0];
   if(!loc||!cat) return alert('Location and category required.');

   function logWith(photoId){
    showSpinner();
    google.script.run
     .withSuccessHandler(()=>{
      hideSpinner();
      alert('Issue logged.');
      document.getElementById('issueForm').classList.add('hidden');
      ['locCode','comment','photoInput'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('category').selectedIndex=0;
     })
     .withFailureHandler(err=>{
      hideSpinner();
      alert('Error logging issue: '+err.message);
     })
     .logIssue(APP_STATE.sessionId,loc,cat,com,photoId||'');
   }

   if(file){
    resizeAndUpload(file,800,dataUrl=>{
     showSpinner();
     google.script.run
      .withSuccessHandler(logWith)
      .withFailureHandler(err=>{
       hideSpinner();
       alert('Error uploading image: '+err.message);
      })
      .saveImage(dataUrl,file.name);
    });
   } else logWith('');
  }

  function endWalk(){
   var responses=APP_STATE.items.map((it,i)=>{
    var sel=document.querySelector('input[name="q'+i+'"]:checked');
    return {
     itemId:   it.id,
     answer:   sel?sel.value:'',
     assignedTo: sel&&sel.value==='Action Needed'
      ? document.querySelector('input[name="assign_q'+i+'"]').value.trim() : '',
     comment:  sel&&sel.value==='Action Needed'
      ? document.querySelector('textarea[name="comment_q'+i+'"]').value.trim() : ''
    };
   });
   var ais=document.getElementById('aislesInput').value.trim(),
     ems=document.getElementById('emailsInput').value.trim(),
     cm =document.getElementById('commentsInput').value.trim();

   showSpinner();
   google.script.run
    .withSuccessHandler(()=>{
     google.script.run
      .withSuccessHandler(()=>{
       hideSpinner();
       alert('Walk complete! Summary sent.');
       location.reload();
      })
      .withFailureHandler(err=>{
       hideSpinner();
       alert('Error sending summary: '+err.message);
      })
      .endWalk(APP_STATE.sessionId,ais,ems,cm);
    })
    .withFailureHandler(err=>{
     hideSpinner();
     alert('Error saving checklist: '+err.message);
    })
    .saveChecklistResponses(APP_STATE.sessionId,responses);
  }

  var APP_STATE={ sessionId:null, storeId:null, walkType:null, items:[] };
 </script>
</body>
</html>




code.gs
// -------------------------------------------------------------------
// Store Walk App - Code.gs
// -------------------------------------------------------------------

var SHEET_ID   = '1eypRGyuEiMS5Kjk-DoXkVUK40LzKIk1owAxPOq1jxdc';
var FOLDER_ID  = '1w7YGSYD2XKqBQCLW7gvKVw1p2fIzpOC9';
var LOGO_FILE_ID = '1AbCdEF2GhIj3KLmN4OpQrStUVwxYZ567'; // <-- your logo file ID

function doGet(e) {
 var tpl = HtmlService.createTemplateFromFile('Index');
 tpl.stores = getStores();

 // build store?departments map
 var deptRows = sheet('Departments').getDataRange().getValues();
 var deptsMap = {};
 deptRows.slice(1).forEach(function(r) {
  var deptId  = r[0].toString().trim();
  var storeIds = r[1].toString().split(',').map(s=>s.trim());
  var name   = r[2].toString().trim();
  storeIds.forEach(function(sid) {
   if (!deptsMap[sid]) deptsMap[sid] = [];
   deptsMap[sid].push({ id: deptId, name: name });
  });
 });
 tpl.departmentsMap = deptsMap;

 return tpl.evaluate().setTitle('Store Walk App');
}

function include(filename) {
 return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function sheet(name) {
 return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

function getUserRecord(email) {
 var rows = sheet('Users').getDataRange().getValues();
 for (var i=1; i<rows.length; i++) {
  if (rows[i][0].toString().trim().toLowerCase() ===
    email.toString().trim().toLowerCase()) {
   return {
    userEmail: rows[i][0].toString().trim(),
    storeId:  (rows[i][1]||'').toString().trim(),
    deptId:  (rows[i][2]||'').toString().trim(),
    role:   rows[i][3].toString().replace(/\s+/g,'').trim().toLowerCase()
   };
  }
 }
 return { userEmail: email, storeId:'', deptId:'', role:'' };
}

function getStores() {
 var user = getUserRecord(Session.getActiveUser().getEmail());
 var rows = sheet('Stores').getDataRange().getValues();
 var out = [];
 for (var i=1; i<rows.length; i++) {
  var id  = rows[i][0].toString().trim();
  var name = rows[i][1].toString().trim();
  if (user.role==='fieldleader' || id===user.storeId) {
   out.push({ id: id, name: name });
  }
 }
 return out;
}

function getDepartments(storeId) {
 var rows = sheet('Departments').getDataRange().getValues();
 var out = [];
 for (var i=1; i<rows.length; i++) {
  var deptID  = rows[i][0].toString().trim();
  var storeIDs = rows[i][1].toString().split(',').map(s=>s.trim());
  var name   = rows[i][2].toString().trim();
  if (storeIDs.indexOf(storeId)!==-1) {
   out.push({ id: deptID, name: name });
  }
 }
 return out;
}

function getChecklistItemsFor(deptId) {
 var rows = sheet('ChecklistItems').getDataRange().getValues();
 var out = [];
 for (var i=1; i<rows.length; i++) {
  if (rows[i][1].toString().trim()===deptId) {
   out.push({
    id:  rows[i][0].toString().trim(),
    text: rows[i][2].toString().trim()
   });
  }
 }
 return out;
}

function getAllChecklistItemsForStore(storeId) {
 var depts = getDepartments(storeId).map(d=>d.id);
 var rows = sheet('ChecklistItems').getDataRange().getValues();
 var out  = [];
 for (var i=1; i<rows.length; i++) {
  if (depts.indexOf(rows[i][1].toString().trim())!==-1) {
   out.push({
    id:  rows[i][0].toString().trim(),
    text: rows[i][2].toString().trim()
   });
  }
 }
 return out;
}

function startWalk(walkType, deptId, storeId) {
 var id  = Utilities.getUuid(),
   now  = new Date(),
   user = Session.getActiveUser().getEmail();
 sheet('WalkSessions').appendRow([
  id, user, storeId, walkType, deptId, now, '', '', ''
 ]);
 return id;
}

function logIssue(sessionId, loc, cat, com, photoId) {
 sheet('WalkIssues').appendRow([
  Utilities.getUuid(),
  sessionId,
  loc,
  cat,
  com,
  photoId,
  new Date()
 ]);
}

function saveChecklistResponses(sessionId, responses) {
 var sh = sheet('WalkChecklistResponses');
 responses.forEach(function(r) {
  sh.appendRow([sessionId, r.itemId, r.answer, r.assignedTo||'', r.comment||'']);
 });
}

function saveImage(dataUrl, filename) {
 var folder = DriveApp.getFolderById(FOLDER_ID),
   parts = dataUrl.match(/^data:(image\/.+);base64,(.+)$/),
   blob  = Utilities.newBlob(
        Utilities.base64Decode(parts[2]),
        parts[1],
        filename
       ),
   file  = folder.createFile(blob);
 return file.getId();
}

function createSummaryPdf(sessionId, aislesReviewed, endComments) {
 var ss   = SpreadsheetApp.openById(SHEET_ID),
   sessSh = ss.getSheetByName('WalkSessions'),
   respSh = ss.getSheetByName('WalkChecklistResponses'),
   itemSh = ss.getSheetByName('ChecklistItems'),
   issSh = ss.getSheetByName('WalkIssues'),
   row  = sessSh.getDataRange().getValues()
          .find(function(r){ return r[0] === sessionId; });

 if (!row) throw new Error('Session not found');
 var [, , storeId, walkType, deptId, startTS] = row,
   doc = DocumentApp.create('Store Walk Summary ' + sessionId),
   body = doc.getBody();

 // Logo, top-right, 200pt wide
 if (LOGO_FILE_ID) {
  try {
   var logoBlob = DriveApp.getFileById(LOGO_FILE_ID).getBlob(),
     para   = body.insertParagraph(0, ''),
     img   = para.insertInlineImage(0, logoBlob),
     ow    = img.getWidth(),
     oh    = img.getHeight(),
     newW   = 200,
     newH   = Math.round(oh * newW / ow);
   para.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
   img.setWidth(newW).setHeight(newH);
  } catch(e) {
   Logger.log('Logo load error: ' + e);
  }
 }

 function appendLV(label, val) {
  var p = body.appendParagraph('');
  p.appendText(label).setBold(true);
  p.appendText(String(val)).setBold(false).setUnderline(false);
 }
 appendLV('Store: ',    storeId);
 appendLV('Walk Type: ',  walkType);
 appendLV('Department: ',  deptId || '-');
 appendLV('Start Time: ',
  Utilities.formatDate(startTS, Session.getScriptTimeZone(), 'MM/dd/yy hh:mma'));
 appendLV('Aisles Reviewed: ', aislesReviewed);
 appendLV('Comments: ',   endComments);

 body.appendHorizontalRule();

 // Prepare checklist responses
 var itemsData = itemSh.getDataRange().getValues(),
   allResp  = respSh.getDataRange().getValues()
          .filter(function(r){ return r[0] === sessionId; })
          .map(function(r){
           return {
            question:  (itemsData.find(ir=>ir[0]===r[1])||[])[2] || r[1],
            answer:   r[2],
            assignedTo: r[3] || 'Unassigned',
            comment:  r[4] || ''
           };
          });

 // Action Items
 var actionItems  = allResp.filter(function(r){ return r.answer==='Action Needed'; }),
   actionGroups = {};
 actionItems.forEach(function(a){ 
  (actionGroups[a.assignedTo] = actionGroups[a.assignedTo]||[]).push(a);
 });

 body.appendParagraph('Action Items')
   .setHeading(DocumentApp.ParagraphHeading.HEADING2);
 if (Object.keys(actionGroups).length) {
  for (var who in actionGroups) {
   var h = body.appendParagraph('Assigned to: ' + who);
   h.setBold(true).setUnderline(true);
   actionGroups[who].forEach(function(a){
    body.appendListItem(a.question)
      .setGlyphType(DocumentApp.GlyphType.BULLET)
      .setNestingLevel(0)
      .setBold(true)
      .setUnderline(false);
    if (a.comment) {
     body.appendListItem(a.comment)
       .setGlyphType(DocumentApp.GlyphType.BULLET)
       .setNestingLevel(1)
       .setFontSize(10)
       .setBold(false)
       .setUnderline(false);
    }
   });
  }
 } else {
  body.appendParagraph('No action items.');
 }

 body.appendHorizontalRule();

 // Logged Issues
 body.appendParagraph('Logged Issues')
   .setHeading(DocumentApp.ParagraphHeading.HEADING2);
 var issues = issSh.getDataRange().getValues()
  .filter(function(r){ return r[1] === sessionId; })
  .map(function(r){
   return {
    loc:   String(r[2]||''),
    cat:   String(r[3]||''),
    com:   String(r[4]||''),
    photoId: r[5]
   };
  })
  .sort(function(a,b){
   function parseLoc(x){
    var loc = x.loc.toString(),
      major = parseInt(loc.slice(0,2),10) || 0,
      side = loc.charAt(2) || '',
      bay  = parseInt(loc.slice(3),10) || 0;
    return { major:major, side:side, bay:bay };
   }
   var A = parseLoc(a), B = parseLoc(b);
   if (A.major !== B.major) return A.major - B.major;
   if (A.side !== B.side ) return A.side < B.side ? -1 : 1;
   return A.bay - B.bay;
  });

 issues.forEach(function(issue){
  var h = body.appendParagraph('Location: ' + issue.loc + ' Category: ' + issue.cat);
  h.setBold(true);
  if (issue.com) body.appendParagraph(issue.com)
           .setBold(false).setUnderline(false);
  if (issue.photoId) {
   try {
    var pImg = body.appendParagraph('').setSpacingBefore(0).setSpacingAfter(0),
      blob = DriveApp.getFileById(issue.photoId).getBlob(),
      img = pImg.appendInlineImage(blob),
      ow  = img.getWidth(), oh = img.getHeight(),
      newW = 200, newH = Math.round(oh * newW / ow);
    img.setWidth(newW).setHeight(newH);
   } catch(e) {
    body.appendParagraph('?? Could not load image').setBold(false);
   }
  }
  body.appendHorizontalRule();
 });

 // Good to Go
 body.appendParagraph('Good to Go')
   .setHeading(DocumentApp.ParagraphHeading.HEADING2);
 var readyItems = allResp.filter(function(r){ return r.answer==='Ready'; });
 if (readyItems.length) {
  readyItems.forEach(function(r){
   body.appendListItem(r.question)
     .setBold(false)
     .setUnderline(false);
  });
 } else {
  body.appendParagraph('No items marked Ready.');
 }

 doc.saveAndClose();

 var pdf = DriveApp.getFileById(doc.getId())
        .getAs(MimeType.PDF)
        .setName('Store-Walk-Summary-' + sessionId + '.pdf');
 DriveApp.getFileById(doc.getId()).setTrashed(true);
 return pdf;
}

function endWalk(sessionId, aislesReviewed, emailCsv, comments) {
 try {
  var pdf = createSummaryPdf(sessionId, aislesReviewed, comments),
    to = Array.isArray(emailCsv) 
       ? emailCsv.join(',') 
       : String(emailCsv).trim();
  if (!to) throw new Error('No email recipient provided');
  MailApp.sendEmail({
   to:     to,
   subject:   'Store Walk Summary - Session ' + sessionId,
   body:    'Please see the attached summary PDF.',
   attachments: [ pdf ]
  });
  return 'EMAIL_SENT';
 } catch(err) {
  Logger.log('endWalk error: ' + err);
  throw err;
 }
}
