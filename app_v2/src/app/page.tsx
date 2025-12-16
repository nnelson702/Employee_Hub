"use client";

import { useEffect } from "react";
import { supabase } from "@/shared/supabase/client";

export default function Page() {
  useEffect(() => {
    const go = async () => {
      const { data } = await supabase.auth.getSession();
      window.location.href = data.session ? "/home" : "/auth/login";
    };
    go();
  }, []);

  return <div style={{ padding: 24 }}>Loading…</div>;
}
