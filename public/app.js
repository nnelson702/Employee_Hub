// --- bootstrap Supabase ---
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- el helpers ---
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
const fmtPct = (p) => (p == null ? "—" : `${Number(p).toFixed(2)}%`);

// tabs we may restrict per-user (Home & Sales are always allowed)
const RESTRICTED_TABS = ["pl", "deptwalk", "deptwalk-results", "pop"];
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
    $("#btn-signout").classList.remove("hidden");
    $("#whoami").textContent = session.user.email;
    $("#logged-out").classList.add("hidden");
    $("#topNav").classList.remove("hidden");

    await loadProfile(); // loads profile + tab permissions
    setupNav();
    routeTo("sales"); // default
    await populateStoreDropdowns();
    // load current month by default
    const now = new Date();
    $("#monthInput").value = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    $("#btn-load").click();
  } else {
    $("#whoami").textContent = "";
    $("#btn-signout").classList.add("hidden");
    $("#topNav").classList.add("hidden");
    $("#logged-out").classList.remove("hidden");
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
  $("#nav-admin").classList.toggle("hidden", !profile.is_admin);

  await loadTabPermissions();
}

// ----- tab permissions -----
async function loadTabPermissions() {
  // base allowed tabs
  allowedTabs = new Set(["home", "sales"]);

  if (!profile) return;

  if (profile.is_admin) {
    // admins: everything
    RESTRICTED_TABS.forEach((t) => allowedTabs.add(t));
    allowedTabs.add("admin");
    applyTabVisibility();
    return;
  }

  // non-admin: read from tab_access
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
  $("#topNav button") &&
    $$("#topNav button").forEach((btn) => {
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
  $("#topNav").addEventListener("click", (e) => {
    if (e.target.matches("button[data-route]")) {
      routeTo(e.target.getAttribute("data-route"));
    }
  });
}

function routeTo(route) {
  // guard: don't allow navigating to tabs the user shouldn't see
  if (route !== "home" && route !== "sales") {
    if (route === "admin") {
      if (!profile?.is_admin) route = "home";
    } else if (!allowedTabs.has(route)) {
      route = "sales";
    }
  }

  // toggle active
  $$("#topNav button").forEach((b) =>
    b.classList.toggle("active", b.getAttribute("data-route") === route)
  );
  // show page
  $$(".page").forEach((p) => p.classList.add("hidden"));
  switch (route) {
    case "home":
      $("#page-home").classList.remove("hidden");
      break;
    case "sales":
      $("#page-sales").classList.remove("hidden");
      break;
    case "pl":
      $("#page-pl").classList.remove("hidden");
      break;
    case "deptwalk":
      $("#page-deptwalk").classList.remove("hidden");
      break;
    case "deptwalk-results":
      $("#page-deptwalk-results").classList.remove("hidden");
      break;
    case "pop":
      $("#page-pop").classList.remove("hidden");
      break;
    case "admin":
      if (profile?.is_admin) {
        $("#page-admin").classList.remove("hidden");
        bootAdmin();
      } else {
        $("#status").textContent = "Admin only.";
        routeTo("home");
      }
      break;
    default:
      $("#page-sales").classList.remove("hidden");
  }
}

// ---------- sales page ----------
$("#btn-load")?.addEventListener("click", async () => {
  const storeId = $("#storeSelect").value;
  const month = $("#monthInput").value; // yyyy-mm
  currentStoreId = storeId;
  if (!storeId || !month) return;

  $("#status").textContent = "Month loaded.";
  await loadMonth(storeId, month);
});

async function populateStoreDropdowns() {
  // use v_user_stores if you have it; fall back to stores
  const { data, error } = await supabase
    .from("v_user_stores")
    .select("store_id, store_name")
    .order("store_id");
  if (error && error.code !== "PGRST116") {
    $("#status").textContent = error.message;
    return;
  }
  let stores = data;
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
    const sel = "#" + id;
    const el = document.querySelector(sel);
    if (!el) return;
    el.innerHTML = "";
    for (const s of stores) {
      const opt = document.createElement("option");
      opt.value = s.store_id;
      opt.textContent = `${s.store_id} — ${s.store_name ?? ""}`.trim();
      el.appendChild(opt);
    }
  });

  // also fill user select in admin (for tab + store access)
  await refreshUsersForSelect();
}

// ---------- loadMonth ----------
async function loadMonth(storeId, yyyyMM) {
  // call your build-forecast edge function to ensure version exists
  try {
    await callBuildForecast(storeId, yyyyMM);
  } catch (e) {
    // non-blocking
  }

  const [yearStr, monthStr] = yyyyMM.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1–12
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

  renderCalendar(data, yyyyMM);
  renderSummary(storeId, yyyyMM, data);
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
  cal.innerHTML = "";
  const monthStart = new Date(`${yyyyMM}-01T00:00:00`);
  const firstDow = monthStart.getDay(); // 0 sun
  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0
  ).getDate();

  // pad before
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
      <div class="pct ${pctToGoal >= 100 ? "ok" : "bad"}">${
      pctDisplay || "&nbsp;"
    }</div>
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
  $("#dayModal").classList.remove("hidden");
}

$("#btnCloseModal")?.addEventListener("click", () => {
  $("#dayModal").classList.add("hidden");
  modalDate = null;
});

$("#btnSaveModal")?.addEventListener("click", async () => {
  const payload = collectModalValues();
  const { error } = await supabase.from("actual_daily").upsert(payload);
  if (error) {
    $("#status").textContent = error.message;
    return;
  }
  $("#dayModal").classList.add("hidden");
  const month = $("#monthInput").value;
  await loadMonth(currentStoreId, month);
});

// Clear all actuals for the day
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
  $("#dayModal").classList.add("hidden");
  const month = $("#monthInput").value;
  await loadMonth(currentStoreId, month);
});

// ---- Edge function call (best-effort) ----
async function callBuildForecast(storeId, yyyyMM) {
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

// ------ ADMIN ------
async function bootAdmin() {
  // top-level bindings (idempotent, but we don't care if we re-add once)
  $("#btn-refresh-users")?.addEventListener("click", refreshUsersTable);
  $("#admin-user-search")?.addEventListener("input", refreshUsersTable);

  $("#sa-userSelect")?.addEventListener("change", refreshAccessTable);
  $("#btn-add-access")?.addEventListener("click", grantAccess);

  $("#ta-userSelect")?.addEventListener("change", refreshTabAccessTable);

  $("#btn-load-goals")?.addEventListener("click", loadGoals);
  $("#btn-save-goals")?.addEventListener("click", saveGoals);

  await Promise.all([
    refreshUsersTable(),
    refreshUsersForSelect(),
    refreshAccessTable(),
    refreshTabAccessTable(),
  ]);
}

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
    $("#nav-admin").classList.toggle("hidden", !profile.is_admin);
  }
}

// ---- Store access table ----
async function refreshAccessTable() {
  if (!profile?.is_admin) return;
  const userId = $("#sa-userSelect").value;
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
  const userId = $("#sa-userSelect").value;
  const storeId = $("#sa-storeSelect").value;
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
    };
    const label = labelMap[key] || key;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}</td>
      <td>${hasAccess ? "Yes" : "No"}</td>
      <td>
        <button class="secondary" data-tab="${key}" data-has="${hasAccess ? "1" : "0"}">
          ${hasAccess ? "Revoke" : "Grant"}
        </button>
      </td>
    `;
    tr
      .querySelector("button[data-tab]")
      ?.addEventListener("click", () =>
        setTabAccess(userId, key, !hasAccess)
      );
    tb.appendChild(tr);
  }

  // Static row for Sales tab – always enabled, just for visibility
  const salesRow = document.createElement("tr");
  salesRow.innerHTML = `
    <td>Sales Goals & Current Results</td>
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

  // if we changed our own tab access, reload permissions
  if (userId === profile.id) {
    await loadTabPermissions();
  }
}

// ---- Monthly Goals (monthly_goals table) ----
async function loadGoals() {
  const storeId = $("#mg-storeSelect").value;
  const month = $("#mg-monthInput").value; // yyyy-mm
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
  const storeId = $("#mg-storeSelect").value;
  const month = $("#mg-monthInput").value; // yyyy-mm
  const sales = $("#mg-sales").value ? Number($("#mg-sales").value) : null;
  const txn = $("#mg-txn").value ? Number($("#mg-txn").value) : null;
  const atv = $("#mg-atv").value ? Number($("#mg-atv").value) : null;

  if (!storeId || !month) {
    $("#mg-status").textContent = "Select a store and month first.";
    return;
  }

  $("#mg-status").textContent = "Saving monthly goals…";

  console.log("Saving monthly goals", { storeId, month, sales, txn, atv });

  // 1) Save to monthly_goals
  const { error: upsertError } = await supabase
    .from("monthly_goals")
    .upsert(
      { store_id: storeId, month, sales_goal: sales, txn_goal: txn, atv_goal: atv },
      { onConflict: "store_id,month" }
    );

  if (upsertError) {
    console.error("Error saving monthly goals", upsertError);
    $("#mg-status").textContent = `Error: ${upsertError.message}`;
    return;
  }

  // 2) Apply to forecast_daily via RPC
  const { error: rpcError } = await supabase.rpc("apply_monthly_goals", {
    p_store_id: String(storeId),
    p_month: month,
  });

  if (rpcError) {
    console.error("Error applying monthly goals", rpcError);
    $("#mg-status").textContent =
      `Goals saved, but daily breakdown update failed: ${rpcError.message}`;
    return;
  }

  $("#mg-status").textContent =
    `Goals saved and applied to daily forecast for store ${storeId}.`;

  // 3) If user is currently viewing the same store + month in the calendar, refresh it
  const uiMonth = $("#monthInput").value;
  const uiStore = $("#storeSelect").value;
  if (uiMonth === month && uiStore === storeId) {
    await loadMonth(storeId, month);
  }
}

// ---- minimal KPI card builder placeholders ----
function buildKpiCards(row) {
  $("#modalKpis").innerHTML = `
    <div class="microstatus muted">KPI editor (unchanged from your current version).</div>
  `;
}
function collectModalValues() {
  return { store_id: currentStoreId, date: modalDate };
}

// --------------------------------------------------------
// Forgot password + password reset flow
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

  supabase.auth.onAuthStateChange((event /*, session */) => {
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
        showStatusMessage(resetMessageEl, "Passwords do not match.", "error");
        return;
      }

      showStatusMessage(resetMessageEl, "Updating password…");

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        showStatusMessage(resetMessageEl, `Error: ${error.message}`, "error");
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

// ---- start ----
initAuth();
