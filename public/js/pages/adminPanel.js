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
  // Soft guard: if user isn't admin, show message.
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

/* ---------------- STORES (Profile editor) ---------------- */

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

          <label>eagle_number (your mapping: 18228->1 etc)</label>
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

          <div class="muted small" style="margin-top:10px">
            Note: store_id is the primary key; it must match what you use everywhere else.
          </div>
        </form>
      </div>
    </div>
  `;

  // events
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
    if (error) {
      console.error(error);
      toast(error.message, "error");
      return;
    }

    await loadStores();
    selectedStoreId = payload.store_id;
    renderSection();
    toast("Store saved.", "success");
  });
}

/* ---------------- USERS (Profile editor) ---------------- */

function renderUsers(main) {
  const selected = cacheUsers.find(u => u.id === selectedUserId) || null;

  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <h2 style="margin:0">Users</h2>
          <div class="spacer"></div>
          <button id="newUser" class="btn primary">+ New User Profile</button>
        </div>

        <div style="height:10px"></div>

        <table class="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th></tr>
          </thead>
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
          “New User Profile” requires the Auth User UUID (Supabase Auth → Users).
          We’ll add a proper invite Edge Function next.
        </div>
      </div>

      <div class="card">
        <div class="row">
          <h2 style="margin:0">User Profile</h2>
          <div class="spacer"></div>
          <span class="pill">${selected ? "Edit" : "Create"}</span>
        </div>

        <form id="userForm">
          <label>id (Auth user UUID)</label>
          <input id="user_id" ${selected ? "disabled" : ""} value="${selected?.id || ""}" placeholder="uuid from Auth → Users" />

          <label>email</label>
          <input id="user_email" value="${selected?.email || ""}" placeholder="user@company.com" />

          <label>full_name</label>
          <input id="user_full_name" value="${selected?.full_name || ""}" placeholder="First Last" />

          <label>title</label>
          <input id="user_title" value="${selected?.title || ""}" placeholder="Store Manager" />

          <label>role</label>
          <select id="user_role">
            ${["admin","store_manager","department_lead","associate"].map(r => `
              <option value="${r}" ${(selected?.role || "associate") === r ? "selected":""}>${r}</option>
            `).join("")}
          </select>

          <div class="row" style="margin-top:12px">
            <button class="btn primary" type="submit">Save User</button>
            <div class="spacer"></div>
            <button id="userReload" class="btn" type="button">Reload</button>
          </div>
        </form>
      </div>
    </div>
  `;

  $("#newUser", main)?.addEventListener("click", () => {
    selectedUserId = null;
    renderSection();
  });

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

  $("#userForm", main)?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      id: $("#user_id", main).value.trim(),
      email: $("#user_email", main).value.trim(),
      full_name: $("#user_full_name", main).value.trim(),
      title: $("#user_title", main).value.trim(),
      role: $("#user_role", main).value
    };

    if (!payload.id) return toast("User id (UUID) is required", "error");
    if (!payload.email) return toast("Email is required", "error");

    const { error } = await supabase.from("hub_profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error(error);
      toast(error.message, "error");
      return;
    }

    await loadUsers();
    selectedUserId = payload.id;
    renderSection();
    toast("User saved.", "success");
  });
}

/* ---------------- PERMISSIONS (Store + Tab access) ---------------- */

async function renderPermissions(main) {
  const selected = cacheUsers.find(u => u.id === selectedUserId) || cacheUsers[0] || null;
  if (!selected && cacheUsers.length === 0) {
    main.innerHTML = `<div class="card">No users found in hub_profiles.</div>`;
    return;
  }

  selectedUserId = selected?.id;

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

      <div style="height:10px"></div>

      <label>Select user</label>
      <select id="permUserSelect">
        ${cacheUsers.map(u => `<option value="${u.id}" ${u.id===selectedUserId?"selected":""}>${escapeHtml(u.email)} (${escapeHtml(u.role)})</option>`).join("")}
      </select>

      <div style="height:14px"></div>

      <div class="grid2">
        <div class="card" style="box-shadow:none">
          <h2 style="margin:0 0 8px 0">Store Access</h2>
          <div class="muted small">Controls store scoping for views/actions.</div>
          <div style="height:10px"></div>

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
          <div class="muted small">Optional overrides per user (view/edit).</div>
          <div style="height:10px"></div>

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

    // Replace strategy: delete then insert
    const del = await supabase.from("hub_user_store_access").delete().eq("user_id", selectedUserId);
    if (del.error) {
      console.error(del.error);
      toast(del.error.message, "error");
      return;
    }

    if (checked.length) {
      const ins = await supabase.from("hub_user_store_access").insert(
        checked.map(store_id => ({ user_id: selectedUserId, store_id }))
      );
      if (ins.error) {
        console.error(ins.error);
        toast(ins.error.message, "error");
        return;
      }
    }

    toast("Store access saved.", "success");
  });

  $("#saveTabAccess", main)?.addEventListener("click", async () => {
    const rows = TAB_DEFS.map(t => {
      const can_view = !!$(`[data-tab-view="${t.key}"]`, main)?.checked;
      const can_edit = !!$(`[data-tab-edit="${t.key}"]`, main)?.checked;
      return { user_id: selectedUserId, tab_key: t.key, can_view, can_edit };
    });

    // upsert each row (simple + reliable)
    for (const r of rows) {
      const { error } = await supabase.from("hub_user_tab_access").upsert(r, { onConflict: "user_id,tab_key" });
      if (error) {
        console.error(error);
        toast(error.message, "error");
        return;
      }
    }
    toast("Tab access saved.", "success");
  });
}

/* ---------------- SPECIAL DAYS (hub_calendar_events) ---------------- */

async function renderSpecialDays(main) {
  const { data, error } = await supabase
    .from("hub_calendar_events")
    .select("*")
    .order("event_date");

  if (error) {
    console.error(error);
    main.innerHTML = `<div class="card">Failed loading hub_calendar_events</div>`;
    return;
  }

  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="row">
          <h2 style="margin:0">Special Days</h2>
          <div class="spacer"></div>
          <button id="newEvent" class="btn primary">+ New Day</button>
        </div>

        <div class="muted small" style="margin-top:8px">
          This is where we’ll add “override weighting” days later (sales/txn multipliers).
        </div>

        <div style="height:10px"></div>

        <table class="table">
          <thead>
            <tr><th>Date</th><th>Name</th><th>Type</th><th>Sales x</th><th>Txn x</th></tr>
          </thead>
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
        <div class="row">
          <h2 style="margin:0">Day Profile</h2>
          <div class="spacer"></div>
          <span class="pill">Add/Edit</span>
        </div>

        <form id="eventForm">
          <label>event_date</label>
          <input id="event_date" type="date" required />

          <label>name</label>
          <input id="event_name" required placeholder="Christmas Eve / Black Friday / etc" />

          <label>event_type</label>
          <input id="event_type" required placeholder="holiday / promo / weather / etc" />

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

  function fillForm(ev) {
    $("#event_date", main).value = ev?.event_date || "";
    $("#event_name", main).value = ev?.name || "";
    $("#event_type", main).value = ev?.event_type || "";
    $("#mult_sales", main).value = ev?.multiplier_sales ?? "";
    $("#mult_txn", main).value = ev?.multiplier_txn ?? "";
  }

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

    if (!payload.event_date) return toast("event_date required", "error");
    if (!payload.name) return toast("name required", "error");
    if (!payload.event_type) return toast("event_type required", "error");

    const { error } = await supabase.from("hub_calendar_events").upsert(payload, { onConflict: "event_date" });
    if (error) {
      console.error(error);
      toast(error.message, "error");
      return;
    }

    toast("Special day saved.", "success");
    renderSection();
  });

  $("#deleteDay", main)?.addEventListener("click", async () => {
    const d = $("#event_date", main).value;
    if (!d) return toast("Pick a day first", "error");

    const { error } = await supabase.from("hub_calendar_events").delete().eq("event_date", d);
    if (error) {
      console.error(error);
      toast(error.message, "error");
      return;
    }
    toast("Deleted.", "success");
    renderSection();
  });
}

/* ---------------- Helpers ---------------- */

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toNumOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
