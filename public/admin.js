
/* global window */
window.HubAdmin = (function () {
  const htmlEscape = (s) => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    });
    children.forEach(c => n.appendChild(c));
    return n;
  }

  function banner(host, msg, type = "error") {
    const b = host.querySelector(".local-banner");
    if (!msg) { b.classList.add("hidden"); b.textContent=""; return; }
    b.textContent = msg;
    b.classList.remove("hidden");
    b.classList.toggle("banner-error", type === "error");
    b.classList.toggle("banner-ok", type === "ok");
  }

  const TAB_KEYS = [
    "dashboard","goals-admin","insights","admin","feed","tasks","walks","marketing"
  ];

  async function init(host, ctx) {
    host.innerHTML = `
      <div class="banner local-banner banner-error hidden"></div>

      <div class="subnav">
        <button class="subnav-btn active" data-sub="stores">Stores</button>
        <button class="subnav-btn" data-sub="employees">Employees</button>
        <button class="subnav-btn" data-sub="store-access">Store Access</button>
        <button class="subnav-btn" data-sub="tab-access">Tab Access</button>
      </div>

      <section id="admin-stores" class="card"></section>
      <section id="admin-employees" class="card hidden"></section>
      <section id="admin-store-access" class="card hidden"></section>
      <section id="admin-tab-access" class="card hidden"></section>
    `;

    const viewEls = {
      stores: host.querySelector("#admin-stores"),
      employees: host.querySelector("#admin-employees"),
      "store-access": host.querySelector("#admin-store-access"),
      "tab-access": host.querySelector("#admin-tab-access"),
    };

    host.querySelectorAll(".subnav-btn").forEach((b) => {
      b.addEventListener("click", () => {
        host.querySelectorAll(".subnav-btn").forEach(x => x.classList.toggle("active", x === b));
        Object.entries(viewEls).forEach(([k, v]) => v.classList.toggle("hidden", k !== b.dataset.sub));
      });
    });

    await renderStores(viewEls.stores, host, ctx);
    await renderEmployees(viewEls.employees, host, ctx);
    await renderStoreAccess(viewEls["store-access"], host, ctx);
    await renderTabAccess(viewEls["tab-access"], host, ctx);
  }

  // ---------------- STORES ----------------
  async function renderStores(panel, root, ctx) {
    panel.innerHTML = `
      <div class="card-header">
        <h2>Stores</h2>
        <button class="btn-primary" id="btn-add-store" type="button">Add Store</button>
      </div>
      <div class="card-body">
        <div id="stores-table" class="table-wrap"></div>
      </div>
    `;

    panel.querySelector("#btn-add-store").addEventListener("click", async () => {
      const store_id = prompt("Store ID (e.g. 18228):");
      if (!store_id) return;

      const store_name = prompt("Store name (e.g. Tropicana):") || "";
      const eagle_number = prompt("Eagle number (1/2/3/4):") || "";
      const timezone = prompt("Timezone (default America/Los_Angeles):") || "America/Los_Angeles";

      const { error } = await ctx.supabase.from("hub_stores").insert([{
        store_id: String(store_id).trim(),
        store_name: store_name.trim(),
        eagle_number: String(eagle_number).trim(),
        timezone: timezone.trim(),
        is_active: true
      }]);

      if (error) return banner(root, error.message);
      banner(root, "Store added.", "ok");
      await loadStoresTable(panel, root, ctx);
    });

    await loadStoresTable(panel, root, ctx);
  }

  async function loadStoresTable(panel, root, ctx) {
    const wrap = panel.querySelector("#stores-table");
    wrap.innerHTML = "Loading…";

    const { data, error } = await ctx.supabase
      .from("hub_stores")
      .select("*")
      .order("store_id", { ascending: true });

    if (error) {
      wrap.innerHTML = "";
      return banner(root, error.message);
    }

    const rows = (data || []).map(s => `
      <tr>
        <td><code>${htmlEscape(s.store_id)}</code></td>
        <td>${htmlEscape(s.store_name)}</td>
        <td>${htmlEscape(s.eagle_number)}</td>
        <td>${htmlEscape(s.timezone)}</td>
        <td>${s.is_active ? "✅" : "—"}</td>
        <td class="actions">
          <button class="btn-secondary btn-sm" data-act="edit" data-id="${htmlEscape(s.store_id)}">Edit</button>
          <button class="btn-secondary btn-sm" data-act="toggle" data-id="${htmlEscape(s.store_id)}">${s.is_active ? "Deactivate" : "Activate"}</button>
        </td>
      </tr>
    `).join("");

    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Store ID</th><th>Name</th><th>Eagle #</th><th>Timezone</th><th>Active</th><th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">No stores found.</td></tr>`}</tbody>
      </table>
    `;

    wrap.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;

        if (act === "edit") {
          const store_name = prompt("Store name:", "") ?? null;
          if (store_name === null) return;
          const eagle_number = prompt("Eagle number:", "") ?? null;
          if (eagle_number === null) return;
          const timezone = prompt("Timezone:", "America/Los_Angeles") ?? null;
          if (timezone === null) return;

          const { error } = await ctx.supabase
            .from("hub_stores")
            .update({
              store_name: store_name.trim(),
              eagle_number: String(eagle_number).trim(),
              timezone: timezone.trim()
            })
            .eq("store_id", id);

          if (error) return banner(root, error.message);
          banner(root, "Store updated.", "ok");
          await loadStoresTable(panel, root, ctx);
        }

        if (act === "toggle") {
          const { data: row, error: getErr } = await ctx.supabase
            .from("hub_stores")
            .select("is_active")
            .eq("store_id", id)
            .limit(1);

          if (getErr) return banner(root, getErr.message);
          const is_active = !!(row?.[0]?.is_active);

          const { error } = await ctx.supabase
            .from("hub_stores")
            .update({ is_active: !is_active })
            .eq("store_id", id);

          if (error) return banner(root, error.message);
          banner(root, "Store status updated.", "ok");
          await loadStoresTable(panel, root, ctx);
        }
      });
    });
  }

  // ---------------- EMPLOYEES ----------------
  async function renderEmployees(panel, root, ctx) {
    panel.innerHTML = `
      <div class="card-header">
        <h2>Employees</h2>
        <button class="btn-primary" id="btn-add-emp" type="button">Add Employee</button>
      </div>
      <div class="card-body">
        <div class="muted small">Note: Auth users must exist in Supabase Auth. Profiles are managed here.</div>
        <div id="employees-table" class="table-wrap"></div>
      </div>
    `;

    panel.querySelector("#btn-add-emp").addEventListener("click", async () => {
      const id = prompt("Auth User UUID (from Supabase Auth users):");
      if (!id) return;

      const email = prompt("Email:") || "";
      const full_name = prompt("Full name:") || "";
      const title = prompt("Title:") || "";
      const role = prompt("Role (admin/store_manager/department_lead/associate):", "associate") || "associate";

      const { error } = await ctx.supabase.from("hub_profiles").insert([{
        id: id.trim(),
        email: email.trim(),
        full_name: full_name.trim(),
        title: title.trim(),
        role: role.trim()
      }]);

      if (error) return banner(root, error.message);
      banner(root, "Employee profile created.", "ok");
      await loadEmployeesTable(panel, root, ctx);
    });

    await loadEmployeesTable(panel, root, ctx);
  }

  async function loadEmployeesTable(panel, root, ctx) {
    const wrap = panel.querySelector("#employees-table");
    wrap.innerHTML = "Loading…";

    const { data, error } = await ctx.supabase
      .from("hub_profiles")
      .select("id,email,full_name,title,role,created_at,updated_at")
      .order("email", { ascending: true });

    if (error) {
      wrap.innerHTML = "";
      return banner(root, error.message);
    }

    const rows = (data || []).map(p => `
      <tr>
        <td><code>${htmlEscape(p.id)}</code></td>
        <td>${htmlEscape(p.email)}</td>
        <td>${htmlEscape(p.full_name || "")}</td>
        <td>${htmlEscape(p.title || "")}</td>
        <td><span class="pill">${htmlEscape(p.role)}</span></td>
        <td class="actions">
          <button class="btn-secondary btn-sm" data-act="edit" data-id="${htmlEscape(p.id)}">Edit</button>
        </td>
      </tr>
    `).join("");

    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>User ID</th><th>Email</th><th>Name</th><th>Title</th><th>Role</th><th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">No employees found.</td></tr>`}</tbody>
      </table>
    `;

    wrap.querySelectorAll("button[data-act='edit']").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const full_name = prompt("Full name:", "") ?? null;
        if (full_name === null) return;
        const title = prompt("Title:", "") ?? null;
        if (title === null) return;
        const role = prompt("Role (admin/store_manager/department_lead/associate):", "associate") ?? null;
        if (role === null) return;

        const { error } = await ctx.supabase
          .from("hub_profiles")
          .update({ full_name: full_name.trim(), title: title.trim(), role: role.trim() })
          .eq("id", id);

        if (error) return banner(root, error.message);
        banner(root, "Employee updated.", "ok");
        await loadEmployeesTable(panel, root, ctx);
      });
    });
  }

  // ---------------- STORE ACCESS ----------------
  async function renderStoreAccess(panel, root, ctx) {
    panel.innerHTML = `
      <div class="card-header">
        <h2>Store Access</h2>
      </div>
      <div class="card-body">
        <div class="grid-2">
          <div>
            <label class="field">
              <span>User</span>
              <select id="sa-user"></select>
            </label>
            <label class="field">
              <span>Store</span>
              <select id="sa-store"></select>
            </label>
            <button class="btn-primary" id="sa-add" type="button">Grant Access</button>
          </div>
          <div>
            <div class="muted small">Current access</div>
            <div id="sa-list" class="table-wrap"></div>
          </div>
        </div>
      </div>
    `;

    await loadStoreAccessUI(panel, root, ctx);
  }

  async function loadStoreAccessUI(panel, root, ctx) {
    const userSel = panel.querySelector("#sa-user");
    const storeSel = panel.querySelector("#sa-store");
    const listWrap = panel.querySelector("#sa-list");

    const [usersRes, storesRes] = await Promise.all([
      ctx.supabase.from("hub_profiles").select("id,email,full_name,role").order("email"),
      ctx.supabase.from("hub_stores").select("store_id,store_name").order("store_id"),
    ]);

    if (usersRes.error) return banner(root, usersRes.error.message);
    if (storesRes.error) return banner(root, storesRes.error.message);

    userSel.innerHTML = (usersRes.data || []).map(u => {
      const name = u.full_name ? ` — ${u.full_name}` : "";
      return `<option value="${htmlEscape(u.id)}">${htmlEscape(u.email)}${htmlEscape(name)} (${htmlEscape(u.role)})</option>`;
    }).join("");

    storeSel.innerHTML = (storesRes.data || []).map(s => {
      return `<option value="${htmlEscape(s.store_id)}">${htmlEscape(s.store_id)} — ${htmlEscape(s.store_name)}</option>`;
    }).join("");

    async function refreshList() {
      const user_id = userSel.value;
      listWrap.innerHTML = "Loading…";
      const { data, error } = await ctx.supabase
        .from("hub_user_store_access")
        .select("store_id, created_at")
        .eq("user_id", user_id)
        .order("store_id");

      if (error) return banner(root, error.message);

      const rows = (data || []).map(r => `
        <tr>
          <td><code>${htmlEscape(r.store_id)}</code></td>
          <td class="actions">
            <button class="btn-secondary btn-sm" data-act="revoke" data-store="${htmlEscape(r.store_id)}">Revoke</button>
          </td>
        </tr>
      `).join("");

      listWrap.innerHTML = `
        <table class="table">
          <thead><tr><th>Store</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="2" class="muted">No store access.</td></tr>`}</tbody>
        </table>
      `;

      listWrap.querySelectorAll("button[data-act='revoke']").forEach(btn => {
        btn.addEventListener("click", async () => {
          const store_id = btn.dataset.store;
          const { error } = await ctx.supabase
            .from("hub_user_store_access")
            .delete()
            .eq("user_id", user_id)
            .eq("store_id", store_id);

          if (error) return banner(root, error.message);
          banner(root, "Access revoked.", "ok");
          await refreshList();
        });
      });
    }

    panel.querySelector("#sa-add").addEventListener("click", async () => {
      const user_id = userSel.value;
      const store_id = storeSel.value;

      const { error } = await ctx.supabase.from("hub_user_store_access").insert([{
        user_id, store_id
      }]);

      if (error) return banner(root, error.message);
      banner(root, "Access granted.", "ok");
      await refreshList();
    });

    userSel.addEventListener("change", refreshList);
    await refreshList();
  }

  // ---------------- TAB ACCESS ----------------
  async function renderTabAccess(panel, root, ctx) {
    panel.innerHTML = `
      <div class="card-header">
        <h2>Tab Access</h2>
      </div>
      <div class="card-body">
        <label class="field">
          <span>User</span>
          <select id="ta-user"></select>
        </label>
        <div id="ta-grid" class="table-wrap"></div>
      </div>
    `;

    const userSel = panel.querySelector("#ta-user");
    const grid = panel.querySelector("#ta-grid");

    const usersRes = await ctx.supabase.from("hub_profiles").select("id,email,full_name,role").order("email");
    if (usersRes.error) return banner(root, usersRes.error.message);

    userSel.innerHTML = (usersRes.data || []).map(u => {
      const name = u.full_name ? ` — ${u.full_name}` : "";
      return `<option value="${htmlEscape(u.id)}">${htmlEscape(u.email)}${htmlEscape(name)} (${htmlEscape(u.role)})</option>`;
    }).join("");

    async function refresh() {
      const user_id = userSel.value;
      grid.innerHTML = "Loading…";

      const res = await ctx.supabase
        .from("hub_user_tab_access")
        .select("*")
        .eq("user_id", user_id);

      if (res.error) return banner(root, res.error.message);

      const map = {};
      (res.data || []).forEach(r => map[r.tab_key] = r);

      const rows = TAB_KEYS.map(k => {
        const row = map[k];
        const can_view = row ? !!row.can_view : true;
        const can_edit = row ? !!row.can_edit : false;

        return `
          <tr>
            <td><code>${htmlEscape(k)}</code></td>
            <td><input type="checkbox" data-k="${htmlEscape(k)}" data-f="can_view" ${can_view ? "checked" : ""}></td>
            <td><input type="checkbox" data-k="${htmlEscape(k)}" data-f="can_edit" ${can_edit ? "checked" : ""}></td>
          </tr>
        `;
      }).join("");

      grid.innerHTML = `
        <table class="table">
          <thead><tr><th>Tab</th><th>Can view</th><th>Can edit</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="row-actions">
          <button class="btn-primary" id="ta-save" type="button">Save Tab Access</button>
        </div>
      `;

      grid.querySelector("#ta-save").addEventListener("click", async () => {
        const inputs = Array.from(grid.querySelectorAll("input[type='checkbox']"));
        const byTab = {};
        inputs.forEach(i => {
          const k = i.dataset.k;
          byTab[k] = byTab[k] || { tab_key: k, can_view: true, can_edit: false };
          byTab[k][i.dataset.f] = i.checked;
        });

        // Upsert each tab row
        const payload = Object.values(byTab).map(r => ({
          user_id,
          tab_key: r.tab_key,
          can_view: r.can_view,
          can_edit: r.can_edit
        }));

        const { error } = await ctx.supabase
          .from("hub_user_tab_access")
          .upsert(payload, { onConflict: "user_id,tab_key" });

        if (error) return banner(root, error.message);
        banner(root, "Tab access saved.", "ok");
        await refresh();
      });
    }

    userSel.addEventListener("change", refresh);
    await refresh();
  }

  return { init };
})();
