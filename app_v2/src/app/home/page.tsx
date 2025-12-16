"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/shared/supabase/client";

export default function HomePage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) window.location.href = "/auth/login";
      else setEmail(data.user.email || "");
    };
    load();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Home</h1>
      <div>Logged in as: {email}</div>

      <button onClick={logout} style={{ marginTop: 16, padding: 10 }}>
        Log out
      </button>
    </div>
  );
}
