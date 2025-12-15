import { getSupabase } from "../supabaseClient.js";
import { State } from "../state.js";
import { $, $$, toast } from "../ui.js";

const supabase = getSupabase();

const TAB_DEFS = [
  { key: "goals-admin", label: "Goals Admin" },
  { key: "goals-insights", label: "Goals & Insights" },
  { key: "admin-panel", label: "Admin Panel" },
  { key: "feed", label: "Comms Feed" },
  { key: "tasks", label: "Tasks" },
  { key: "walks", label: "Dept Walks" },
  { key: "library", label: "Marketing & Training" }
];

let rootEl = null;
let activeSection = "stores";

let cacheStores = [];
let cacheUsers = [];

let selectedStoreId = null;
let selectedUserId = null;

export function mountAdminPanel(el) {
  rootEl = el;
  renderShell();
  bindShellEvents();
  refreshAll();
}

function renderShell() {
  rootEl.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h2>Admin Panel</h2>
          <div class="muted small">Profiles for Stores + Users + Permissions + Special Days</div>
        </div>
        <div class="spacer"></div>
        <button id="adminRefresh" class="btn">Reload data</button>
      </div>
    </div>

    <div style="height:12px"></div>

    <div class="admin-shell">
      <div class="card">
        <div class="admin-nav">
          <button class="btn admin-nav-btn active" data-admin-section="stores">Stores</button>
          <button class="btn admin-nav-btn" data-admin-section="users">Users</button>
          <button class="btn admin-nav-btn" data-admin-section="permissions">Permissions</button>
          <button class="btn admin-nav-btn" data-admin-section="special-days">Special Days</button>
        </div>
        <div style="height:10px"></div>
        <div class="pill">Admin-only</div>
      </div>

      <div id="adminMain"></div>
    </div>
  `;

  renderSection();
}

function bindShellEvents() {
  $("#adminRefresh")?.addEventListener("click", refreshAll);

  rootEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-admin-section]");
    if (!btn) return;
    activeSection = btn.getAttribute("data-admin-section");
    $$(".admin-nav-btn", rootEl).forEach(b => b.classList.toggle("active", b === btn));
    renderSection();
  });
}

async function refreshAll() {
  if ((State.hubProfile?.role || "") !== "admin") {
    toast("Admin Panel requires admin role.", "error");
    return;
  }

  await Promise.all([loadStores(), loadUsers()]);
  renderSection();
  toast("Admin data loaded.", "success");
}

async function loadStores() {
  const { data, error } = await supabase
    .from("hub_stores")
    .select("*")
    .order("store_id");

  if (error) {
    console.error(error);
    toast("Failed loading hub_stores", "error");
    return;
  }
  cacheStores = data || [];
  if (!selectedStoreId && cacheStores.length) selectedStoreId = cacheStores[0].store_id;
}

async function loadUsers() {
  const { data, error } = await supabase
    .from("hub_profiles")
    .select("*")
    .order("email");

  if (error) {
    console.error(error);
    toast("Failed loading hub_profiles", "error");
    return;
  }
  cacheUsers = data || [];
  if (!selectedUserId && cacheUsers.length) selectedUserId = cacheUsers[0].id;
}

function renderSection() {
  const main = $("#adminMain", rootEl);
  if (!main) return;

  if ((State.hubProfile?.role || "") !== "admin") {
    main.innerHTML = `<div class="card">Admin only.</div>`;
    return;
  }

  if (activeSection === "stores") return renderStores(main);
  if (activeSection === "users") return renderUsers(main);
  if (activeSection === "permissions") return renderPermissions(main);
  if (activeSection === "special-days") return renderSpecialDays(main);

  main.innerHTML = `<div class="card">Unknown admin section.</div>`;
}

/* ---------------- STORES ---------------- */

function renderStores(main) {
  const selected = cacheStores.find(s => s.store_id === selectedStoreId) || null;

  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <h2 style="margin:0">Stores</h2>
          <div class="spacer"></div>
          <button id="newStore" class="btn primary">+ New Store</button>
        </div>

        <div style="height:10px"></div>

        <table class="table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Name</th>
              <th>Eagle #</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            ${cacheStores.map(s => `
              <tr data-store-row="${s.store_id}" style="cursor:pointer">
                <td class="mono">${s.store_id}</td>
                <td>${escapeHtml(s.store_name)}</td>
                <td class="mono">${escapeHtml(s.eagle_number)}</td>
                <td>${s.is_active ? "✅" : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="card" id="storeProfileCard">
        <div class="row">
          <h2 style="margin:0">Store Profile</h2>
          <div class="spacer"></div>
          <span class="pill">${selected ? "Edit" : "Select a store"}</span>
        </div>

        <div style="height:10px"></div>

        <form id="storeForm">
          <label>store_id (text)</label>
          <input id="store_id" ${selected ? "disabled" : ""} value="${selected?.store_id || ""}" placeholder="18228" />

          <label>store_name</label>
          <input id="store_name" value="${selected?.store_name || ""}" placeholder="Tropicana" />

          <label>eagle_number (18228->1 etc)</label>
          <input id="eagle_number" value="${selected?.eagle_number || ""}" placeholder="1" />

          <label>timezone</label>
          <input id="timezone" value="${selected?.timezone || "America/Los_Angeles"}" />

          <label>is_active</label>
          <select id="is_active">
            <option value="true" ${selected?.is_active !== false ? "selected" : ""}>true</option>
            <option value="false" ${selected?.is_active === false ? "selected" : ""}>false</option>
          </select>

          <div class="row" style="margin-top:12px">
            <button class="btn primary" type="submit">Save Store</button>
            <div class="spacer"></div>
            <button id="storeReload" class="btn" type="button">Reload</button>
          </div>
        </form>
      </div>
    </div>
  `;

  $("#newStore", main)?.addEventListener("click", () => {
    selectedStoreId = null;
    renderSection();
  });

  $("#storeReload", main)?.addEventListener("click", async () => {
    await loadStores();
    renderSection();
    toast("Stores reloaded.", "success");
  });

  $$("tr[data-store-row]", main).forEach(tr => {
    tr.addEventListener("click", () => {
      selectedStoreId = tr.getAttribute("data-store-row");
      renderSection();
    });
  });

  $("#storeForm", main)?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      store_id: $("#store_id", main).value.trim(),
      store_name: $("#store_name", main).value.trim(),
      eagle_number: $("#eagle_number", main).value.trim(),
      timezone: $("#timezone", main).value.trim() || "America/Los_Angeles",
      is_active: $("#is_active", main).value === "true"
    };

    if (!payload.store_id) return toast("store_id is required", "error");
    if (!payload.store_name) return toast("store_name is required", "error");
    if (!payload.eagle_number) return toast("eagle_number is required", "error");

    const { error } = await supabase.from("hub_stores").upsert(payload, { onConflict: "store_id" });
    if (error) return toast(error.message, "error");

    await loadStores();
    selectedStoreId = payload.store_id;
    renderSection();
    toast("Store saved.", "success");
  });
}

/* ---------------- USERS (now includes Invite/Create via Edge Function) ---------------- */

function renderUsers(main) {
  const selected = cacheUsers.find(u => u.id === selectedUserId) || null;

  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <h2 style="margin:0">Users</h2>
          <div class="spacer"></div>
          <button id="userReload" class="btn">Reload</button>
        </div>

        <div style="height:10px"></div>

        <table class="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            ${cacheUsers.map(u => `
              <tr data-user-row="${u.id}" style="cursor:pointer">
                <td>${escapeHtml(u.full_name || "")}</td>
                <td class="mono">${escapeHtml(u.email)}</td>
                <td class="mono">${escapeHtml(u.role)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="muted small" style="margin-top:10px">
          Click a user to edit profile. Use the Invite/Create panel to onboard new employees end-to-end.
        </div>
      </div>

      <div class="card">
        <div class="row">
          <h2 style="margin:0">Invite / Create Employee</h2>
          <div class="spacer"></div>
          <span class="pill">Edge Function</span>
        </div>

        <div class="muted small" style="margin-top:6px">
          Invite = email invite flow. Create = set a temporary password now (min 8 chars).
        </div>

        <form id="inviteForm" style="margin-top:10px">
          <label>Email</label>
          <input id="inv_email" type="email" required placeholder="employee@skye.com" />

          <label>Full name</label>
          <input id="inv_name" placeholder="First Last" />

          <label>Title</label>
          <input id="inv_title" placeholder="Store Manager" />

          <label>Role</label>
          <select id="inv_role">
            ${["associate","department_lead","store_manager","admin"].map(r => `<option value="${r}">${r}</option>`).join("")}
          </select>

          <label>Store access</label>
          <div class="card" style="box-shadow:none; padding:10px">
            ${cacheStores.map(s => `
              <label class="row" style="margin:0 0 8px 0">
                <input type="checkbox" data-inv-store="${s.store_id}" style="width:auto" />
                <span class="mono">${s.store_id}</span>
                <span class="muted">— ${escapeHtml(s.store_name)}</span>
              </label>
            `).join("")}
          </div>

          <label>Mode</label>
          <select id="inv_mode">
            <option value="invite_user">Invite by email</option>
            <option value="create_user_password">Create with temp password</option>
          </select>

          <div id="pwBlock" class="hidden">
            <label>Temp password (min 8 chars)</label>
            <input id="inv_password" type="text" placeholder="TemporaryPassword123" />
          </div>

          <div class="row" style="margin-top:12px">
            <button class="btn primary" type="submit">Run</button>
            <div class="spacer"></div>
            <button id="inv_clear" class="btn" type="button">Clear</button>
          </div>
        </form>

        <div style="height:14px"></div>

        <div class="row">
          <h2 style="margin:0">Edit Existing Profile</h2>
          <div class="spacer"></div>
          <span class="pill">${selected ? "Selected" : "Pick user"}</span>
        </div>

        <form id="userForm" style="margin-top:10px">
          <label>id (Auth UUID)</label>
          <input id="user_id" disabled value="${selected?.id || ""}" />

          <label>email</label>
          <input id="user_email" value="${selected?.email || ""}" />

          <label>full_name</label>
          <input id="user_full_name" value="${selected?.full_name || ""}" />

          <label>title</label>
          <input id="user_title" value="${selected?.title || ""}" />

          <label>role</label>
          <select id="user_role">
            ${["admin","store_manager","department_lead","associate"].map(r => `
              <option value="${r}" ${(selected?.role || "associate") === r ? "selected":""}>${r}</option>
            `).join("")}
          </select>

          <div class="row" style="margin-top:12px">
            <button class="btn primary" type="submit">Save Profile</button>
          </div>
        </form>
      </div>
    </div>
  `;

  $("#userReload", main)?.addEventListener("click", async () => {
    await loadUsers();
    renderSection();
    toast("Users reloaded.", "success");
  });

  $$("tr[data-user-row]", main).forEach(tr => {
    tr.addEventListener("click", () => {
      selectedUserId = tr.getAttribute("data-user-row");
      renderSection();
    });
  });

  // Invite/Create mode toggles password field
  const modeSel = $("#inv_mode", main);
  const pwBlock = $("#pwBlock", main);
  modeSel?.addEventListener("change", () => {
    pwBlock.classList.toggle("hidden", modeSel.value !== "create_user_password");
  });

  $("#inv_clear", main)?.addEventListener("click", () => {
    $("#inv_email", main).value = "";
    $("#inv_name", main).value = "";
    $("#inv_title", main).value = "";
    $("#inv_role", main).value = "associate";
    $("#inv_mode", main).value = "invite_user";
    $("#inv_password", main).value = "";
    pwBlock.classList.add("hidden");
    $$("[data-inv-store]", main).forEach(c => c.checked = false);
  });

  $("#inviteForm", main)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const email = $("#inv_email", main).value.trim().toLowerCase();
      const full_name = $("#inv_name", main).value.trim();
      const title = $("#inv_title", main).value.trim();
      const role = $("#inv_role", main).value;
      const action = $("#inv_mode", main).value;
      const password = $("#inv_password", main).value;

      const store_ids = $$("[data-inv-store]", main)
        .filter(c => c.checked)
        .map(c => c.getAttribute("data-inv-store"));

      if (!email) return toast("Email required", "error");
      if (action === "create_user_password" && (!password || password.length < 8)) {
        return toast("Temp password must be 8+ chars", "error");
      }

      // Default tab access: keep it simple; you can tighten later.
      const tab_access = TAB_DEFS.map(t => ({
        tab_key: t.key,
        can_view: true,
        can_edit: t.key === "admin-panel" ? false : false
      }));

      const res = await callHubAdminUser({
        action,
        email,
        full_name,
        title,
        role,
        store_ids,
        tab_access,
        password: action === "create_user_password" ? password : undefined
      });

      if (!res.ok) {
        console.error(res);
        return toast(res.error || "Invite/Create failed", "error");
      }

      toast(`Success: ${res.mode} → ${res.email}`, "success");
      await loadUsers();
      renderSection();
    } catch (err) {
      console.error(err);
      toast("Invite/Create failed (see console)", "error");
    }
  });

  $("#userForm", main)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected?.id) return toast("Pick a user first", "error");

    const payload = {
      id: selected.id,
      email: $("#user_email", main).value.trim(),
      full_name: $("#user_full_name", main).value.trim(),
      title: $("#user_title", main).value.trim(),
      role: $("#user_role", main).value
    };

    const { error } = await supabase.from("hub_profiles").upsert(payload, { onConflict: "id" });
    if (error) return toast(error.message, "error");

    await loadUsers();
    selectedUserId = payload.id;
    toast("Profile saved.", "success");
    renderSection();
  });
}
/* ---------------- PERMISSIONS ---------------- */

async function renderPermissions(main) {
  const selected = cacheUsers.find(u => u.id === selectedUserId) || cacheUsers[0] || null;
  if (!selected) {
    main.innerHTML = `<div class="card">No users found in hub_profiles.</div>`;
    return;
  }
  selectedUserId = selected.id;

  const [{ data: storeAccess }, { data: tabAccess }] = await Promise.all([
    supabase.from("hub_user_store_access").select("store_id").eq("user_id", selectedUserId),
    supabase.from("hub_user_tab_access").select("tab_key, can_view, can_edit").eq("user_id", selectedUserId)
  ]);

  const userStoreIds = new Set((storeAccess || []).map(r => r.store_id));
  const tabMap = new Map((tabAccess || []).map(r => [r.tab_key, r]));

  main.innerHTML = `
    <div class="card">
      <div class="row">
        <h2 style="margin:0">Permissions</h2>
        <div class="spacer"></div>
        <div class="pill mono">${escapeHtml(selected.email)} • ${escapeHtml(selected.role)}</div>
      </div>

      <label style="margin-top:12px">Select user</label>
      <select id="permUserSelect">
        ${cacheUsers.map(u => `<option value="${u.id}" ${u.id===selectedUserId?"selected":""}>${escapeHtml(u.email)} (${escapeHtml(u.role)})</option>`).join("")}
      </select>

      <div style="height:14px"></div>

      <div class="grid2">
        <div class="card" style="box-shadow:none">
          <h2 style="margin:0 0 8px 0">Store Access</h2>

          ${cacheStores.map(s => `
            <label class="row" style="margin:0 0 8px 0">
              <input type="checkbox" data-store-access="${s.store_id}" ${userStoreIds.has(s.store_id) ? "checked":""} style="width:auto" />
              <span class="mono">${s.store_id}</span>
              <span class="muted">— ${escapeHtml(s.store_name)}</span>
            </label>
          `).join("")}

          <div class="row" style="margin-top:12px">
            <button id="saveStoreAccess" class="btn primary" type="button">Save Store Access</button>
          </div>
        </div>

        <div class="card" style="box-shadow:none">
          <h2 style="margin:0 0 8px 0">Tab Access</h2>

          <table class="table">
            <thead><tr><th>Tab</th><th>View</th><th>Edit</th></tr></thead>
            <tbody>
              ${TAB_DEFS.map(t => {
                const row = tabMap.get(t.key);
                const canView = row?.can_view ?? true;
                const canEdit = row?.can_edit ?? false;
                return `
                  <tr>
                    <td>${escapeHtml(t.label)}</td>
                    <td><input type="checkbox" data-tab-view="${t.key}" ${canView?"checked":""} style="width:auto" /></td>
                    <td><input type="checkbox" data-tab-edit="${t.key}" ${canEdit?"checked":""} style="width:auto" /></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

          <div class="row" style="margin-top:12px">
            <button id="saveTabAccess" class="btn primary" type="button">Save Tab Access</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#permUserSelect", main)?.addEventListener("change", (e) => {
    selectedUserId = e.target.value;
    renderSection();
  });

  $("#saveStoreAccess", main)?.addEventListener("click", async () => {
    const checked = $$("[data-store-access]", main)
      .filter(c => c.checked)
      .map(c => c.getAttribute("data-store-access"));

    const del = await supabase.from("hub_user_store_access").delete().eq("user_id", selectedUserId);
    if (del.error) return toast(del.error.message, "error");

    if (checked.length) {
      const ins = await supabase.from("hub_user_store_access").insert(
        checked.map(store_id => ({ user_id: selectedUserId, store_id }))
      );
      if (ins.error) return toast(ins.error.message, "error");
    }
    toast("Store access saved.", "success");
  });

  $("#saveTabAccess", main)?.addEventListener("click", async () => {
    for (const t of TAB_DEFS) {
      const can_view = !!$(`[data-tab-view="${t.key}"]`, main)?.checked;
      const can_edit = !!$(`[data-tab-edit="${t.key}"]`, main)?.checked;

      const { error } = await supabase.from("hub_user_tab_access").upsert(
        { user_id: selectedUserId, tab_key: t.key, can_view, can_edit },
        { onConflict: "user_id,tab_key" }
      );
      if (error) return toast(error.message, "error");
    }
    toast("Tab access saved.", "success");
  });
}

/* ---------------- SPECIAL DAYS ---------------- */

async function renderSpecialDays(main) {
  const { data, error } = await supabase.from("hub_calendar_events").select("*").order("event_date");
  if (error) return (main.innerHTML = `<div class="card">Failed loading hub_calendar_events</div>`);

  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <h2 style="margin:0">Special Days</h2>
          <div class="spacer"></div>
          <button id="newEvent" class="btn primary">+ New Day</button>
        </div>

        <table class="table" style="margin-top:10px">
          <thead><tr><th>Date</th><th>Name</th><th>Type</th><th>Sales x</th><th>Txn x</th></tr></thead>
          <tbody>
            ${(data||[]).map(ev => `
              <tr data-event-date="${ev.event_date}" style="cursor:pointer">
                <td class="mono">${ev.event_date}</td>
                <td>${escapeHtml(ev.name)}</td>
                <td class="mono">${escapeHtml(ev.event_type)}</td>
                <td class="mono">${ev.multiplier_sales ?? ""}</td>
                <td class="mono">${ev.multiplier_txn ?? ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2 style="margin:0">Day Profile</h2>

        <form id="eventForm" style="margin-top:10px">
          <label>event_date</label>
          <input id="event_date" type="date" required />

          <label>name</label>
          <input id="event_name" required />

          <label>event_type</label>
          <input id="event_type" required />

          <label>multiplier_sales (optional)</label>
          <input id="mult_sales" placeholder="1.15" />

          <label>multiplier_txn (optional)</label>
          <input id="mult_txn" placeholder="1.10" />

          <div class="row" style="margin-top:12px">
            <button class="btn primary" type="submit">Save Day</button>
            <button id="deleteDay" class="btn danger" type="button">Delete</button>
            <div class="spacer"></div>
            <button id="clearDay" class="btn" type="button">Clear</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const fillForm = (ev) => {
    $("#event_date", main).value = ev?.event_date || "";
    $("#event_name", main).value = ev?.name || "";
    $("#event_type", main).value = ev?.event_type || "";
    $("#mult_sales", main).value = ev?.multiplier_sales ?? "";
    $("#mult_txn", main).value = ev?.multiplier_txn ?? "";
  };

  $("#newEvent", main)?.addEventListener("click", () => fillForm(null));
  $("#clearDay", main)?.addEventListener("click", () => fillForm(null));

  $$("tr[data-event-date]", main).forEach(tr => {
    tr.addEventListener("click", () => {
      const d = tr.getAttribute("data-event-date");
      const ev = (data||[]).find(x => x.event_date === d);
      fillForm(ev);
    });
  });

  $("#eventForm", main)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      event_date: $("#event_date", main).value,
      name: $("#event_name", main).value.trim(),
      event_type: $("#event_type", main).value.trim(),
      multiplier_sales: toNumOrNull($("#mult_sales", main).value),
      multiplier_txn: toNumOrNull($("#mult_txn", main).value)
    };

    const { error } = await supabase.from("hub_calendar_events").upsert(payload, { onConflict: "event_date" });
    if (error) return toast(error.message, "error");

    toast("Special day saved.", "success");
    renderSection();
  });

  $("#deleteDay", main)?.addEventListener("click", async () => {
    const d = $("#event_date", main).value;
    if (!d) return toast("Pick a day first", "error");

    const { error } = await supabase.from("hub_calendar_events").delete().eq("event_date", d);
    if (error) return toast(error.message, "error");

    toast("Deleted.", "success");
    renderSection();
  });
}

/* ---------------- Edge Function Caller ---------------- */

async function callHubAdminUser(body) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return { ok: false, error: "No session token" };

  const url = `${window.APP_CONFIG.SUPABASE_URL}/functions/v1/hub-admin-user`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, ...out, status: res.status };
  return out;
}

/* ---------------- Helpers ---------------- */

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function toNumOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
