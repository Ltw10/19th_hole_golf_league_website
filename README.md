# 19th Hole Golf League website

Next.js app for schedule, regular-season standings, public score and skins entry, and admin moderation. All league tables live in the Postgres schema **`nhgl`** inside your Supabase project.

## Setup

1. **Create a Supabase project** (or use a shared project). **Required:** open **Project Settings → Data API** (older UIs: **Settings → API**). Under **Exposed schemas** (or “API settings” / “Schema”), add **`nhgl`** and save. If `nhgl` exists in Postgres but is not listed here, the API will error with **`invalid schema: nhgl`** — this step is separate from running migrations.

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

## Debugging database connection

- Set **`DEBUG_SUPABASE=1`** or **`NEXT_PUBLIC_NHGL_DEBUG=1`** in `.env.local` and restart, then visit **`GET /api/debug/db`** for a JSON check of anon + service-role queries against `nhgl.teams`.

## Features

### Home (`/`)

- League hub with quick links to the main flows (submit round, schedule, standings, handicap helper).
- Global **SiteNav** (all pages): logo, Schedule (jumps to current-week anchor), Standings, Submit Round, Handicap Helper, Admin — responsive menu on small screens.

### Schedule (`/schedule`)

- Full season calendar: handicap weeks, regular season, and championship; seeded matches (including round-robin regular season and a week-19 championship slot).
- Per-week match list with team matchup labels.
- **Match points** — shows submitted 10-point split when recorded (`nhgl.score_submissions`).
- **Players in** — count of submitted player rounds per match (out of 4); highlights when complete.
- **Virtual scorecard** — link to `/schedule/virtual-scorecard/[matchId]` for gross/net-style views, team handicap dots, and per-player rounds for that match.
- **Scorecard image** — “View card” when a matchup scorecard was uploaded to Storage (`nhgl-scorecards`).
- **Submit round** — deep link to `/submit-round?match=…` when the match has no submission yet.
- **Skins (per week)** — pot (buy-in × buyers), skins winners and holes won, **View details** modal (hole-by-hole low net, buyers list), and **Skins scorecard** link to `/schedule/skins-scorecard/[weekId]` (combined grid of skins players, gross/net, skin highlights).
- Anchor for “current” week to jump from the home page.

### Standings (`/standings`)

- **Regular season team points** — from `nhgl.v_regular_season_team_points` (championship is top two teams).
- **Skins leaderboard** — from `nhgl.v_skins_player_stats` (skins won, money in/out, net).

### Submit round (`/submit-round`) — primary player flow

- One form for a chosen week and match: **front or back nine**, hole-by-hole **gross** strokes for Hickory Sticks (course holes from the DB).
- **Handicap helper** integration: effective handicap preview from helper history; optional roster summary.
- **Skins**: opt in per round; respects league **skins buy-in** from settings.
- **Substitutes / subbing** — play for a team and optionally sub for a roster player when configured.
- **Score entry**: typed strokes and/or **Choose scores** tap sheet with score shapes vs par (league-style legend).
- **Optional scorecard upload** to `nhgl-scorecards`; can become the public matchup card when the match is finalized.
- Server RPC **`nhgl.submit_player_round`**: writes player round + hole scores, handicap helper row, recomputes skins, and applies **matchup points when all four players** for the match have submitted.

### Handicap helper (`/handicap-helper`)

- Public **leaderboard** from `nhgl.v_handicap_helper_summary` (handicap, rounds in average, counts).
- **Add rounds** (date, gross score, par) for league members; optional **add new player** (non-roster) for tracking.
- Drill into a player to list, edit, or delete helper rounds (Supabase from the browser).

### Virtual scorecard (`/schedule/virtual-scorecard/[matchId]`)

- Read-only match view: teams, which nine each player played, **team total handicaps**, stroke allocation from **team handicap difference** on each hole, and hole-by-hole **net** narrative for the match.

### Skins week scorecard (`/schedule/skins-scorecard/[weekId]`)

- All skins participants for that week: handicaps, gross and net per hole, pot summary, and alignment with schedule skins highlights.

### Deprecated (fallback only)

- **`/submit-scores`** — legacy matchup form (10-point split + optional scorecard) into `nhgl.score_submissions`; points users to Submit round.
- **`/submit-skins`** — legacy weekly skins RPC `nhgl.submit_skins_week`; points users to Submit round.

### Admin (`/admin/scores`, `NHGL_ADMIN_SECRET`)

- Secret-gated **tool menu** after load (one task at a time).
- **Set championship** — set week-19 playoff to top two regular-season teams (`/api/admin/championship`).
- **Skins buy-in** — edit league-wide amount (`/api/admin/league-settings`).
- **Course holes** — pick course, edit par and stroke index per hole, save (`/api/admin/courses`, `…/holes`).
- **Recompute week** — refresh skins + match scores for a week after handicap edits (`/api/admin/week-recompute`).
- **Test cleanup** — remove scores and skins data for one week (`/api/admin/week-cleanup`).
- **Handicap helper** — full editor: roster **name** changes, list/edit/delete helper rows (`/api/admin/handicap-helper/*`, `/api/admin/players/*`).
- **Matchup scores** — edit team points, notes, submitter label; **ScoreRowEditor** with per-player match rounds, scorecard replace/delete, delete submission.

### Debugging / ops

- **`GET /api/debug/db`** — optional JSON DB connectivity check when `DEBUG_SUPABASE=1` or `NEXT_PUBLIC_NHGL_DEBUG=1` is set (see above).

## League data

Season starts **Tuesday, April 14, 2026** (6:00 PM). Teams and players are seeded in `20260408120001_nhgl_seed.sql`.
