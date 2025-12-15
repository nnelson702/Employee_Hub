(function () {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    alert("Missing SUPABASE config in public/config.js");
    return;
  }

  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const $ = (id) => document.getElementById(id);
  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");

  function setMsg(text, isError = false) {
    const el = $("globalMsg");
    if (!text) { hide(el); el.textContent = ""; return; }
    el.textContent = text;
    el.style.background = isError ? "rgba(239,68,68,.12)" : "rgba(34,197,94,.12)";
    el.style.borderColor = isError ? "rgba(239,68,68,.35)" : "rgba(34,197,94,.25)";
    show(el);
  }

  function money(n) {
    const x = Number(n || 0);
    return "$" + x.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function num(n) { return Number(n || 0).toLocaleString(); }
  function isoToday() { return new Date().toISOString().slice(0, 10); }
  function firstOfMonthISO(yyyyMm) { return `${yyyyMm}-01`; }
  function daysInMonth(monthISO) {
    const y = Number(monthISO.slice(0, 4));
    const m = Number(monthISO.slice(5, 7));
    return new Date(y, m, 0).getDate();
  }
  function weekdayIndex(dateISO) { return new Date(dateISO + "T00:00:00").getDay(); }
  function buildMonthISOFromInput() {
    const v = $("gaMonth").value;
    if (!v) return null;
    return firstOfMonthISO(v);
  }

  const state = {
    session: null,
    user: null,
    profile: null,
    role: null,
    storeIds: [],
    stores: [],
    activeTab: "tabGoalsAdmin",
    gaStoreId: null,
    gaMonthISO: null,
    gaMonthlyGoal: null,
    gaSuggestion: null,
    gaDaily: [],
    gaSummary: null,
  };

  function setTab(tabId) {
    document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => hide(t));
    const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (navBtn) navBtn.classList.add("active");
    const tab = $(tabId);
    if (tab) show(tab);
    state.activeTab = tabId;
  }

  function initNav() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });
  }

  async function signIn(email, password) {
    setMsg(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  }

  async function signOut() {
    setMsg(null);
    await supabase.auth.signOut();
  }

  async function loadAuth() {
    const { data } = await supabase.auth.getSession();
    state.session = data.session || null;

    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      boot().catch((e) => {
        console.error(e);
        setMsg(e.message || String(e), true);
      });
    });
  }

  async function loadProfileAndScope() {
    const user = state.session?.user;
    if (!user) return;

    state.user = user;

    const { data: profile, error: pErr } = await supabase
      .from("hub_profiles")
      .select("id, email, full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      throw new Error(`hub_profiles not accessible: ${pErr.message}`);
    }

    if (!profile) {
      // Critical: user exists in auth but not in hub_profiles
      $("userSub").textContent = `${user.email || "Signed in"} • profile missing`;
      $("roleBadge").textContent = `role: —`;
      $("storeScope").textContent = `stores: —`;

      setMsg(
        "Signed in, but your user is not in hub_profiles yet. Add your auth.users.id into public.hub_profiles (role=admin) then refresh.",
        true
      );

      // Keep shell visible so they can see message, but disable goal controls by empty stores.
      state.profile = null;
      state.role = null;
      state.storeIds = [];
      state.stores = [];

      document.querySelectorAll(".admin-only").forEach((el) => el.classList.add("hidden"));
      return;
    }

    state.profile = profile;
    state.role = profile.role;

    if (state.role === "admin") {
      const { data: stores, error } = await supabase
        .from("hub_stores")
        .select("store_id, store_name, is_active")
        .eq("is_active", true)
        .order("store_id", { ascending: true });
      if (error) throw new Error(error.message);
      state.stores = stores || [];
      state.storeIds = state.stores.map((s) => s.store_id);
    } else {
      const { data: access, error: aErr } = await supabase
        .from("hub_user_store_access")
        .select("store_id")
        .eq("user_id", user.id);
      if (aErr) throw new Error(aErr.message);

      state.storeIds = (access || []).map((r) => r.store_id);

      const { data: stores, error: sErr } = await supabase
        .from("hub_stores")
        .select("store_id, store_name, is_active")
        .in("store_id", state.storeIds)
        .eq("is_active", true)
        .order("store_id", { ascending: true });
      if (sErr) throw new Error(sErr.message);
      state.stores = stores || [];
    }

    $("userSub").textContent = `${profile.full_name || profile.email} • ${profile.role}`;
    $("roleBadge").textContent = `role: ${profile.role}`;
    $("storeScope").textContent = `stores: ${state.storeIds.length ? state.storeIds.join(", ") : "none"}`;

    document.querySelectorAll(".admin-only").forEach((el) => {
      if (state.role === "admin") el.classList.remove("hidden");
      else el.classList.add("hidden");
    });
  }

  function initGoalsAdminControls() {
    const sel = $("gaStore");
    sel.innerHTML = `<option value="">Select store…</option>` + (state.stores || [])
      .map((s) => `<option value="${s.store_id}">${s.store_id} — ${s.store_name}</option>`)
      .join("");

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    $("gaMonth").value = `${yyyy}-${mm}`;

    if (state.stores.length) $("gaStore").value = state.stores[0].store_id;

    $("gaLoad").onclick = () => loadGoalsAdmin().catch(handleErr);
    $("gaGenerateDaily").onclick = () => generateDaily().catch(handleErr);
    $("gaSaveMonthly").onclick = () => saveMonthly().catch(handleErr);

    const recomputeImpliedAtv = () => {
      const txn = Number($("gaTxnGoal").value || 0);
      const sales = Number($("gaSalesGoal").value || 0);
      $("gaImpliedAtv").textContent = txn ? `$${(sales / txn).toFixed(2)}` : "—";
    };
    $("gaTxnGoal").addEventListener("input", recomputeImpliedAtv);
    $("gaSalesGoal").addEventListener("input", recomputeImpliedAtv);
  }

  async function loadGoalsAdmin() {
    setMsg(null);
    const storeId = $("gaStore").value;
    const monthISO = buildMonthISOFromInput();
    if (!storeId || !monthISO) { setMsg("Select store/month then Load.", true); return; }

    state.gaStoreId = storeId;
    state.gaMonthISO = monthISO;

    await Promise.all([
      fetchMonthlyGoal(storeId, monthISO),
      fetchSuggestion(storeId, monthISO),
      fetchDailyGoals(storeId, monthISO),
      fetchSummary(storeId, monthISO),
    ]);

    renderGoalsAdmin();
    setMsg("Loaded.", false);
  }

  async function fetchMonthlyGoal(storeId, monthISO) {
    const { data, error } = await supabase
      .from("hub_monthly_goals")
      .select("store_id, month, sales_goal, txn_goal, status")
      .eq("store_id", storeId)
      .eq("month", monthISO)
      .maybeSingle();
    if (error) throw new Error(error.message);
    state.gaMonthlyGoal = data || null;
  }

  async function fetchSuggestion(storeId, monthISO) {
    const { data, error } = await supabase.rpc("hub_suggest_monthly_goal", {
      p_store_id: storeId,
      p_target_month: monthISO,
      p_asof: isoToday(),
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : null;
    state.gaSuggestion = row || null;
  }

  async function fetchDailyGoals(storeId, monthISO) {
    const { data, error } = await supabase
      .from("hub_daily_goals")
      .select("id, store_id, date, month, sales_goal, txn_goal, source, locked")
      .eq("store_id", storeId)
      .eq("month", monthISO)
      .order("date", { ascending: true });
    if (error) throw new Error(error.message);
    state.gaDaily = data || [];
  }

  async function fetchSummary(storeId, monthISO) {
    const { data, error } = await supabase
      .from("v_hub_goal_month_summary")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", monthISO)
      .maybeSingle();
    if (error) throw new Error(error.message);
    state.gaSummary = data || null;
  }

  function renderGoalsAdmin() {
    const mg = state.gaMonthlyGoal;
    const sug = state.gaSuggestion;
    const sum = state.gaSummary;

    $("gaStatus").textContent = mg?.status || "—";
    $("gaSaveStatus").value = mg?.status || "draft";

    if (sug) {
      const stxn = Number(sug.suggested_txn || 0);
      const satv = sug.suggested_atv != null ? Number(sug.suggested_atv) : null;
      const ssales = Number(sug.suggested_sales || 0);
      $("gaSuggested").textContent = `${num(stxn)} / ${satv != null ? satv.toFixed(2) : "—"} / ${money(ssales)}`;

      const fy = sug.txn_yoy_factor != null ? Number(sug.txn_yoy_factor).toFixed(3) : "—";
      const ay = sug.atv_yoy_factor != null ? Number(sug.atv_yoy_factor).toFixed(3) : "—";
      $("gaFactors").textContent = `YoY factors • txn ${fy} • ATV ${ay}`;
    } else {
      $("gaSuggested").textContent = "—";
      $("gaFactors").textContent = "—";
    }

    const salesVal = mg ? Number(mg.sales_goal || 0) : (sug ? Number(sug.suggested_sales || 0) : 0);
    const txnVal = mg ? Number(mg.txn_goal || 0) : (sug ? Number(sug.suggested_txn || 0) : 0);

    $("gaSalesGoal").value = String(Math.round(salesVal));
    $("gaTxnGoal").value = String(Math.round(txnVal));
    $("gaImpliedAtv").textContent = txnVal ? `$${(salesVal / txnVal).toFixed(2)}` : "—";

    if (sum) {
      $("gaMonthlyTarget").textContent = `${money(sum.monthly_sales_goal)} / ${num(sum.monthly_txn_goal)} txns`;
      $("gaDailyTotal").textContent = `${money(sum.sum_daily_sales)} / ${num(sum.sum_daily_txn)} txns`;
      $("gaDelta").textContent = `${money(sum.delta_sales)} / ${num(sum.delta_txn)} txns`;
      $("gaDailyMeta").textContent = `days: ${sum.days_present || 0} • locked: ${sum.locked_days || 0}`;
    } else {
      $("gaMonthlyTarget").textContent = "—";
      $("gaDailyTotal").textContent = "—";
      $("gaDelta").textContent = "—";
      $("gaDailyMeta").textContent = "—";
    }

    renderCalendar();
  }

  function renderCalendar() {
    const storeId = state.gaStoreId;
    const monthISO = state.gaMonthISO;
    const grid = $("gaCalendarGrid");
    if (!storeId || !monthISO) { grid.innerHTML = ""; return; }

    const nDays = daysInMonth(monthISO);
    const yyyy = monthISO.slice(0, 4);
    const mm = monthISO.slice(5, 7);

    const map = new Map();
    state.gaDaily.forEach((d) => map.set(d.date, d));

    const padStart = weekdayIndex(monthISO);
    const cells = [];
    for (let i = 0; i < padStart; i++) cells.push({ empty: true });

    for (let day = 1; day <= nDays; day++) {
      const dd = String(day).padStart(2, "0");
      const dateISO = `${yyyy}-${mm}-${dd}`;
      cells.push({ empty: false, dateISO, row: map.get(dateISO) });
    }
    while (cells.length % 7 !== 0) cells.push({ empty: true });

    grid.innerHTML = "";
    cells.forEach((c) => {
      if (c.empty) {
        const el = document.createElement("div");
        el.className = "day empty";
        grid.appendChild(el);
        return;
      }

      const row = c.row;
      const locked = row ? !!row.locked : false;

      const el = document.createElement("div");
      el.className = "day" + (locked ? " locked" : "");

      const top = document.createElement("div");
      top.className = "day-top";

      const dn = document.createElement("div");
      dn.className = "day-num";
      dn.textContent = String(Number(c.dateISO.slice(8, 10)));

      const meta = document.createElement("div");
      meta.className = "day-meta";
      meta.textContent = row ? `${row.source}${locked ? " • 🔒" : ""}` : "—";

      top.appendChild(dn);
      top.appendChild(meta);

      const sales = document.createElement("input");
      sales.className = "mini";
      sales.type = "number";
      sales.value = row ? String(Math.round(Number(row.sales_goal || 0))) : "0";
      sales.disabled = !row || locked;

      const txns = document.createElement("input");
      txns.className = "mini";
      txns.type = "number";
      txns.value = row ? String(Math.round(Number(row.txn_goal || 0))) : "0";
      txns.disabled = !row || locked;

      const atv = document.createElement("div");
      atv.className = "small muted";
      const atvVal = (Number(txns.value || 0) > 0) ? (Number(sales.value || 0) / Number(txns.value || 0)) : null;
      atv.textContent = `ATV: ${atvVal != null ? "$" + atvVal.toFixed(2) : "—"}`;

      function refreshAtv() {
        const t = Number(txns.value || 0);
        const s = Number(sales.value || 0);
        const v = t ? (s / t) : null;
        atv.textContent = `ATV: ${v != null ? "$" + v.toFixed(2) : "—"}`;
      }
      sales.addEventListener("input", refreshAtv);
      txns.addEventListener("input", refreshAtv);

      const actions = document.createElement("div");
      actions.className = "day-actions";

      const chkWrap = document.createElement("label");
      chkWrap.className = "checkbox";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = locked;
      chk.disabled = !row;
      chkWrap.appendChild(chk);
      chkWrap.appendChild(document.createTextNode("Lock"));

      const save = document.createElement("button");
      save.className = "savebtn";
      save.textContent = "Save";
      save.disabled = !row;

      save.addEventListener("click", async () => {
        try {
          save.disabled = true;
          setMsg(null);

          const { error } = await supabase.rpc("hub_set_daily_goal", {
            p_store_id: storeId,
            p_date: c.dateISO,
            p_sales_goal: Number(sales.value || 0),
            p_txn_goal: Number(txns.value || 0),
            p_lock: !!chk.checked,
          });
          if (error) throw new Error(error.message);

          await Promise.all([
            fetchDailyGoals(storeId, monthISO),
            fetchSummary(storeId, monthISO),
          ]);

          renderGoalsAdmin();
          setMsg("Day saved.", false);
        } catch (e) {
          handleErr(e);
        } finally {
          save.disabled = false;
        }
      });

      actions.appendChild(chkWrap);
      actions.appendChild(save);

      el.appendChild(top);
      el.appendChild(labelBlock("Sales", sales));
      el.appendChild(labelBlock("Txns", txns));
      el.appendChild(atv);
      el.appendChild(actions);

      grid.appendChild(el);
    });
  }

  function labelBlock(lbl, input) {
    const wrap = document.createElement("div");
    const l = document.createElement("div");
    l.className = "small muted";
    l.textContent = lbl;
    wrap.appendChild(l);
    wrap.appendChild(input);
    return wrap;
  }

  async function saveMonthly() {
    setMsg(null);
    const storeId = $("gaStore").value;
    const monthISO = buildMonthISOFromInput();
    if (!storeId || !monthISO) return setMsg("Pick a store and month.", true);

    const salesGoal = Number($("gaSalesGoal").value || 0);
    const txnGoal = Number($("gaTxnGoal").value || 0);
    const status = $("gaSaveStatus").value;

    const { error } = await supabase.rpc("hub_upsert_monthly_goal", {
      p_store_id: storeId,
      p_month: monthISO,
      p_sales_goal: salesGoal,
      p_txn_goal: txnGoal,
      p_status: status,
    });
    if (error) throw new Error(error.message);

    await Promise.all([
      fetchMonthlyGoal(storeId, monthISO),
      fetchSummary(storeId, monthISO),
    ]);

    renderGoalsAdmin();
    setMsg("Monthly goal saved.", false);
  }

  async function generateDaily() {
    setMsg(null);
    const storeId = $("gaStore").value;
    const monthISO = buildMonthISOFromInput();
    if (!storeId || !monthISO) return setMsg("Pick a store and month.", true);

    const { error } = await supabase.rpc("hub_generate_daily_goals_for_month", {
      p_store_id: storeId,
      p_month: monthISO,
      p_asof: isoToday(),
    });
    if (error) throw new Error(error.message);

    await Promise.all([
      fetchDailyGoals(storeId, monthISO),
      fetchSummary(storeId, monthISO),
    ]);

    renderGoalsAdmin();
    setMsg("Daily goals generated.", false);
  }

  function initHeaderButtons() {
    $("btnSignOut").onclick = () => signOut().catch(handleErr);
    $("btnRefresh").onclick = () => refreshActive().catch(handleErr);
  }

  async function refreshActive() {
    setMsg(null);
    if (!state.session) return;
    if (state.activeTab === "tabGoalsAdmin") {
      if ($("gaStore").value && buildMonthISOFromInput()) await loadGoalsAdmin();
      else setMsg("Select store/month then Load.", true);
    } else {
      setMsg("Nothing to refresh on this tab yet.", false);
    }
  }

  function handleErr(e) {
    console.error(e);
    setMsg(e?.message ? e.message : String(e), true);
  }

  async function boot() {
    initNav();
    initHeaderButtons();

    if (!state.session) {
      hide($("appShell"));
      show($("authView"));
      $("btnSignOut").disabled = true;
      $("btnRefresh").disabled = true;

      $("btnSignIn").onclick = async () => {
        const email = $("email").value.trim();
        const password = $("password").value;
        const msg = $("authMsg");

        try {
          msg.textContent = "";
          hide(msg);

          const session = await signIn(email, password);
          state.session = session;

          show(msg);
          msg.classList.remove("hidden");
          msg.textContent = "Signed in.";
        } catch (err) {
          show(msg);
          msg.classList.remove("hidden");
          msg.textContent = err.message || String(err);
        }
      };

      return;
    }

    $("btnSignOut").disabled = false;
    $("btnRefresh").disabled = false;
    hide($("authView"));
    show($("appShell"));

    await loadProfileAndScope();

    // Always init controls (even if stores are empty, it won't crash)
    initGoalsAdminControls();

    if (state.role !== "admin") setTab("tabGoalsView");
    else setTab("tabGoalsAdmin");

    // Only auto-load if we have stores
    if (state.role === "admin" && state.stores.length) {
      await loadGoalsAdmin();
    }
  }

  loadAuth().then(() => boot()).catch(handleErr);
})();
