// public/js/pages/admin_panel.js
// Admin Panel (Profiles): Users, Stores (list + modal profile editor)

import { escapeHtml } from "../utils.js";

// ---------- tiny UI helpers ----------
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function money(n) {
  if (n == null || n === "") return "";
  const x = Number(n);
  if (Number.isNaN(x)) return "";
  return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function ym(d) {
  // expects Date or yyyy-mm-01 string
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function openModal({ title, bodyNode, footerNode }) {
  // Uses your existing .modal/.modal-card styles (already in your CSS from prior work).
  const overlay = el(`
    <div class="modal">
      <div class="modal-card" style="max-width: 900px;">
        <div class="modal-head">
          <div class="modal-title"></div>
          <button class="btn btn-sm btn-ghost" data-x>✕</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>
    </div>
  `);
  overlay.querySelector(".modal-title").textContent = title || "Profile";
  overlay.querySelector(".modal-body").appendChild(bodyNode);
  overlay.querySelector(".modal-foot").appendChild(footerNode);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("[data-x]").addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  return { close, overlay };
}

function pill(text, tone = "muted") {
  const cls =
    tone === "green"
      ? "pill pill-green"
      : tone === "red"
      ? "pill pill-red"
      : tone === "blue"
      ? "pill pill-blue"
      : "pill";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

// ---------- data helpers ----------
async function fetchStores(supabase) {
  const { data, error } = await supabase
    .from("hub_stores")
    .select("store_id, store_name, eagle_number, timezone, is_active, created_at, updated_at")
    .order("store_id", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchUsers(supabase) {
  // hub_profiles + hub_user_store_access (client-side join)
  const { data: profiles, error: pErr } = await supabase
    .from("hub_profiles")
    .select("id, email, full_name, title, role, created_at, updated_at")
    .order("email", { ascending: true });
  if (pErr) throw pErr;

  const { data: access, error: aErr } = await supabase
    .from("hub_user_store_access")
    .select("user_id, store_id")
    .order("store_id", { ascending: true });
  if (aErr) throw aErr;

  const byUser = new Map();
  (access || []).forEach((r) => {
    const arr = byUser.get(r.user_id) || [];
    arr.push(r.store_id);
    byUser.set(r.user_id, arr);
  });

  return (profiles || []).map((u) => ({
    ...u,
    store_ids: byUser.get(u.id) || [],
  }));
}

// ---------- profile modals ----------
function storeProfileModal({ supabase, onSaved, initial }) {
  const v = initial || {
    store_id: "",
    store_name: "",
    eagle_number: "",
    timezone: "America/Los_Angeles",
    is_active: true,
  };

  const body = el(`
    <div class="grid grid-2" style="gap: 12px;">
      <div class="field">
        <label>Store ID</label>
        <input class="input" name="store_id" placeholder="18228" />
        <div class="hint">Primary key for hub_stores (text). Example: 18228</div>
      </div>
      <div class="field">
        <label>Store Name</label>
        <input class="input" name="store_name" placeholder="Tropicana" />
      </div>

      <div class="field">
        <label>Eagle Number</label>
        <input class="input" name="eagle_number" placeholder="1" />
        <div class="hint">Your mapping: 18228→1, 18507→2, 18690→3, 19117→4</div>
      </div>
      <div class="field">
        <label>Timezone</label>
        <input class="input" name="timezone" placeholder="America/Los_Angeles" />
      </div>

      <div class="field" style="grid-column: 1 / -1;">
        <label class="row" style="gap:10px; align-items:center;">
          <input type="checkbox" name="is_active" />
          Active
        </label>
      </div>

      <div class="field" style="grid-column: 1 / -1;">
        <div class="hint">
          Saving uses your Edge Function <code>admin_upsert_store</code>.
          If you get 401, it means the request isn’t carrying your logged-in JWT (you must be signed in).
        </div>
      </div>
    </div>
  `);

  body.querySelector(`[name="store_id"]`).value = v.store_id || "";
  body.querySelector(`[name="store_name"]`).value = v.store_name || "";
  body.querySelector(`[name="eagle_number"]`).value = v.eagle_number || "";
  body.querySelector(`[name="timezone"]`).value = v.timezone || "America/Los_Angeles";
  body.querySelector(`[name="is_active"]`).checked = !!v.is_active;

  const footer = el(`
    <div class="row" style="justify-content:space-between; gap:10px;">
      <div class="muted" data-msg></div>
      <div class="row" style="gap:10px;">
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>Save Store</button>
      </div>
    </div>
  `);

  const msg = footer.querySelector("[data-msg]");
  const modal = openModal({ title: v.store_id ? `Store: ${v.store_id}` : "Add Store", bodyNode: body, footerNode: footer });

  footer.querySelector("[data-cancel]").addEventListener("click", () => modal.close());

  footer.querySelector("[data-save]").addEventListener("click", async () => {
    msg.textContent = "";
    const payload = {
      store_id: body.querySelector(`[name="store_id"]`).value.trim(),
      store_name: body.querySelector(`[name="store_name"]`).value.trim(),
      eagle_number: body.querySelector(`[name="eagle_number"]`).value.trim(),
      timezone: body.querySelector(`[name="timezone"]`).value.trim() || "America/Los_Angeles",
      is_active: body.querySelector(`[name="is_active"]`).checked,
    };

    if (!payload.store_id || !payload.store_name || !payload.eagle_number) {
      msg.textContent = "Store ID, Store Name, and Eagle Number are required.";
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("admin_upsert_store", { body: payload });
      if (error) throw error;
      msg.textContent = "Saved.";
      setTimeout(() => modal.close(), 250);
      onSaved && onSaved(data);
    } catch (e) {
      console.error(e);
      msg.textContent = e?.message || String(e);
    }
  });
}

function userProfileModal({ supabase, onSaved, initial, storeOptions, siteUrl }) {
  const v = initial || {
    email: "",
    full_name: "",
    title: "",
    role: "associate",
    store_ids: [],
    send_invite: true,
  };

  const storeChecks = (storeOptions || [])
    .map((s) => {
      const checked = (v.store_ids || []).includes(s.store_id) ? "checked" : "";
      return `
        <label class="row" style="gap:8px; align-items:center; margin:6px 0;">
          <input type="checkbox" name="store_id" value="${escapeHtml(s.store_id)}" ${checked} />
          <span><b>${escapeHtml(s.store_id)}</b> — ${escapeHtml(s.store_name)} (${escapeHtml(s.eagle_number)})</span>
        </label>`;
    })
    .join("");

  const body = el(`
    <div class="grid grid-2" style="gap: 12px;">
      <div class="field">
        <label>Email</label>
        <input class="input" name="email" placeholder="name@skyebridge.com" />
      </div>
      <div class="field">
        <label>Role</label>
        <select class="input" name="role">
          <option value="associate">associate</option>
          <option value="manager">manager</option>
          <option value="admin">admin</option>
        </select>
      </div>

      <div class="field">
        <label>Full Name</label>
        <input class="input" name="full_name" placeholder="Nick Nelson" />
      </div>
      <div class="field">
        <label>Title</label>
        <input class="input" name="title" placeholder="Store Manager" />
      </div>

      <div class="field" style="grid-column: 1 / -1;">
        <label>Store Access</label>
        <div class="card" style="padding:10px; max-height: 220px; overflow:auto;">
          ${storeChecks || `<div class="muted">No stores found. Add stores first.</div>`}
        </div>
      </div>

      <div class="field" style="grid-column: 1 / -1;">
        <label class="row" style="gap:10px; align-items:center;">
          <input type="checkbox" name="send_invite" />
          Send invite email (for new users) / resend invite (for existing)
        </label>
        <div class="hint">
          Saving uses Edge Function <code>admin_upsert_user</code>. The invite email should land them on your site URL.
        </div>
      </div>
    </div>
  `);

  body.querySelector(`[name="email"]`).value = v.email || "";
  body.querySelector(`[name="full_name"]`).value = v.full_name || "";
  body.querySelector(`[name="title"]`).value = v.title || "";
  body.querySelector(`[name="role"]`).value = v.role || "associate";
  body.querySelector(`[name="send_invite"]`).checked = v.send_invite !== false;

  const footer = el(`
    <div class="row" style="justify-content:space-between; gap:10px;">
      <div class="row" style="gap:10px;">
        <button class="btn btn-ghost" data-resetpw>Send Password Reset</button>
      </div>
      <div class="row" style="gap:10px; align-items:center;">
        <div class="muted" data-msg style="max-width: 420px;"></div>
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>Save User</button>
      </div>
    </div>
  `);

  const msg = footer.querySelector("[data-msg]");
  const modal = openModal({ title: v.email ? `User: ${v.email}` : "Add User", bodyNode: body, footerNode: footer });

  footer.querySelector("[data-cancel]").addEventListener("click", () => modal.close());

  footer.querySelector("[data-resetpw]").addEventListener("click", async () => {
    msg.textContent = "";
    const email = body.querySelector(`[name="email"]`).value.trim();
    if (!email) {
      msg.textContent = "Enter an email first.";
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: siteUrl || window.location.origin,
      });
      if (error) throw error;
      msg.textContent = "Password reset email sent.";
    } catch (e) {
      console.error(e);
      msg.textContent = e?.message || String(e);
    }
  });

  footer.querySelector("[data-save]").addEventListener("click", async () => {
    msg.textContent = "";
    const email = body.querySelector(`[name="email"]`).value.trim();
    const full_name = body.querySelector(`[name="full_name"]`).value.trim();
    const title = body.querySelector(`[name="title"]`).value.trim();
    const role = body.querySelector(`[name="role"]`).value;

    const store_ids = Array.from(body.querySelectorAll(`input[name="store_id"]:checked`)).map((x) => x.value);

    const send_invite = body.querySelector(`[name="send_invite"]`).checked;

    if (!email) {
      msg.textContent = "Email is required.";
      return;
    }

    const payload = {
      email,
      full_name,
      title,
      role,
      store_ids,
      send_invite,
      redirect_to: siteUrl || window.location.origin,
    };

    try {
      const { data, error } = await supabase.functions.invoke("admin_upsert_user", { body: payload });
      if (error) throw error;
      msg.textContent = send_invite ? "Saved + invite sent (or resent)." : "Saved.";
      setTimeout(() => modal.close(), 250);
      onSaved && onSaved(data);
    } catch (e) {
      console.error(e);
      msg.textContent = e?.message || String(e);
    }
  });
}

// ---------- main page renderer ----------
export async function renderAdminPanel(ctx) {
  const { supabase, scope } = ctx;

  const root = el(`
    <div class="panel">
      <div class="row" style="justify-content:space-between; align-items:center; gap:12px;">
        <div>
          <div class="h1">Admin Panel</div>
          <div class="muted">Manage profiles: Stores, Users, Permissions (stores ↔ users)</div>
        </div>
        <div class="row" style="gap:10px;">
          <button class="btn btn-ghost" data-refresh>Refresh</button>
        </div>
      </div>

      <div class="row" style="gap:10px; margin-top:12px;">
        <button class="btn btn-tab active" data-tab="users">Users</button>
        <button class="btn btn-tab" data-tab="stores">Stores</button>
        <button class="btn btn-tab" data-tab="permissions">Permissions</button>
      </div>

      <div class="card" style="margin-top:12px; padding:12px;">
        <div class="row" style="justify-content:space-between; align-items:center; gap:12px;">
          <div class="row" style="gap:10px; align-items:center;">
            <input class="input" style="min-width:280px;" data-search placeholder="Search..." />
          </div>
          <div class="row" style="gap:10px;">
            <button class="btn btn-primary" data-add>Add</button>
          </div>
        </div>

        <div style="margin-top:12px;" data-body>
          <div class="muted">Loading…</div>
        </div>
      </div>
    </div>
  `);

  if (!scope?.isAdmin) {
    root.querySelector("[data-body]").innerHTML = `<div class="muted">You do not have admin access.</div>`;
    return root;
  }

  let activeTab = "users";
  let users = [];
  let stores = [];

  const body = root.querySelector("[data-body]");
  const search = root.querySelector("[data-search]");
  const addBtn = root.querySelector("[data-add]");

  function setTab(tab) {
    activeTab = tab;
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    render();
  }

  function filtered(list) {
    const q = (search.value || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
  }

  function renderUsers() {
    const rows = filtered(users);
    const html = `
      <div class="muted" style="margin-bottom:8px;">Users: ${rows.length}</div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Title</th>
              <th>Role</th>
              <th>Stores</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map((u) => {
                      const storesTxt = (u.store_ids || []).join(", ");
                      return `
                        <tr data-user="${escapeHtml(u.id)}" class="row-click">
                          <td><b>${escapeHtml(u.email || "")}</b></td>
                          <td>${escapeHtml(u.full_name || "")}</td>
                          <td>${escapeHtml(u.title || "")}</td>
                          <td>${pill(u.role || "associate", u.role === "admin" ? "green" : u.role === "manager" ? "blue" : "muted")}</td>
                          <td>${escapeHtml(storesTxt)}</td>
                        </tr>
                      `;
                    })
                    .join("")
                : `<tr><td colspan="5" class="muted">No users found.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
    body.innerHTML = html;

    body.querySelectorAll("tr[data-user]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const id = tr.dataset.user;
        const u = users.find((x) => x.id === id);
        userProfileModal({
          supabase,
          initial: {
            email: u.email,
            full_name: u.full_name,
            title: u.title,
            role: u.role,
            store_ids: u.store_ids || [],
            send_invite: false,
          },
          storeOptions: stores,
          siteUrl: window.location.origin,
          onSaved: async () => await reload(),
        });
      });
    });
  }

  function renderStores() {
    const rows = filtered(stores);
    const html = `
      <div class="muted" style="margin-bottom:8px;">Stores: ${rows.length}</div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Store ID</th>
              <th>Name</th>
              <th>Eagle #</th>
              <th>Timezone</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map((s) => {
                      return `
                        <tr data-store="${escapeHtml(s.store_id)}" class="row-click">
                          <td><b>${escapeHtml(s.store_id)}</b></td>
                          <td>${escapeHtml(s.store_name || "")}</td>
                          <td>${escapeHtml(s.eagle_number || "")}</td>
                          <td>${escapeHtml(s.timezone || "")}</td>
                          <td>${s.is_active ? pill("active", "green") : pill("inactive", "red")}</td>
                        </tr>
                      `;
                    })
                    .join("")
                : `<tr><td colspan="5" class="muted">No stores found.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
    body.innerHTML = html;

    body.querySelectorAll("tr[data-store]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const store_id = tr.dataset.store;
        const s = stores.find((x) => x.store_id === store_id);
        storeProfileModal({
          supabase,
          initial: s,
          onSaved: async () => await reload(),
        });
      });
    });
  }

  function renderPermissions() {
    // Simple view for now: “who can see which stores”
    const rows = users
      .map((u) => ({
        email: u.email,
        role: u.role,
        stores: (u.store_ids || []).join(", "),
      }))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

    const html = `
      <div class="muted" style="margin-bottom:8px;">
        Permissions view (editable via the User profile modal).
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Store Access</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (r) => `
                      <tr>
                        <td><b>${escapeHtml(r.email || "")}</b></td>
                        <td>${escapeHtml(r.role || "")}</td>
                        <td>${escapeHtml(r.stores || "")}</td>
                      </tr>`
                    )
                    .join("")
                : `<tr><td colspan="3" class="muted">No users found.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
    body.innerHTML = html;
  }

  function render() {
    addBtn.textContent = activeTab === "stores" ? "Add Store" : activeTab === "users" ? "Add User" : "Add (via Users)";

    if (activeTab === "users") return renderUsers();
    if (activeTab === "stores") return renderStores();
    return renderPermissions();
  }

  async function reload() {
    body.innerHTML = `<div class="muted">Loading…</div>`;
    stores = await fetchStores(supabase);
    users = await fetchUsers(supabase);
    render();
  }

  // Events
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  root.querySelector("[data-refresh]").addEventListener("click", reload);
  search.addEventListener("input", () => render());

  addBtn.addEventListener("click", () => {
    if (activeTab === "stores") {
      storeProfileModal({
        supabase,
        initial: null,
        onSaved: async () => await reload(),
      });
      return;
    }
    if (activeTab === "users") {
      userProfileModal({
        supabase,
        initial: null,
        storeOptions: stores,
        siteUrl: window.location.origin,
        onSaved: async () => await reload(),
      });
      return;
    }
    // permissions tab: route to users
    setTab("users");
  });

  await reload();
  return root;
}
