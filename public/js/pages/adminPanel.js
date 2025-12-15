function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export const AdminPanelPage = {
  title: "Admin Panel",
  subtitle: "Manage stores, user scope, and tab access. (Creating auth users requires an Edge Function.)",
  render: async ({ supabase, ctx, toast }) => {
    if (ctx.role !== "admin") {
      const r = el("div", "card", "Admin only.");
      return r;
    }

    const root = el("div", "");
    const grid = el("div", "grid2");
    root.appendChild(grid);

    // STORES
    const storesCard = el("div", "card");
    storesCard.appendChild(el("h2", "", "Stores"));

    const storesList = el("div", "");
    storesCard.appendChild(storesList);

    const addBox = el("div", "card");
    addBox.style.marginTop = "12px";
    addBox.appendChild(el("div", "muted small", "ADD STORE"));
    const iStoreId = el("input");
    iStoreId.placeholder = "store_id (ex: 18228)";
    const iStoreName = el("input");
    iStoreName.placeholder = "store_name (ex: Tropicana)";
    const iEagle = el("input");
    iEagle.placeholder = "eagle_number (ex: 1)";
    const iTz = el("input");
    iTz.placeholder = "timezone (ex: America/Los_Angeles)";
    iTz.value = "America/Los_Angeles";
    const btnAddStore = el("button", "btn btn-primary", "Add / Update Store");

    addBox.appendChild(iStoreId);
    addBox.appendChild(iStoreName);
    addBox.appendChild(iEagle);
    addBox.appendChild(iTz);
    addBox.appendChild(btnAddStore);
    storesCard.appendChild(addBox);

    // USERS
    const usersCard = el("div", "card");
    usersCard.appendChild(el("h2", "", "Users"));
    usersCard.appendChild(el("div", "muted small",
      "This panel manages hub_profiles + access. Creating/inviting Auth users is server-side (Edge Function) — we’ll add it next."
    ));

    const usersList = el("div", "");
    usersCard.appendChild(usersList);

    const refreshBtn = el("button", "btn", "Refresh Lists");
    refreshBtn.style.marginTop = "12px";
    usersCard.appendChild(refreshBtn);

    grid.appendChild(storesCard);
    grid.appendChild(usersCard);

    async function loadStores() {
      const s = await supabase.from("hub_stores").select("store_id,store_name,eagle_number,timezone,is_active").order("store_id");
      if (s.error) throw new Error(s.error.message);

      storesList.innerHTML = "";
      (s.data || []).forEach((r) => {
        const row = el("div", "card");
        row.style.marginBottom = "10px";
        row.innerHTML = `
          <div><b>${r.store_id}</b> — ${r.store_name}</div>
          <div class="muted small">eagle: ${r.eagle_number} • tz: ${r.timezone} • active: ${r.is_active}</div>
        `;
        row.onclick = () => {
          iStoreId.value = r.store_id;
          iStoreName.value = r.store_name;
          iEagle.value = r.eagle_number;
          iTz.value = r.timezone;
        };
        storesList.appendChild(row);
      });
    }

    async function upsertStore() {
      const store_id = iStoreId.value.trim();
      const store_name = iStoreName.value.trim();
      const eagle_number = iEagle.value.trim();
      const timezone = iTz.value.trim() || "America/Los_Angeles";
      if (!store_id || !store_name || !eagle_number) return toast.error("store_id, store_name, eagle_number required.");

      // hub_stores has PK(store_id), so upsert is safe
      const r = await supabase.from("hub_stores").upsert({
        store_id, store_name, eagle_number, timezone, is_active: true,
      });

      if (r.error) throw new Error(r.error.message);
      toast.ok("Store saved.");
      await loadStores();
    }

    async function loadUsers() {
      const u = await supabase.from("hub_profiles").select("id,email,full_name,role").order("email");
      if (u.error) throw new Error(u.error.message);

      usersList.innerHTML = "";
      for (const p of u.data || []) {
        const box = el("div", "card");
        box.style.marginBottom = "10px";

        const header = el("div", "");
        header.innerHTML = `<div><b>${p.full_name || p.email}</b></div><div class="muted small">${p.email} • ${p.role}</div>`;
        box.appendChild(header);

        // store access
        const a = await supabase.from("hub_user_store_access").select("store_id").eq("user_id", p.id);
        const stores = (a.data || []).map(x => x.store_id);

        const storesLine = el("div", "muted small", `stores: ${stores.length ? stores.join(", ") : "—"}`);
        storesLine.style.marginTop = "8px";
        box.appendChild(storesLine);

        usersList.appendChild(box);
      }
    }

    btnAddStore.onclick = () => upsertStore().catch(e => (console.error(e), toast.error(e.message)));
    refreshBtn.onclick = () => Promise.all([loadStores(), loadUsers()]).catch(e => (console.error(e), toast.error(e.message)));

    await Promise.all([loadStores(), loadUsers()]);
    return root;
  },
};
