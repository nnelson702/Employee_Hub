"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/shared/supabase/client";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.replace("/auth/login");
        return;
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>Checking session…</div>;

  return <>{children}</>;
}
