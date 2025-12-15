import { createSupabase } from "./js/supabaseClient.js";
import { createRouter } from "./js/router.js";
import { createLayout } from "./js/ui/layout.js";
import { buildNav } from "./js/ui/nav.js";
import { pages } from "./js/pages/index.js";
import { toast } from "./js/ui/toast.js";

const supabase = createSupabase();

// DOM
const elAuthView = document.getElementById("authView");
const elAppView = document.getElementById("appView");
const elBtnSignIn = document.getElementById("btnSignIn");
const elBtnSignOut = document.getElementById("btnSignOut");
const elBtnRefresh = document.getElementById("btnRefresh");
const elEmail = document.getElementById("authEmail");
const elPassword = document.getElementById("authPassword");

const elSubtitle = document.getElementById("brandSubtitle");
const elScopeRole = document.getElementById("scopeRole");
const elScopeStores = document.getElementById("scopeStores");
const elStatusPill = document.getElementById("statusPill");

const layout = createLayout({
  setTitle: (t) => (document.getElementById("pageTitle").textContent = t),
  setSubtitle: (t) => (document.getElementById("pageSubtitle").textContent = t || ""),
  setBody: (node) => {
    const body = document.getElementById("pageBody");
    body.innerHTML = "";
    body.appendChild(node);
  },
});

const router = createRouter({
  onRoute: async (routeKey) => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      showAuth();
      return;
    }

    const ctx = await loadScope(session.user.id);
    buildNav(document.getElementById("nav"), ctx, routeKey);

    if (!pages[routeKey]) routeKey = "goals_admin";
    const page = pages[routeKey];

    layout.setTitle(page.title);
    layout.setSubtitle(page.subtitle || "");

    const view = await page.render({ supabase, ctx, toast, layout });
    layout.setBody(view);
  },
});

async function loadScope(userId) {
  // hub_profiles is authoritative for role
  const prof = await supabase
    .from("hub_profiles")
    .select("id,email,full_name,role")
    .eq("id", userId)
    .maybeSingle();

  if (prof.error) throw new Error(`hub_profiles not accessible: ${prof.error.message}`);
  if (!prof.data) throw new Error("No hub_profiles row for this user. (Admin needs to add you in Admin Panel > Users)");

  const access = await supabase
    .from("hub_user_store_access")
    .select("store_id")
    .eq("user_id", userId);

  if (access.error) throw new Error(`hub_user_store_access not accessible: ${access.error.message}`);

  const stores = (access.data || []).map((r) => r.store_id);

  // UI scope
  elScopeRole.textContent = prof.data.role;
  elScopeStores.textContent = stores.length ? stores.join(", ") : "—";
  elSubtitle.textContent = `${prof.data.full_name || prof.data.email} • ${prof.data.role}`;

  return { userId, role: prof.data.role, stores };
}

function showAuth() {
  elAppView.classList.add("hidden");
  elAuthView.classList.remove("hidden");
  elStatusPill.textContent = "Signed out";
}

function showApp() {
  elAuthView.classList.add("hidden");
  elAppView.classList.remove("hidden");
  elStatusPill.textContent = "Ready";
}

async function boot() {
  try {
    elStatusPill.textContent = "Initializing…";

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      showAuth();
    } else {
      showApp();
      router.start();
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        showApp();
        router.start();
      } else {
        showAuth();
      }
    });
  } catch (e) {
    console.error(e);
    toast.error(String(e.message || e));
    showAuth();
  }
}

elBtnSignIn.onclick = async () => {
  try {
    const email = elEmail.value.trim();
    const password = elPassword.value;

    if (!email || !password) {
      toast.error("Enter email + password.");
      return;
    }

    elBtnSignIn.disabled = true;
    elStatusPill.textContent = "Signing in…";

    const res = await supabase.auth.signInWithPassword({ email, password });
    if (res.error) throw res.error;

    toast.ok("Signed in.");
    showApp();
    router.start();
  } catch (e) {
    console.error(e);
    toast.error(e.message || String(e));
    elStatusPill.textContent = "Sign-in failed";
  } finally {
    elBtnSignIn.disabled = false;
  }
};

elBtnSignOut.onclick = async () => {
  await supabase.auth.signOut();
  toast.ok("Signed out.");
};

elBtnRefresh.onclick = async () => {
  router.refresh();
};

boot();
