// public/modules/goalsAdmin.js
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

  window.HubGoalsAdmin = {
    async init(root, ctx) {
      const { supabase: sb, stores } = ctx;

      root.innerHTML = "";
      const banner = el("div", { class: "banner hidden" });
      const setBanner = (msg, isErr = true) => {
        if (!msg) { banner.classList.add("hidden"); banner.textContent = ""; return; }
        banner.classList.remove("hidden");
        banner.classList.toggle("banner-error", !!isErr);
        banner.textContent = msg;
      };

      const storeSel = el("select", {}, [
        el("option", { value: "" }, ["-- Select store --"]),
        ...(stores || []).map(s => el("option", { value: s.store_id }, [`${s.store_id} — ${s.store_name}`]))
      ]);

      const monthInput = el("input", { type: "month" });

      const btnLoad = el("button", { class: "btn subtle", type: "button" }, ["Load Monthly Goal"]);
      const btnSuggest = el("button", { class: "btn primary", type: "button" }, ["Suggest Monthly Goal"]);

      const out = el("div", { class: "card", style: "margin-top:12px;" }, [
        el("div", { class: "card-title" }, ["Output"]),
        el("div", { id: "ga-out", style: "color:rgba(255,255,255,0.85);" }, ["Select store + month."])
      ]);

      const controls = el("div", { class: "card" }, [
        el("div", { class: "card-title" }, ["Monthly"]),
        el("label", {}, ["Store"]),
        storeSel,
        el("label", {}, ["Month"]),
        monthInput,
        el("div", { style: "display:flex; gap:10px; margin-top:10px;" }, [btnLoad, btnSuggest]),
      ]);

      root.appendChild(banner);
      root.appendChild(controls);
      root.appendChild(out);

      const outEl = out.querySelector("#ga-out");

      btnLoad.addEventListener("click", async () => {
        try {
          setBanner("");
          const storeId = storeSel.value;
          const m = monthInput.value; // YYYY-MM
          if (!storeId || !m) { setBanner("Select store and month.", true); return; }

          const monthDate = `${m}-01`;
          const res = await sb
            .from("hub_monthly_goals")
            .select("*")
            .eq("store_id", storeId)
            .eq("month", monthDate)
            .maybeSingle();

          if (res.error) throw new Error(res.error.message);
          if (!res.data) {
            outEl.textContent = "No monthly goal found yet for this store/month.";
            return;
          }
          outEl.innerHTML =
            `Monthly goal loaded:<br/>
             Sales: <strong>$${Number(res.data.sales_goal || 0).toLocaleString()}</strong><br/>
             Txns: <strong>${Number(res.data.txn_goal || 0).toLocaleString()}</strong><br/>
             Status: <strong>${res.data.status}</strong>`;
        } catch (e) {
          setBanner(e.message || String(e), true);
        }
      });

      btnSuggest.addEventListener("click", async () => {
        try {
          setBanner("");
          const storeId = storeSel.value;
          const m = monthInput.value; // YYYY-MM
          if (!storeId || !m) { setBanner("Select store and month.", true); return; }
          const monthDate = `${m}-01`;

          // Your SQL function name may differ depending on what we created.
          // Try hub_suggest_monthly_goal(store_id, target_month, as_of_date)
          const asOf = new Date().toISOString().slice(0, 10);

          const call = await sb.rpc("hub_suggest_monthly_goal", {
            p_store_id: storeId,
            p_target_month: monthDate,
            p_as_of_date: asOf
          });

          if (call.error) throw new Error(call.error.message);

          const r = Array.isArray(call.data) ? call.data[0] : call.data;
          if (!r) { outEl.textContent = "No suggestion returned."; return; }

          outEl.innerHTML =
            `Suggested monthly goal:<br/>
             Sales: <strong>$${Number(r.suggested_sales || 0).toLocaleString()}</strong><br/>
             Txns: <strong>${Number(r.suggested_txn || 0).toLocaleString()}</strong><br/>
             Implied ATV: <strong>$${Number(r.suggested_atv || 0).toFixed(2)}</strong>`;
        } catch (e) {
          setBanner(e.message || String(e), true);
        }
      });
    }
  };
})();

