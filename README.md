# 19th Hole Golf League website

Next.js app for schedule, regular-season standings, public score and skins entry, and admin moderation. All league tables live in the Postgres schema **`nhgl`** inside your Supabase project.

## Setup

1. **Create a Supabase project** (or use a shared project). In **Project Settings → API → Exposed schemas**, add **`nhgl`** so PostgREST can see it.

2. **Apply migrations** (Supabase CLI):

   ```bash
   supabase db push
   ```

   Or paste the SQL files under `supabase/migrations/` into the SQL editor and run in order.

3. **Environment variables** — copy `.env.local.example` to `.env.local` and fill in:

   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only) for admin API routes.
   - `NHGL_ADMIN_SECRET` — a long random string; required for `/api/admin/*` and the admin UI.

4. **Run locally**

   ```bash
   npm install
   npm run dev
   ```

## Features

- **Schedule** — seeded weeks (handicap → regular → championship) and 45 regular-season matches (round-robin × 3) plus a placeholder championship match on week 19.
- **Standings** — team points from `nhgl.v_regular_season_team_points`; skins from `nhgl.v_skins_player_stats`.
- **Submit scores** — public insert into `nhgl.score_submissions` with optional scorecard upload to Storage bucket **`nhgl-scorecards`**.
- **Submit skins** — atomic `nhgl.submit_skins_week` RPC (hole wins, buy-ins, payouts).
- **Admin** — `/admin/scores`: list / edit / delete submissions via service role; button to set the week 19 championship match to the top two teams by regular-season points.

## League data

Season starts **Tuesday, April 14, 2026** (6:00 PM). Teams and players are seeded in `20260408120001_nhgl_seed.sql`.
