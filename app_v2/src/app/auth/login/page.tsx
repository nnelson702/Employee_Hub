"use client";

import { useState } from "react";
import { supabase } from "@/shared/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setMsg(error.message);
    else window.location.href = "/home";

    setLoading(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Employee Portal Login</h1>

      <div style={{ marginTop: 16 }}>
        <label>Email</label>
        <input
          style={{ width: "100%", padding: 10, marginTop: 6 }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Password</label>
        <input
          type="password"
          style={{ width: "100%", padding: 10, marginTop: 6 }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button
        onClick={signIn}
        disabled={loading}
        style={{ marginTop: 16, padding: 10, width: "100%" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      {msg && <div style={{ marginTop: 12, color: "crimson" }}>{msg}</div>}
    </div>
  );
}
