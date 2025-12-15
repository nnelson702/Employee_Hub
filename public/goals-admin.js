/* global window */
window.HubGoalsAdmin = (function () {
  function banner(host, msg) {
    const b = host.querySelector(".local-banner");
    if (!msg) { b.classList.add("hidden"); b.textContent=""; return; }
    b.textContent = msg;
    b.classList.remove("hidden");
  }

  function monthStartISO(d) {
    const dt = new Date(d);
    const ms = new Date(dt.getFullYear(), dt.getMonth(), 1);
    return ms.toISOString().slice(0,10);
  }

  function toMonthLabel(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }

  async function init(host, ctx) {
    host.innerHTML = `
      <div class="banner local-banner banner-error hidden"></div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h2>Monthly</h2>
          </div>
          <div class="card-body">
            <label class="field">
              <span>Store</span>
              <select id="ga-store"></select>
            </label>

            <label class="field">
              <span>Month</span>
              <input id="ga-month" type="month" />
            </label>

            <div class="row-actions">
              <button class="btn-secondary" id="ga-load" type="button">Load</button>
              <button class="btn-secondary" id="ga-generate" type="button">Generate Daily</button>
            </div>

            <div class="divider"></div>

            <div class="grid-2">
              <label class="field">
                <span>Monthly Sales Goal</span>
                <input id="ga-sales" type="number" step="1" />
              </label>
              <label class="field">
                <span>Monthly Txn Goal</span>
                <input id="ga-txn" type="number" step="1" />
              </label>
            </div>

            <label class="field">
              <span>Status</span>
              <select id="ga-status">
                <option value="draft">draft</option>
                <option value="finalized">finalized</option>
              </select>
            </label>

            <button class="btn-primary" id="ga-save" type="button">Save Monthly Goal</button>

            <div class="divider"></div>

            <div class="muted small" id="ga-summary">Select store/month then Load.</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>Daily Calendar</h2>
          </div>
          <div class="card-body">
            <div id="ga-calendar" class="muted">Load a month to view daily goals.</div>
          </div>
        </div>
      </div>
    `;

    const storeSel = host.querySelector("#ga-store");
    const monthInp = host.querySelector("#ga-month");
    const btnLoad = host.querySelector("#ga-load");
    const btnGen = host.querySelector("#ga-generate");
    const btnSave = host.querySelector("#ga-save");

    const salesInp = host.querySelector("#ga-sales");
    const txnInp = host.querySelector("#ga-txn");
    const statusSel = host.querySelector("#ga-status");
    const summary = host.querySelector("#ga-summary");
    const calHost = host.querySelector("#ga-calendar");

    // populate stores from scope
    storeSel.innerHTML = (ctx.stores || [])
      .map(s => `<option value="${s.store_id}">${s.store_id} — ${s.store_name}</option>`)
      .join("");

    // default month = current
    const now = new Date();
    monthInp.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

    let current = { store_id: null, month: null, monthly_id: null };

    async function loadMonthlyAndDaily() {
      banner(host, "");
      const store_id = storeSel.value;
      const month = monthStartISO(monthInp.value + "-01");
      current = { store_id, month, monthly_id: null };

      summary.textContent = `Loading ${store_id} — ${toMonthLabel(month)}…`;
      calHost.innerHTML = "Loading…";

      // monthly
      const mg = await ctx.supabase
        .from("hub_monthly_goals")
        .select("*")
        .eq("store_id", store_id)
        .eq("month", month)
        .limit(1);

      if (mg.error) return banner(host, mg.error.message);

      if (!mg.data || mg.data.length === 0) {
        current.monthly_id = null;
        salesInp.value = "";
        txnInp.value = "";
        statusSel.value = "draft";
      } else {
        const row = mg.data[0];
        current.monthly_id = row.id;
        salesInp.value = row.sales_goal ?? 0;
        txnInp.value = row.txn_goal ?? 0;
        statusSel.value = row.status || "draft";
      }

      // daily
      const dg = await ctx.supabase
        .from("hub_daily_goals")
        .select("date,sales_goal,txn_goal,locked,source")
        .eq("store_id", store_id)
        .eq("month", month)
        .order("date", { ascending: true });

      if (dg.error) return banner(host, dg.error.message);

      renderCalendar(calHost, store_id, month, dg.data || []);
      summary.textContent = `Loaded ${store_id} — ${toMonthLabel(month)}.`;
    }

    async function saveMonthly() {
      banner(host, "");
      const store_id = storeSel.value;
      const month = monthStartISO(monthInp.value + "-01");

      const payload = {
        store_id,
        month,
        sales_goal: Number(salesInp.value || 0),
        txn_goal: Number(txnInp.value || 0),
        status: statusSel.value,
        created_by: ctx.user.id
      };

      // upsert by unique constraint (store_id, month)
      const res = await ctx.supabase
        .from("hub_monthly_goals")
        .upsert(payload, { onConflict: "store_id,month" })
        .select("*")
        .limit(1);

      if (res.error) return banner(host, res.error.message);
      summary.textContent = "Monthly goal saved.";
      await loadMonthlyAndDaily();
    }

    async function generateDaily() {
      banner(host, "");
      const store_id = storeSel.value;
      const month = monthStartISO(monthInp.value + "-01");

      // ensure monthly exists
      const mg = await ctx.supabase
        .from("hub_monthly_goals")
        .select("id")
        .eq("store_id", store_id)
        .eq("month", month)
        .limit(1);

      if (mg.error) return banner(host, mg.error.message);
      if (!mg.data || mg.data.length === 0) return banner(host, "Create/save monthly goal before generating daily goals.");

      const rpc = await ctx.supabase.rpc("hub_generate_daily_goals_for_month", {
        p_store_id: store_id,
        p_month: month,
        p_asof: new Date().toISOString().slice(0,10)
      });

      if (rpc.error) return banner(host, rpc.error.message);
      summary.textContent = "Daily goals generated.";
      await loadMonthlyAndDaily();
    }

    btnLoad.addEventListener("click", loadMonthlyAndDaily);
    btnSave.addEventListener("click", saveMonthly);
    btnGen.addEventListener("click", generateDaily);

    // initial load
    await loadMonthlyAndDaily();
  }

  function renderCalendar(host, store_id, monthISO, rows) {
    const byDate = {};
    rows.forEach(r => byDate[r.date] = r);

    const monthStart = new Date(monthISO + "T00:00:00");
    const year = monthStart.getFullYear();
    const m = monthStart.getMonth();

    const first = new Date(year, m, 1);
    const last = new Date(year, m + 1, 0);
    const daysInMonth = last.getDate();
    const startDow = first.getDay(); // 0 Sun

    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    let html = `
      <div class="calendar">
        <div class="calendar-head">
          ${dow.map(d => `<div class="calendar-dow">${d}</div>`).join("")}
        </div>
        <div class="calendar-grid">
    `;

    for (let i=0; i<startDow; i++) html += `<div class="calendar-cell blank"></div>`;

    for (let day=1; day<=daysInMonth; day++) {
      const d = new Date(year, m, day);
      const iso = d.toISOString().slice(0,10);
      const r = byDate[iso];

      html += `
        <div class="calendar-cell">
          <div class="cell-top">
            <div class="cell-day">${day}</div>
            <div class="cell-badges">
              ${r?.locked ? `<span class="pill pill-lock">locked</span>` : ``}
              ${r?.source ? `<span class="pill">${r.source}</span>` : ``}
            </div>
          </div>
          <div class="cell-metrics">
            <div><span class="muted small">Sales</span> <strong>${r ? Number(r.sales_goal||0).toLocaleString() : "—"}</strong></div>
            <div><span class="muted small">Txns</span> <strong>${r ? Number(r.txn_goal||0).toLocaleString() : "—"}</strong></div>
          </div>
        </div>
      `;
    }

    const totalCells = startDow + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i=0; i<trailing; i++) html += `<div class="calendar-cell blank"></div>`;

    html += `</div></div>`;
    host.innerHTML = html;
  }

  return { init };
})();

