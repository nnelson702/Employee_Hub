<!-- Copilot instructions for the app_v2 repo -->
# Quick orientation for AI coding agents

This repository is a Next.js 16 app (App Router) using React 19 and Supabase as the primary backend. Focus on making minimal, well-scoped changes and follow the project's explicit patterns.

- **Entry points / layout**: The UI root is [src/app/layout.tsx](src/app/layout.tsx#L1). Pages live under `src/app/*` using the App Router conventions.
- **Backend integration**: Supabase client is at `src/shared/supabase/client.ts` and expects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variables.
- **DB access pattern**: Data access helpers live in `src/shared/db/*.ts`. Each file exports:
  - typed row shapes (e.g. `DailyGoalRow`, `MonthlyGoalRow`, `HistoricalDailyRow`)
  - small, focused functions (`fetch...`, `upsert...`, `set...`) that call `supabase.from(...).select(...)` or `.upsert(...)` and `throw` on `error`.

- **Date conventions**: Use ISO date strings consistently:
  - month-start: `YYYY-MM-01` (see `fetchMonthlyGoal` / `fetchDailyGoalsForMonth` in `src/shared/db/goals.ts`)
  - day: `YYYY-MM-DD` (see `historical_daily_sales.ts`, `actuals.ts`)

- **Publish / admin semantics**: Many DB helpers distinguish published vs draft/admin results. Example APIs:
  - `fetchDailyGoalsForMonthPublished(storeId, monthStart)` — store-facing, filters `is_published = true`.
  - `fetchDailyGoalsForMonthAdmin(...)` — admin view, returns drafts + published.

- **Upsert patterns & uniqueness**: Upserts use `onConflict` keys (e.g. `onConflict: "store_id,goal_date"`). If you modify schema or upsert keys, verify constraints exist (see comment in `daily_goals.ts` about adding a unique constraint).

- **Error handling**: DB functions `throw` the Supabase error; callers are expected to surface or handle these exceptions. When writing new helpers, follow the same pattern (return typed results, `throw` on `error`).

- **Scripts / dev workflow**: Use the standard Next.js scripts in `package.json`:
  - `npm run dev` — development server (Next dev)
  - `npm run build` — production build
  - `npm run start` — start built server
  - `npm run lint` — runs `eslint`

- **TypeScript and styling**: Project uses TypeScript + Tailwind. Keep types explicit for DB rows and public exports.

- **Files worth checking before changes**:
  - `src/shared/supabase/client.ts` — env-driven client creation
  - `src/shared/db/*` — canonical data-access helpers and types
  - `src/app/*` — UI routes and where helpers are used
  - `src/components/RequireAuth.tsx` and `src/lib/useRequireAuth.tsx` — auth gating patterns

- **When adding features**:
  - Prefer single-purpose helper functions in `src/shared/db` for DB operations.
  - Mirror existing naming (`fetchXForMonth`, `upsertX`, `setXPublishedForMonth`).
  - Use the same date string formats and explicit casts (e.g. `Number(...)`, `Boolean(...)`) as seen in existing helpers.

If anything in this summary is unclear or you'd like more coverage (routing patterns, auth flows, or tests), tell me which area to expand. I can iterate quickly.
