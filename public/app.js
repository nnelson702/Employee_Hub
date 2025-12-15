// app.js (COPY/REPLACE WHOLE FILE)

import { createRouter } from "./js/router.js";
import { createLayout } from "./js/ui/layout.js";
import { buildNav } from "./js/ui/nav.js";
import { pages } from "./js/pages/index.js";
import { toast } from "./js/ui/toast.js";

// -------------------------
// Supabase singleton client
// -------------------------
// Hard-coded to avoid config drift / broken anon keys.
// anon key is public by design.
const SUPABASE_URL = "https://bvyrxqfffaxthrjfxjue.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2eXJ4cWZmZmF4dGhyamZ4anVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDkwMjEsImV4cCI6MjA3NzY4NTAyMX0.BK3LvTsDdLgFn5qNFHQoa4MTkGIe5sNvmVaA8uujvnM";

function getSupabaseSingleton() {
  // If something else already created it, reuse it.
  if (window.__HUB_SUPABASE__) return window.__HUB_SUPABASE__;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error(
      "Supabase JS client not found. Ensure @supabase/supabase-js is loaded before app.js."
    );
  }

  window.__HUB_SUPABASE__ = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  return window.__HUB_SUPABASE__;
}

const supabase = getSupabaseSingleton();

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
  setSubtitle: (t) =>
    (document.getElementById("pageSubtitle").textContent = t || ""),
  setBody: (node) => {
    const body = document.getElementById("pageBody");
    body.innerHTML = "";
    body.appendChild(node);
  },
});

let routerStarted = false;

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

  if (prof.error)
    throw new Error(`hub_profiles not accessible: ${prof.error.message}`);
  if (!prof.data)
    throw new Error(
      "No hub_profiles row for this user. (Admin needs to add you in Admin Panel > Users)"
    );

  const access = await supabase
    .from("hub_user_store_access")
    .select("store_id")
    .eq("user_id", userId);

  if (access.error)
    throw new Error(
      `hub_user_store_access not accessible: ${access.error.message}`
    );

  const stores = (access.data || []).map((r) => r.store_id);

  // UI scope
  elScopeRole.textContent = prof.data.role;
  elScopeStores.textContent = stores.length ? stores.join(", ") : "—";
  elSubtitle.textContent = `${prof.data.full_name || prof.data.email} • ${
    prof.data.role
  }`;

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

function startRouterOnce() {
  if (routerStarted) return;
  routerStarted = true;
  router.start();
}

function stopRouter() {
  // Router object may not support stop; we just gate starts.
  routerStarted = false;
}

async function boot() {
  try {
    elStatusPill.textContent = "Initializing…";

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      showAuth();
      stopRouter();
    } else {
      showApp();
      startRouterOnce();
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        showApp();
        startRouterOnce();
      } else {
        showAuth();
        stopRouter();
      }
    });
  } catch (e) {
    console.error(e);
    toast.error(String(e.message || e));
    showAuth();
    stopRouter();
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
    // Do NOT call router.start() here. Let onAuthStateChange handle it once.
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
