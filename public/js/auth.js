import { supabase } from "./supabaseClient.js";
import { qs } from "./utils.js";

export async function bootAuthUI() {
  const form = qs("#login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = qs("#login-email").value.trim();
    const password = qs("#login-password").value;

    if (!email || !password) {
      alert("Email and password required");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    window.location.reload();
  });
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
}
