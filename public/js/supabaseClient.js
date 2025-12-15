import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

export function createSupabase() {
  // supabase is injected globally from the CDN UMD script
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

