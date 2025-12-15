/* global supabase, APP_CONFIG */

(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Supabase ----------
  if (!window.APP_CONFIG?.SUPABASE_URL || !window.APP_CONFIG?.SUPABASE_ANON_KEY) {
    console.error("Missing APP_CONFIG. Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js");
  }
  const sb = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

  // ---------- UI helpers ----------
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function setBanner(msg, isError = true) {
    const b = $("global-banner");
    if (!msg) { hide(b); b.textContent = ""; return; }
    b.textContent = msg;
    b.classList.toggle("banner-error", !!isError);
    show(b);
  }

  function fmtRole(role) {
    if (!role) return "—";
    return role.replaceAll("_", " ");
  }

  // ---------- App State ----------
  const state = {
    user: null,
    profile: null,
    stores: [],
    role: null,
    tabAccess: {}, // { tab_key: { can_view, can_edit } }
    activeTab: null,
    modulesInit: new Set(),
  };

  // ---------- Tab model (aligned to seed doc) ----------
  const TABS = [
    { key: "dashboard", label: "Dashboard", el: "tab-dashboard", minRole: "associate" },
    { key: "goals-admin", label: "Goals Admin", el: "tab-goals-admin", minRole: "admin" },
    { key: "insights", label: "Goals & Insights", el: "tab-insights", minRole: "associate" },
    { key: "admin", label: "Admin Panel", el: "tab-admin", minRole: "admin" },
    { key: "feed", label: "Comms Feed", el: "tab-feed", minRole: "associate" },
    { key: "tasks", label: "Tasks", el: "tab-tasks", minRole: "associate" },
    { key: "walks", label: "Dept Walks", el: "tab-walks", minRole: "department_lead" },
    { key: "marketing", label: "Marketing & Training", el: "tab-marketing", minRole: "associate" }
  ];

  const ROLE_RANK = {
    associate: 1,
    department_lead: 2,
    store_manager: 3,
    admin: 4
  };

  function roleMeetsMin(role, minRole) {
    const r = ROLE_RANK[role] ?? 0;
    const m = ROLE_RANK[minRole] ?? 0;
    return r >= m;
  }

  // ---------- Data loading ----------
  async function loadProfileAndScope() {
    const { data: auth } = await sb.auth.getUser();
    state.user = auth?.user ?? null;
    if (!state.user) return;

    // Profile
    const profRes = await sb
      .from("hub_profiles")
      .select("*")
      .eq("id", state.user.id);

    if (profRes.error) throw new Error(`hub_profiles not accessible: ${profRes.error.message}`);
    if (!profRes.data || profRes.data.length === 0) {
      throw new Error("hub_profiles missing for this user. Admin must create a profile row.");
    }
    if (profRes.data.length > 1) {
      console.warn("Multiple hub_profiles rows returned; using first row.");
    }
    state.profile = profRes.data[0];
    state.role = state.profile.role || "associate";

    // Tab access overrides
    const tabRes = await sb
      .from("hub_user_tab_access")
      .select("*")
      .eq("user_id", state.user.id);

    if (tabRes.error) throw new Error(`hub_user_tab_access error: ${tabRes.error.message}`);
    state.tabAccess = {};
    (tabRes.data || []).forEach((r) => {
      state.tabAccess[r.tab_key] = { can_view: !!r.can_view, can_edit: !!r.can_edit };
    });

    // Stores scope
    if (state.role === "admin") {
      const stRes = await sb.from("hub_stores").select("*").order("store_id", { ascending: true });
      if (stRes.error) throw new Error(`hub_stores error: ${stRes.error.message}`);
      state.stores = stRes.data || [];
    } else {
      const accessRes = await sb
        .from("hub_user_store_access")
        .select("store_id, hub_stores:hub_stores(store_id,store_name,timezone,is_active,eagle_number)")
        .eq("user_id", state.user.id);

      if (accessRes.error) throw new Error(`hub_user_store_access error: ${accessRes.error.message}`);
      state.stores = (accessRes.data || [])
        .map((r) => r.hub_stores)
        .filter(Boolean);
    }
  }

  function applySignedInUI() {
    hide($("auth-block"));
    show($("app-shell"));
    $("user-sub").textContent = `${state.profile.full_name || state.profile.email || "Signed in"} • ${fmtRole(state.role)}`;
    $("scope-pill").innerHTML =
      `role: <strong>${state.role}</strong><br/>stores: <strong>${(state.stores || []).map(s => s.store_id).join(", ") || "—"}</strong>`;
  }

  function applySignedOutUI() {
    show($("auth-block"));
    hide($("app-shell"));
    setBanner("");
  }

  function canViewTab(tabKey, minRole) {
    const override = state.tabAccess[tabKey];
    if (override && override.can_view === false) return false;
    return roleMeetsMin(state.role, minRole);
  }

  function renderNav() {
    const nav = $("nav");
    nav.innerHTML = "";

    TABS.forEach((t) => {
      if (!canViewTab(t.key, t.minRole)) return;

      const btn = document.createElement("button");
      btn.className = "nav-btn";
      btn.type = "button";
      btn.textContent = t.label;
      btn.dataset.tab = t.key;

      btn.addEventListener("click", () => openTab(t.key));
      nav.appendChild(btn);
    });
  }

  function setActiveNav(tabKey) {
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabKey);
    });
  }

  async function openTab(tabKey) {
    setBanner("");
    state.activeTab = tabKey;

    // hide all
    TABS.forEach((t) => {
      const el = $(t.el);
      if (el) hide(el);
    });

    const t = TABS.find((x) => x.key === tabKey) || TABS[0];
    show($(t.el));
    setActiveNav(tabKey);

    // init module once
    const ctx = {
      supabase: sb,
      user: state.user,
      profile: state.profile,
      role: state.role,
      stores: state.stores,
      tabAccess: state.tabAccess
    };

    if (!state.modulesInit.has(tabKey)) {
      state.modulesInit.add(tabKey);
      try {
        if (tabKey === "admin" && window.HubAdmin?.init) await window.HubAdmin.init($("admin-root"), ctx);
        if (tabKey === "goals-admin" && window.HubGoalsAdmin?.init) await window.HubGoalsAdmin.init($("goals-admin-root"), ctx);
        if (tabKey === "insights" && window.HubInsights?.init) await window.HubInsights.init($("insights-root"), ctx);
        if (tabKey === "feed" && window.HubFeed?.init) await window.HubFeed.init($("feed-root"), ctx);
        if (tabKey === "tasks" && window.HubTasks?.init) await window.HubTasks.init($("tasks-root"), ctx);
        if (tabKey === "walks" && window.HubWalks?.init) await window.HubWalks.init($("walks-root"), ctx);
        if (tabKey === "marketing" && window.HubMarketing?.init) await window.HubMarketing.init($("marketing-root"), ctx);
      } catch (e) {
        console.error(e);
        setBanner(e.message || String(e));
      }
    }
  }

  // ---------- Auth ----------
  async function signIn(email, password) {
    const res = await sb.auth.signInWithPassword({ email, password });
    if (res.error) throw new Error(res.error.message);
  }

  async function signOut() {
    await sb.auth.signOut();
  }

  // ---------- Bootstrap ----------
  async function boot() {
    setBanner("");

    const { data: auth } = await sb.auth.getUser();
    const user = auth?.user || null;

    if (!user) {
      applySignedOutUI();
      return;
    }

    try {
      await loadProfileAndScope();
      applySignedInUI();
      renderNav();

      // default tab: dashboard unless admin prefers goals-admin
      const startTab = (state.role === "admin") ? "goals-admin" : "dashboard";
      await openTab(startTab);
    } catch (e) {
      console.error(e);
      applySignedInUI(); // show app shell so user can still sign out
      setBanner(e.message || String(e));
    }
  }

  // Events
  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    hide($("auth-error"));

    const email = $("email").value.trim();
    const password = $("password").value;

    try {
      await signIn(email, password);
      await boot();
    } catch (err) {
      $("auth-error").textContent = err.message || String(err);
      show($("auth-error"));
    }
  });

  $("btn-signout").addEventListener("click", async () => {
    await signOut();
    state.user = null;
    state.profile = null;
    state.stores = [];
    state.role = null;
    state.tabAccess = {};
    state.modulesInit.clear();
    applySignedOutUI();
  });

  $("btn-refresh").addEventListener("click", async () => {
    state.modulesInit.clear(); // allow re-init if needed
    await boot();
  });

  sb.auth.onAuthStateChange(async () => {
    await boot();
  });

  // start
  boot();
})();
