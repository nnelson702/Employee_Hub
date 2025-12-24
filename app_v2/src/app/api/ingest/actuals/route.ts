import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Secure import endpoint for scheduled ingestion worker.
 *
 * Auth:
 * - Requires header: x-import-token: <IMPORT_TOKEN>
 *
 * Body supports JSON:
 * {
 *   "rows": [
 *     {"store_id":"18228","business_date":"2025-12-01","net_sales_actual":3596.12,"transactions_actual":133}
 *   ],
 *   "source":"ahdc_sftp"
 * }
 */
export async function POST(req: Request) {
  try {
    const token = req.headers.get("x-import-token") || "";
    const expected = process.env.IMPORT_TOKEN || "";
    if (!expected || token !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing SUPABASE env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json(
        { error: "Invalid body. Expect { rows: [...] }" },
        { status: 400 }
      );
    }

    const source = typeof body.source === "string" ? body.source : null;

    const rows = body.rows.map((r: any) => {
      const store_id = String(r.store_id ?? "").trim();
      const business_date = String(r.business_date ?? "").trim(); // YYYY-MM-DD
      const net_sales_actual = Number(r.net_sales_actual ?? 0);
      const transactions_actual = Math.max(0, Math.trunc(Number(r.transactions_actual ?? 0)));

      if (!store_id || !business_date) {
        throw new Error("Row missing store_id or business_date");
      }

      return {
        store_id,
        business_date,
        net_sales_actual: isFinite(net_sales_actual) ? net_sales_actual : 0,
        transactions_actual: isFinite(transactions_actual) ? transactions_actual : 0,
        source,
        imported_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("daily_actuals")
      .upsert(rows, { onConflict: "store_id,business_date" });

    if (error) throw error;

    return NextResponse.json({ ok: true, imported: rows.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Import failed" },
      { status: 500 }
    );
  }
}
