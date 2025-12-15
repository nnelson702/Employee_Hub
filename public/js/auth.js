import { getSupabase } from "./supabaseClient.js";
import { State } from "./state.js";
import { $, toast } from "./ui.js";

const supabase = getSupabase();

function showAuth(show) {
  $("#auth")?.classList.toggle("hidden", !show);
  $("#app")?.classList.toggle("hidden", show);
}

async function loadHubProfile(userId) {
  // Your hub tables are the new canonical ones
  const { data, error } = await supabase
    .from("hub_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadScope(userId) {
  const role = State.hubProfile?.role ?? "associate";

  const { data: stores, error } = await supabase
    .from("hub_user_store_access")
    .select("store_id")
    .eq("user_id", userId);

  if (error) throw error;

  State.scope.role = role;
  State.scope.stores = (stores ?? []).map(r => r.store_id);

  $("#scopeRole").textContent = `role: ${State.scope.role}`;
  $("#scopeStores").textContent = `stores: ${State.scope.stores.join(", ") || "—"}`;
}

async function renderWhoAmI() {
  const name = State.hubProfile?.full_name || State.user?.email || "—";
  const role = State.hubProfile?.role || "—";
  $("#whoami").textContent = `${name} • ${role}`;
}

async function onSignedIn() {
  showAuth(false);
  await renderWhoAmI();
}

async function onSignedOut() {
  State.session = null;
  State.user = null;
  State.hubProfile = null;
  State.scope = { role: null, stores: [] };
  showAuth(true);
}

export async function initAuth() {
  $("#btnRefresh")?.addEventListener("click", () => location.reload());
  $("#btnSignOut")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  $("#authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email")?.value?.trim();
    const password = $("#password")?.value;
    if (!email || !password) return toast("Missing credentials", "error");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message, "error");
  });

  const { data } = await supabase.auth.getSession();
  State.session = data?.session ?? null;

  supabase.auth.onAuthStateChange(async (_event, session) => {
    State.session = session;
    if (!session) return onSignedOut();

    const { data: userData } = await supabase.auth.getUser();
    State.user = userData?.user ?? null;

    try {
      State.hubProfile = await loadHubProfile(session.user.id);
      if (!State.hubProfile) {
        toast("No hub_profiles row for this user yet (admin needs to create it).", "error");
      }
      await loadScope(session.user.id);
      await renderWhoAmI();
    } catch (err) {
      console.error(err);
      toast("Profile/scope load failed. Check RLS + hub_profiles.", "error");
    }

    await onSignedIn();
  });

  if (!State.session) {
    await onSignedOut();
    return;
  }

  // bootstrap same path as onAuthStateChange
  const { data: userData } = await supabase.auth.getUser();
  State.user = userData?.user ?? null;
  try {
    State.hubProfile = await loadHubProfile(State.session.user.id);
    await loadScope(State.session.user.id);
    await renderWhoAmI();
  } catch (err) {
    console.error(err);
    toast("Profile/scope load failed. Check RLS + hub_profiles.", "error");
  }
  await onSignedIn();
}

