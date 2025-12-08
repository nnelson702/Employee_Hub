// Skye Bridge Forecasting & Operations client script

// --- bootstrap Supabase ---
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tabs that require admin permission
const RESTRICTED_TABS = ["admin"];
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
    document.getElementById("status").textContent = "Signed in.";
    document.getElementById("btn-signout").classList.remove("hidden");
    document.getElementById("btn-signin").classList.add("hidden");
    document.getElementById("whoami").textContent = session.user.email;
    await loadProfile();
    setupNav();
    // Populate dropdowns and default month
    await populateStoreDropdowns();
    const now = new Date();
    const monthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthInput = document.getElementById("monthInput");
    if (monthInput) monthInput.value = monthVal;
  } else {
    document.getElementById("whoami").textContent = "";
    document.getElementById("btn-signout").classList.add("hidden");
    document.getElementById("btn-signin").classList.remove("hidden");
    document.getElementById("topNav").classList.remove("hidden");
    document.getElementById("status").textContent = "Please sign in.";
  }
}

function bindAuthButtons() {
  const signinBtn = document.getElementById("btn-signin");
  const signoutBtn = document.getElementById("btn-signout");
  if (signinBtn) {
    signinBtn.addEventListener("click", async () => {
      const email = prompt("Email");
      const password = prompt("Password");
      if (!email || !password) return;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        document.getElementById("status").textContent = error.message;
        return;
      }
      session = data.session;
      await initAuth();
    });
  }
  if (signoutBtn) {
    signoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.reload();
    });
  }
}

async function loadProfile() {
  // fetch user profile from profiles table
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_admin,name,role")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) {
    document.getElementById("status").textContent = error.message;
    return;
  }
  profile = data || { id: session.user.id, email: session.user.email, is_admin: false };
  // Show/hide admin tab
  document.querySelector("button[data-route='admin']").classList.toggle("hidden", !profile.is_admin);
  // load tab permissions (non-admin)
  allowedTabs = new Set(["home", "sales"]);
  if (profile.is_admin) {
    RESTRICTED_TABS.forEach((t) => allowedTabs.add(t));
  } else {
    const { data: tabRows, error: tabErr } = await supabase
      .from("tab_access")
      .select("tab_key")
      .eq("user_id", profile.id);
    if (!tabErr && tabRows) {
      tabRows.forEach((row) => allowedTabs.add(row.tab_key));
    }
  }
}

function setupNav() {
  const nav = document.getElementById("topNav");
  nav.addEventListener("click", (e) => {
    if (e.target.matches("button[data-route]")) {
      const route = e.target.getAttribute("data-route");
      routeTo(route);
    }
  });
  document.getElementById("btn-load").addEventListener("click", async () => {
    const storeSelect = document.getElementById("storeSelect");
    const monthInput = document.getElementById("monthInput");
    if (!storeSelect.value || !monthInput.value) return;
    currentStoreId = storeSelect.value;
    await loadMonth(currentStoreId, monthInput.value);
  });
  // Admin card clicks
  document.querySelectorAll(".admin-cards .card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".admin-cards .card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      const sub = document.getElementById("admin-subpage");
      const key = card.getAttribute("data-admin");
      sub.textContent = `Loading ${key}... (to be implemented)`;
    });
  });
  // Modal buttons
  document.getElementById("btnCloseModal").addEventListener("click", () => {
    document.getElementById("dayModal").classList.add("hidden");
    modalDate = null;
  });
  document.getElementById("btnSaveModal").addEventListener("click", async () => {
    const payload = collectModalValues();
    const { error } = await supabase.from("actual_daily").upsert(payload);
    if (error) {
      document.getElementById("status").textContent = error.message;
      return;
    }
    document.getElementById("dayModal").classList.add("hidden");
    const month = document.getElementById("monthInput").value;
    if (currentStoreId && month) {
      await loadMonth(currentStoreId, month);
    }
  });
  document.getElementById("btn-clear-all").addEventListener("click", async () => {
    if (!modalDate) return;
    const { error } = await supabase
      .from("actual_daily")
      .delete()
      .eq("store_id", currentStoreId)
      .eq("date", modalDate);
    if (error) {
      document.getElementById("status").textContent = error.message;
      return;
    }
    document.getElementById("dayModal").classList.add("hidden");
    const month = document.getElementById("monthInput").value;
    if (currentStoreId && month) {
      await loadMonth(currentStoreId, month);
    }
  });
}

function routeTo(route) {
  // enforce permissions
  if (!allowedTabs.has(route)) {
    route = "home";
  }
  // highlight active nav
  document.querySelectorAll("nav button[data-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-route") === route);
  });
  // show/hide pages
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  const page = document.getElementById(`page-${route}`);
  if (page) page.classList.remove("hidden");
}

async function populateStoreDropdowns() {
  // load stores user has access to
  const storeSelect = document.getElementById("storeSelect");
  storeSelect.innerHTML = "";
  // if admin: list all stores (example values)
  let stores = [];
  if (profile?.is_admin) {
    // Example: fetch from stores table (not provided). We'll hardcode sample for demo.
    stores = [
      { id: "18228", name: "Store 18228" },
      { id: "18690", name: "Store 18690" },
      { id: "18507", name: "Store 18507" },
      { id: "19117", name: "Store 19117" },
    ];
  } else {
    // fetch from store_access for user
    const { data: saRows } = await supabase
      .from("store_access")
      .select("store_id")
      .eq("user_id", profile.id);
    stores = (saRows || []).map((r) => ({ id: r.store_id, name: `Store ${r.store_id}` }));
  }
  stores.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    storeSelect.appendChild(opt);
  });
  if (stores.length) currentStoreId = stores[0].id;
}

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

// Render month data
async function loadMonth(storeId, yyyyMM) {
  document.getElementById("status").textContent = "Loading…";
  const [yearStr, monthStr] = yyyyMM.split("-");
  const firstDay = `${yearStr}-${monthStr}-01`;
  const nextMonth = Number(monthStr) === 12 ? 1 : Number(monthStr) + 1;
  const nextYear = Number(monthStr) === 12 ? Number(yearStr) + 1 : Number(yearStr);
  const nextMonthStr = String(nextMonth).padStart(2, "0");
  const firstDayOfNextMonth = `${nextYear}-${nextMonthStr}-01`;
  // fetch forecast rows
  const { data: rows, error } = await supabase
    .from("forecast_daily")
    .select("*")
    .eq("store_id", storeId)
    .gte("date", firstDay)
    .lt("date", firstDayOfNextMonth)
    .order("date");
  if (error) {
    document.getElementById("status").textContent = error.message;
    return;
  }
  renderCalendar(rows || [], yyyyMM);
  renderSummary(rows || []);
  document.getElementById("status").textContent = "";
}

function renderSummary(rows) {
  const salesGoal = rows.reduce((a, r) => a + Number(r.sales_goal || 0), 0);
  const salesAct = rows.reduce((a, r) => a + Number(r.sales_actual || 0), 0);
  const pct = salesGoal > 0 ? (salesAct / salesGoal) * 100 : 0;
  document.getElementById("summary").textContent = `Sales: ${fmtMoney(salesAct)} / ${fmtMoney(salesGoal)} | ${pct.toFixed(2)}%`;
}

function fmtMoney(n) {
  return n == null ? "–" : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtInt(n) {
  return n == null ? "–" : Number(n).toLocaleString();
}

function renderCalendar(rows, yyyyMM) {
  const cal = document.getElementById("calendar");
  if (!cal) return;
  cal.innerHTML = "";
  const monthStart = new Date(`${yyyyMM}-01T00:00:00`);
  const firstDow = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  // blank cells for leading days
  for (let i = 0; i < firstDow; i++) {
    const d = document.createElement("div");
    d.className = "day";
    cal.appendChild(d);
  }
  const todayKey = new Date().toISOString().slice(0, 10);
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
      <div class="num">${String(day).padStart(2, "0")} <button class="details pill" style="font-size:0.6rem;">Details</button></div>
      <div class="sales">${salesDisplay}</div>
      <div class="row"><div class="bold">${txnDisplay}</div> <div class="muted">${atvDisplay}</div></div>
      <div class="pct ${pctToGoal >= 100 ? "ok" : "bad"}">${pctDisplay || "&nbsp;"}</div>
    `.replace(/\s+/g, " ");
    div.querySelector(".details").addEventListener("click", () => openDayModal(date, row));
    cal.appendChild(div);
  }
}

let modalDate = null;
function openDayModal(date, row) {
  modalDate = date;
  document.getElementById("modalTitle").textContent = `${date} — Day details`;
  buildKpiCards(row);
  document.getElementById("dayModal").classList.remove("hidden");
}

function buildKpiCards(row) {
  const modalBody = document.getElementById("modal-body");
  modalBody.innerHTML = "";
  const kpis = [
    { key: "sales", goal: row.sales_goal, actual: row.sales_actual, label: "Sales" },
    { key: "txn", goal: row.txn_goal, actual: row.txn_actual, label: "Transactions" },
    { key: "atv", goal: row.atv_goal, actual: row.atv_actual, label: "ATV" },
  ];
  kpis.forEach((kpi) => {
    const card = document.createElement("div");
    card.style.marginBottom = "0.5rem";
    card.innerHTML = `
      <strong>${kpi.label}</strong><br>
      Goal: <input type="number" step="0.01" id="goal-${kpi.key}" value="${kpi.goal || ""}" placeholder="Goal" style="width: 7rem;">\n
      Actual: <input type="number" step="0.01" id="actual-${kpi.key}" value="${kpi.actual || ""}" placeholder="Actual" style="width: 7rem;">\n
    `;
    modalBody.appendChild(card);
  });
  // placeholder for prior year values (read-only)
  const pyDiv = document.createElement("div");
  pyDiv.style.marginTop = "0.5rem";
  pyDiv.innerHTML = `<em>Prior year data will be shown here (same calendar date)</em>`;
  modalBody.appendChild(pyDiv);
}

function collectModalValues() {
  const salesGoal = Number(document.getElementById("goal-sales").value) || 0;
  const txnGoal = Number(document.getElementById("goal-txn").value) || 0;
  const atvGoal = Number(document.getElementById("goal-atv").value) || 0;
  const salesActual = Number(document.getElementById("actual-sales").value) || 0;
  const txnActual = Number(document.getElementById("actual-txn").value) || 0;
  const atvActual = Number(document.getElementById("actual-atv").value) || 0;
  return {
    store_id: currentStoreId,
    date: modalDate,
    sales_goal: salesGoal,
    txn_goal: txnGoal,
    atv_goal: atvGoal,
    sales_actual: salesActual,
    txn_actual: txnActual,
    atv_actual: atvActual,
  };
}

// Initialize app after DOM load
document.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  routeTo("home");
});
