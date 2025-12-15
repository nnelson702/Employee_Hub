function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export const GoalsAdminPage = {
  title: "Goals Admin",
  subtitle: "Set monthly goals, generate daily, tweak days, lock days. Monthly is authoritative.",
  render: async ({ supabase, ctx, toast }) => {
    const root = el("div", "card");
    const top = el("div", "grid3");
    root.appendChild(top);

    const cardA = el("div", "card");
    const cardB = el("div", "card");
    const cardC = el("div", "card");
    top.appendChild(cardA);
    top.appendChild(cardB);
    top.appendChild(cardC);

    cardA.appendChild(el("div", "muted small", "MONTHLY"));
    const storeSel = el("select");
    const monthSel = el("input");
    monthSel.type = "month";

    storeSel.innerHTML = `<option value="">— Select store —</option>` + ctx.stores.map(s => `<option value="${s}">${s}</option>`).join("");
    cardA.appendChild(el("label", "field", "")).appendChild(el("span", "", "Store"));
    cardA.appendChild(storeSel);
    cardA.appendChild(el("label", "field", "")).appendChild(el("span", "", "Month"));
    cardA.appendChild(monthSel);

    const btnRow = el("div", "", "");
    btnRow.style.display = "flex";
    btnRow.style.gap = "10px";
    btnRow.style.marginTop = "10px";

    const btnLoad = el("button", "btn", "Load Monthly Goal");
    const btnSuggest = el("button", "btn btn-primary", "Suggest Monthly Goal");
    btnRow.appendChild(btnLoad);
    btnRow.appendChild(btnSuggest);
    cardA.appendChild(btnRow);

    const out = el("div", "card");
    out.style.marginTop = "12px";
    out.appendChild(el("div", "muted small", "OUTPUT"));
    const outText = el("div", "", "Select store + month.");
    out.appendChild(outText);
    cardA.appendChild(out);

    // Monthly edit
    cardB.appendChild(el("div", "muted small", "EDIT MONTHLY GOAL"));
    const inpTxn = el("input");
    inpTxn.type = "number";
    const inpSales = el("input");
    inpSales.type = "number";
    const inpAtv = el("input");
    inpAtv.type = "number";
    inpAtv.disabled = true;

    cardB.appendChild(el("div", "muted small", "Transactions"));
    cardB.appendChild(inpTxn);
    cardB.appendChild(el("div", "muted small", "Sales"));
    cardB.appendChild(inpSales);
    cardB.appendChild(el("div", "muted small", "Implied ATV"));
    cardB.appendChild(inpAtv);

    const statusSel = el("select");
    statusSel.innerHTML = `<option value="draft">draft</option><option value="finalized">finalized</option>`;
    cardB.appendChild(el("div", "muted small", "Save Status"));
    cardB.appendChild(statusSel);

    const btnSaveMonthly = el("button", "btn btn-primary", "Save Monthly Goal");
    btnSaveMonthly.style.marginTop = "10px";
    cardB.appendChild(btnSaveMonthly);

    // Daily summary
    cardC.appendChild(el("div", "muted small", "LIVE TOTALS"));
    const live = el("div", "");
    cardC.appendChild(live);

    let currentMonthlyId = null;

    function computeAtv() {
      const t = Number(inpTxn.value || 0);
      const s = Number(inpSales.value || 0);
      inpAtv.value = t > 0 ? (s / t).toFixed(2) : "";
    }

    inpTxn.oninput = computeAtv;
    inpSales.oninput = computeAtv;

    async function loadMonthly() {
      const store_id = storeSel.value;
      const month = monthSel.value ? `${monthSel.value}-01` : null;
      if (!store_id || !month) {
        toast.error("Pick store + month.");
        return;
      }

      const m = await supabase
        .from("hub_monthly_goals")
        .select("id,store_id,month,sales_goal,txn_goal,status")
        .eq("store_id", store_id)
        .eq("month", month)
        .maybeSingle();

      if (m.error) throw new Error(m.error.message);

      if (!m.data) {
        currentMonthlyId = null;
        inpTxn.value = "";
        inpSales.value = "";
        inpAtv.value = "";
        statusSel.value = "draft";
        outText.textContent = "No monthly goal found (yet). Use Suggest or Save.";
      } else {
        currentMonthlyId = m.data.id;
        inpTxn.value = m.data.txn_goal ?? "";
        inpSales.value = m.data.sales_goal ?? "";
        statusSel.value = m.data.status || "draft";
        computeAtv();
        outText.textContent = `Loaded monthly goal for ${store_id} ${month}.`;
      }

      await refreshLiveDelta();
    }

    async function suggestMonthly() {
      const store_id = storeSel.value;
      const target_month = monthSel.value ? `${monthSel.value}-01` : null;
      if (!store_id || !target_month) {
        toast.error("Pick store + month.");
        return;
      }

      // IMPORTANT: this is RPC, not REST path. 404 here = function name mismatch.
      const r = await supabase.rpc("hub_suggest_monthly_goal", {
        p_store_id: store_id,
        p_target_month: target_month,
      });

      if (r.error) throw new Error(r.error.message);

      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) throw new Error("No suggestion returned.");

      inpTxn.value = Math.round(Number(row.suggested_txn || 0));
      inpSales.value = Math.round(Number(row.suggested_sales || 0));
      statusSel.value = "draft";
      computeAtv();

      outText.textContent = `Suggested: ${money(inpTxn.value)} txns / $${money(inpSales.value)} sales.`;
      toast.ok("Suggestion loaded into editor.");
      await refreshLiveDelta();
    }

    async function saveMonthly() {
      if (ctx.role !== "admin") {
        toast.error("Admin only.");
        return;
      }
      const store_id = storeSel.value;
      const month = monthSel.value ? `${monthSel.value}-01` : null;
      const txn_goal = Number(inpTxn.value || 0);
      const sales_goal = Number(inpSales.value || 0);
      const status = statusSel.value;

      if (!store_id || !month) return toast.error("Pick store + month.");
      if (!txn_goal || !sales_goal) return toast.error("Enter sales + txns.");

      // Upsert by (store_id, month) if you have the unique constraint; otherwise we do manual.
      const existing = await supabase
        .from("hub_monthly_goals")
        .select("id")
        .eq("store_id", store_id)
        .eq("month", month)
        .maybeSingle();

      if (existing.error) throw new Error(existing.error.message);

      if (!existing.data) {
        const ins = await supabase.from("hub_monthly_goals").insert({
          store_id,
          month,
          sales_goal,
          txn_goal,
          status,
        }).select("id").single();

        if (ins.error) throw new Error(ins.error.message);
        currentMonthlyId = ins.data.id;
        toast.ok("Monthly goal created.");
      } else {
        const upd = await supabase
          .from("hub_monthly_goals")
          .update({ sales_goal, txn_goal, status })
          .eq("id", existing.data.id) // THIS prevents “UPDATE requires WHERE”
          .select("id")
          .single();

        if (upd.error) throw new Error(upd.error.message);
        currentMonthlyId = upd.data.id;
        toast.ok("Monthly goal saved.");
      }

      await refreshLiveDelta();
    }

    async function refreshLiveDelta() {
      const store_id = storeSel.value;
      const month = monthSel.value ? `${monthSel.value}-01` : null;
      if (!store_id || !month) {
        live.textContent = "—";
        return;
      }

      const v = await supabase
        .from("v_hub_goal_delta")
        .select("*")
        .eq("store_id", store_id)
        .eq("month", month)
        .maybeSingle();

      if (v.error) {
        live.textContent = "No delta view or not accessible.";
        return;
      }

      const d = v.data;
      if (!d) {
        live.textContent = "No daily goals yet for this month.";
        return;
      }

      live.innerHTML = `
        <div class="grid3">
          <div class="card">
            <div class="muted small">Monthly Target</div>
            <div><b>$${money(d.monthly_sales_goal)}</b> / <b>${money(d.monthly_txn_goal)}</b> txns</div>
          </div>
          <div class="card">
            <div class="muted small">Daily Total</div>
            <div><b>$${money(d.sum_daily_sales)}</b> / <b>${money(d.sum_daily_txn)}</b> txns</div>
          </div>
          <div class="card">
            <div class="muted small">Δ Remaining (Daily − Monthly)</div>
            <div><b>$${money(d.delta_sales)}</b> / <b>${money(d.delta_txn)}</b> txns</div>
          </div>
        </div>
      `;
    }

    btnLoad.onclick = () => loadMonthly().catch(e => (console.error(e), toast.error(e.message)));
    btnSuggest.onclick = () => suggestMonthly().catch(e => (console.error(e), toast.error(e.message)));
    btnSaveMonthly.onclick = () => saveMonthly().catch(e => (console.error(e), toast.error(e.message)));

    // start blank
    return root;
  },
};
