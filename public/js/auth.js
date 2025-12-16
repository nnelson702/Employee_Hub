// public/js/auth.js
import { supabase } from "./supabaseClient.js";

function getEl(id) {
  return document.getElementById(id);
}

/**
 * bootAuthUI()
 * - Ensures the named export exists (your main.js expects it)
 * - Wires up Sign in / Sign out buttons if present
 * - Restores session if already logged in
 */
export async function bootAuthUI() {
  const emailEl = getEl("email");
  const passEl = getEl("password");
  const signInBtn = getEl("signInBtn");
  const signOutBtn = getEl("signOutBtn");

  // If the page doesn't have auth controls, don't crash — just ensure session load works.
  if (signInBtn) {
    signInBtn.addEventListener("click", async () => {
      const email = (emailEl?.value || "").trim();
      const password = passEl?.value || "";
      if (!email || !password) {
        console.error("Missing email/password");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("Sign-in error:", error.message);
        alert(error.message);
      }
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.reload();
    });
  }

  // Keep UI/session consistent
  supabase.auth.onAuthStateChange((_event, _session) => {
    // Most of your app boot logic is in router/pages; reload is simplest + reliable for now.
    // (We can replace this with stateful rerender once Admin Panel is done.)
    location.reload();
  });

  // If there's already a session, do nothing (app loads normally).
  await supabase.auth.getSession();
}

// Optional exports other files might call later
export async function signOut() {
  await supabase.auth.signOut();
}
