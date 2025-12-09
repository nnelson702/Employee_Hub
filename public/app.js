
// --- bootstrap Supabase ---

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- helpers ---

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
const RESTRICTED_TABS = ["pl", "deptwalk", "deptwalk-results", "pop", "b2b", "eir"];
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
    $("#password-reset")?.classList.add("hidden");
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

    setupPostUi();
  } else {
    $("#whoami").textContent = "";
    $("#btn-signout")?.classList.add("hidden");
    $("#topNav")?.classList.add("hidden");
    $("#logged-out")?.classList.remove("hidden");
    $("#password-reset")?.classList.add("hidden");
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
      opt.textContent = `${s.store_id} — ${s.store_name ?? ""}`.trim();
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
      <div class="num">${String(day).padStart(2, "0")} <button class="details pill">Details</button></div>
      <div class="sales">${salesDisplay}</div>
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
          <span class="dow-current" id="dow-pct-${idx}">—</span>
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
      span.textContent = "—";
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

  $("#dow-status").textContent = "Loading monthly goals…";

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

  const storeKey = mg.store_id || storeId;

  const payload = days.map((d) => {
    const sugg = suggestions[d.date] || { sales: 0, txn: 0 };
    const weekOfMonth = Math.ceil(d.dayNum / 7);

    return {
      store_id: storeKey,
      date: d.date,
      sales_goal: sugg.sales,
      txn_goal: sugg.txn,
      week_of_month: weekOfMonth,
      weekday_index: d.dow,
    };
  });

  $("#dow-status").textContent = "Saving daily goals…";

  const { error } = await supabase.from("forecast_daily").upsert(payload);

  if (error) {
    console.error("Error saving daily goals from DOW weights", error);
    $("#dow-status").textContent = `Error saving: ${error.message}`;
    return;
  }

  $("#dow-status").textContent =
    "Daily goals updated from day-of-week weights.";

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
    "Weights reset to equal. Applying to daily goals…";
  await applyDowWeightsToMonth();
}

// --------------------------------------------------------
// Home page post creation and feed
// --------------------------------------------------------

function setupPostUi() {
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

    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const div = document.createElement("div");
      div.className = "attachment";
      div.textContent = `Attachment: ${file.name}`;
      card.appendChild(div);
    }

    const footer = document.createElement("div");
    footer.className = "post-footer";

    const likeBtn = document.createElement("button");
    likeBtn.className = "small secondary";
    likeBtn.textContent = "👍 0";

    const commentBtn = document.createElement("button");
    commentBtn.className = "small secondary";
    commentBtn.textContent = "💬 0";

    footer.appendChild(likeBtn);
    footer.appendChild(commentBtn);
    card.appendChild(footer);

    feed.insertBefore(card, feed.firstChild);
    hideModal();
  });
}
setupPostUi.bound = false;

// ---- Suggest DOW weights from historical data ----

async function suggestDowWeights(storeId, yyyyMM) {
  if (!storeId || !yyyyMM) return null;

  const [yearStr, monthStr] = yyyyMM.split("-");
  const prevYear = Number(yearStr) - 1;
  if (prevYear < 2000) return null;

  const start = `${prevYear}-${monthStr}-01`;
  const daysInPrev = new Date(prevYear, Number(monthStr), 0).getDate();
  const end = `${prevYear}-${monthStr}-${String(daysInPrev).padStart(
    2,
    "0"
  )}`;

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

  if (!data || data.length === 0) return null;

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

  if (dowCount === 0 || sumAvgs === 0) return null;

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

// ---- ADMIN ------

async function bootAdmin() {
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

      $("#mg-status").textContent = "Calculating goal suggestions…";

      const suggestions = await calculateGoalSuggestions(storeId, month);
      if (!suggestions) {
        $("#mg-status").textContent =
          "No historical data available for suggestions.";
        return;
      }

      renderGoalSuggestions(suggestions);
      $("#mg-status").textContent =
        "Suggestions loaded. Click a card to apply.";
    });

    bootAdmin.bound = true;
  }

  await Promise.all([
    refreshUsersTable(),
    refreshUsersForSelect(),
    refreshAccessTable(),
    refreshTabAccessTable(),
  ]);

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

// ---- Store access ----

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
    .upsert(
      { user_id: userId, store_id: storeId },
      { onConflict: "user_id,store_id" }
    );

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

// ---- Tab access (Admin) ----

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
      ?.addEventListener("click", () =>
        setTabAccess(userId, key, !hasAccess)
      );
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
      .upsert(
        { user_id: userId, tab_key: tabKey },
        { onConflict: "user_id,tab_key" }
      );
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

  $("#mg-status").textContent = data
    ? `Goals loaded for store ${storeId}.`
    : "No goals saved yet.";
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

  $("#mg-status").textContent = "Saving monthly goals…";

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

  if (!data || data.length === 0) return null;

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
  if (!hist) return null;

  const baseSales = hist.totalSales;
  const baseTxn = hist.totalTxn;
  const baseAtv = hist.avgAtv || 0;

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
      atv:
        baseTxn > 0
          ? Math.round((baseSales * mult) / (baseTxn * mult) * 100) / 100
          : baseAtv,
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
      $$(".suggestion-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");

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
      showStatusMessage(
        authMessageEl,
        "Please enter your email address first.",
        "error"
      );
      return;
    }

    showStatusMessage(authMessageEl, "Sending password reset email…");

    const redirectTo = `${window.location.origin}/#/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      showStatusMessage(authMessageEl, `Error: ${error.message}`, "error");
    } else {
      showStatusMessage(
        authMessageEl,
        "Password reset email sent. Please check your inbox.",
        "success"
      );
    }
  });

  if (window.location.hash && window.location.hash.includes("type=recovery")) {
    showResetView();
    showStatusMessage(
      resetMessageEl,
      "Please enter a new password for your account."
    );
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      showResetView();
      showStatusMessage(
        resetMessageEl,
        "Token verified. Please enter a new password for your account."
      );
    }
  });

  if (btnSetPassword) {
    btnSetPassword.addEventListener("click", async () => {
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!newPassword || !confirmPassword) {
        showStatusMessage(
          resetMessageEl,
          "Please enter and confirm your new password.",
          "error"
        );
        return;
      }

      if (newPassword !== confirmPassword) {
        showStatusMessage(
          resetMessageEl,
          "Passwords do not match.",
          "error"
        );
        return;
      }

      showStatusMessage(resetMessageEl, "Updating password…");

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        showStatusMessage(
          resetMessageEl,
          `Error: ${error.message}`,
          "error"
        );
        return;
      }

      showStatusMessage(
        resetMessageEl,
        "Password updated. You can now sign in with your new password.",
        "success"
      );

      setTimeout(() => {
        showLoginView();
      }, 2000);
    });
  }
})();

// ---- start the app ----

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
    "Suggested weights loaded from historical data. Review and click Apply to daily goals.";
});
