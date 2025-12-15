// public/modules/admin.js
(function () {
  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }

  function fmt(x) { return (x ?? "").toString(); }

  async function loadStores(sb) {
    const res = await sb.from("hub_stores").select("*").order("store_id", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return res.data || [];
  }

  async function loadUsers(sb) {
    const res = await sb.from("hub_profiles").select("*").order("email", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return res.data || [];
  }

  async function loadUserStoreAccess(sb, userId) {
    const res = await sb.from("hub_user_store_access").select("*").eq("user_id", userId);
    if (res.error) throw new Error(res.error.message);
    return res.data || [];
  }

  async function loadUserTabAccess(sb, userId) {
    const res = await sb.from("hub_user_tab_access").select("*").eq("user_id", userId);
    if (res.error) throw new Error(res.error.message);
    return res.data || [];
  }

  async function upsertStore(sb, payload) {
    const res = await sb.from("hub_stores").upsert(payload, { onConflict: "store_id" }).select("*");
    if (res.error) throw new Error(res.error.message);
    return res.data?.[0];
  }

  async function setUserStore(sb, userId, storeId, enabled) {
    if (enabled) {
      const res = await sb.from("hub_user_store_access").upsert({ user_id: userId, store_id: storeId }, { onConflict: "user_id,store_id" });
      if (res.error) throw new Error(res.error.message);
    } else {
      const res = await sb.from("hub_user_store_access").delete().eq("user_id", userId).eq("store_id", storeId);
      if (res.error) throw new Error(res.error.message);
    }
  }

  async function setUserTab(sb, userId, tabKey, canView, canEdit) {
    const res = await sb
      .from("hub_user_tab_access")
      .upsert({ user_id: userId, tab_key: tabKey, can_view: !!canView, can_edit: !!canEdit }, { onConflict: "user_id,tab_key" });
    if (res.error) throw new Error(res.error.message);
  }

  function TabsMatrix() {
    // Keep in sync with app.js TABS keys
    return [
      "dashboard",
      "goals-admin",
      "insights",
      "admin",
      "feed",
      "tasks",
      "walks",
      "marketing",
    ];
  }

  window.HubAdmin = {
    async init(root, ctx) {
      const { supabase: sb } = ctx;
      root.innerHTML = "";

      const banner = el("div", { class: "banner hidden", id: "admin-banner" });
      const setBanner = (msg, isErr = true) => {
        if (!msg) { banner.classList.add("hidden"); banner.textContent = ""; return; }
        banner.classList.remove("hidden");
        banner.classList.toggle("banner-error", !!isErr);
        banner.textContent = msg;
      };

      const left = el("div", { class: "card" }, [
        el("div", { class: "card-title" }, ["Stores"]),
      ]);

      const right = el("div", { class: "card" }, [
        el("div", { class: "card-title" }, ["Users"]),
      ]);

      const layout = el("div", { class: "grid2" }, [left, right]);
      root.appendChild(banner);
      root.appendChild(layout);

      // ----- Stores UI -----
      const storeForm = el("div", {}, [
        el("div", { class: "card-title" }, ["Add / Update Store"]),
        el("label", {}, ["Store ID (18228 etc)"]),
        el("input", { id: "s-store_id", placeholder: "18228" }),
        el("label", {}, ["Store Name"]),
        el("input", { id: "s-store_name", placeholder: "Tropicana" }),
        el("label", {}, ["Eagle Number (1/2/3/4)"]),
        el("input", { id: "s-eagle_number", placeholder: "1" }),
        el("label", {}, ["Timezone"]),
        el("input", { id: "s-timezone", placeholder: "America/Los_Angeles" }),
        el("label", {}, ["Active"]),
        el("select", { id: "s-active" }, [
          el("option", { value: "true" }, ["true"]),
          el("option", { value: "false" }, ["false"]),
        ]),
        el("button", {
          class: "btn primary",
          type: "button",
          onclick: async () => {
            try {
              setBanner("");
              const payload = {
                store_id: document.getElementById("s-store_id").value.trim(),
                store_name: document.getElementById("s-store_name").value.trim(),
                eagle_number: document.getElementById("s-eagle_number").value.trim(),
                timezone: document.getElementById("s-timezone").value.trim() || "America/Los_Angeles",
                is_active: document.getElementById("s-active").value === "true",
              };
              if (!payload.store_id || !payload.store_name || !payload.eagle_number) {
                setBanner("Store ID, Store Name, and Eagle Number are required.", true);
                return;
              }
              await upsertStore(sb, payload);
              await refreshStores();
              setBanner("Store saved.", false);
            } catch (e) {
              setBanner(e.message || String(e), true);
            }
          }
        }, ["Save Store"])
      ]);

      const storesTableWrap = el("div", {}, [
        el("div", { class: "card-title", style: "margin-top:10px;" }, ["Existing Stores"]),
      ]);
      left.appendChild(storeForm);
      left.appendChild(storesTableWrap);

      let storesCache = [];
      async function refreshStores() {
        storesCache = await loadStores(sb);
        storesTableWrap.querySelectorAll("table").forEach((t) => t.remove());

        const table = el("table", { class: "table" });
        table.appendChild(el("thead", {}, [el("tr", {}, [
          el("th", {}, ["store_id"]),
          el("th", {}, ["name"]),
          el("th", {}, ["eagle"]),
          el("th", {}, ["active"]),
          el("th", {}, ["timezone"]),
          el("th", {}, ["actions"]),
        ])]));
        const tb = el("tbody");
        storesCache.forEach((s) => {
          tb.appendChild(el("tr", {}, [
            el("td", {}, [fmt(s.store_id)]),
            el("td", {}, [fmt(s.store_name)]),
            el("td", {}, [fmt(s.eagle_number)]),
            el("td", {}, [s.is_active ? el("span", { class: "badge good" }, ["active"]) : el("span", { class: "badge bad" }, ["inactive"])]),
            el("td", {}, [fmt(s.timezone)]),
            el("td", {}, [el("div", { class: "row-actions" }, [
              el("button", {
                class: "btn subtle",
                type: "button",
                onclick: () => {
                  document.getElementById("s-store_id").value = fmt(s.store_id);
                  document.getElementById("s-store_name").value = fmt(s.store_name);
                  document.getElementById("s-eagle_number").value = fmt(s.eagle_number);
                  document.getElementById("s-timezone").value = fmt(s.timezone);
                  document.getElementById("s-active").value = s.is_active ? "true" : "false";
                  setBanner("Loaded store into form.", false);
                }
              }, ["Edit"])
            ])])
          ]));
        });
        table.appendChild(tb);
        storesTableWrap.appendChild(table);
      }

      // ----- Users UI -----
      const userPicker = el("select", { id: "user-select" }, [el("option", { value: "" }, ["-- select user --"])]);
      const userMeta = el("div", { class: "scope-pill", id: "user-meta" }, ["—"]);
      const accessWrap = el("div", {}, []);
      const tabWrap = el("div", {}, []);

      right.appendChild(el("div", {}, [
        el("label", {}, ["Select user"]),
        userPicker,
        el("div", { style: "margin-top:8px;" }, [userMeta]),
        el("div", { class: "card-title", style: "margin-top:12px;" }, ["Store Access"]),
        accessWrap,
        el("div", { class: "card-title", style: "margin-top:12px;" }, ["Tab Overrides (optional)"]),
        tabWrap,
      ]));

      let usersCache = [];
      async function refreshUsers() {
        usersCache = await loadUsers(sb);
        userPicker.innerHTML = "";
        userPicker.appendChild(el("option", { value: "" }, ["-- select user --"]));
        usersCache.forEach((u) => {
          userPicker.appendChild(el("option", { value: u.id }, [`${u.email} (${u.role})`]));
        });
      }

      async function renderUserAccess(userId) {
        accessWrap.innerHTML = "";
        tabWrap.innerHTML = "";

        if (!userId) {
          userMeta.textContent = "—";
          return;
        }

        const user = usersCache.find((u) => u.id === userId);
        userMeta.innerHTML = `email: <strong>${fmt(user?.email)}</strong><br/>role: <strong>${fmt(user?.role)}</strong>`;

        const storeAccess = await loadUserStoreAccess(sb, userId);
        const allowed = new Set(storeAccess.map((r) => r.store_id));

        // Stores toggles
        const grid = el("div", { class: "card", style: "padding:12px; background:rgba(255,255,255,0.03);" });
        storesCache.forEach((s) => {
          const chk = el("input", { type: "checkbox" });
          chk.checked = allowed.has(s.store_id);
          chk.addEventListener("change", async () => {
            try {
              setBanner("");
              await setUserStore(sb, userId, s.store_id, chk.checked);
              setBanner("Store access updated.", false);
            } catch (e) {
              chk.checked = !chk.checked;
              setBanner(e.message || String(e), true);
            }
          });

          const row = el("div", { style: "display:flex; align-items:center; gap:10px; padding:6px 0;" }, [
            chk,
            el("div", {}, [
              el("div", {}, [`${s.store_id} — ${s.store_name}`]),
              el("div", { style: "color:rgba(255,255,255,0.6); font-size:12px;" }, [`eagle: ${s.eagle_number} • ${s.timezone}`]),
            ])
          ]);
          grid.appendChild(row);
        });
        accessWrap.appendChild(grid);

        // Tab overrides
        const existingTabs = await loadUserTabAccess(sb, userId);
        const byTab = {};
        existingTabs.forEach((t) => { byTab[t.tab_key] = t; });

        const table = el("table", { class: "table" });
        table.appendChild(el("thead", {}, [el("tr", {}, [
          el("th", {}, ["tab_key"]),
          el("th", {}, ["can_view"]),
          el("th", {}, ["can_edit"]),
          el("th", {}, ["save"]),
        ])]));
        const tb = el("tbody");
        TabsMatrix().forEach((tabKey) => {
          const r = byTab[tabKey] || { can_view: true, can_edit: false };
          const view = el("input", { type: "checkbox" }); view.checked = !!r.can_view;
          const edit = el("input", { type: "checkbox" }); edit.checked = !!r.can_edit;

          const btn = el("button", {
            class: "btn subtle",
            type: "button",
            onclick: async () => {
              try {
                setBanner("");
                await setUserTab(sb, userId, tabKey, view.checked, edit.checked);
                setBanner("Tab override saved.", false);
              } catch (e) {
                setBanner(e.message || String(e), true);
              }
            }
          }, ["Save"]);

          tb.appendChild(el("tr", {}, [
            el("td", {}, [tabKey]),
            el("td", {}, [view]),
            el("td", {}, [edit]),
            el("td", {}, [btn]),
          ]));
        });
        table.appendChild(tb);
        tabWrap.appendChild(table);
      }

      userPicker.addEventListener("change", async () => {
        try {
          setBanner("");
          await renderUserAccess(userPicker.value);
        } catch (e) {
          setBanner(e.message || String(e), true);
        }
      });

      try {
        await refreshStores();
        await refreshUsers();
      } catch (e) {
        setBanner(e.message || String(e), true);
      }
    }
  };
})();

