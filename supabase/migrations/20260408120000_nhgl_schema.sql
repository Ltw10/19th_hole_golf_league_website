-- 19th Hole Golf League — schema nhgl (shared Supabase project)

CREATE SCHEMA IF NOT EXISTS nhgl;

GRANT USAGE ON SCHEMA nhgl TO postgres, anon, authenticated, service_role;

CREATE TYPE nhgl.season_phase AS ENUM ('handicap', 'regular', 'championship');

CREATE TABLE nhgl.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nhgl.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  team_id uuid NOT NULL REFERENCES nhgl.teams (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE nhgl.season_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number int NOT NULL UNIQUE,
  week_date date NOT NULL,
  phase nhgl.season_phase NOT NULL,
  is_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nhgl.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES nhgl.season_weeks (id) ON DELETE CASCADE,
  team_a_id uuid REFERENCES nhgl.teams (id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES nhgl.teams (id) ON DELETE SET NULL,
  team_a_points int,
  team_b_points int,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'final')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhgl_match_points_both_or_neither CHECK (
    (team_a_points IS NULL AND team_b_points IS NULL)
    OR (team_a_points IS NOT NULL AND team_b_points IS NOT NULL)
  ),
  CONSTRAINT nhgl_match_points_sum_10 CHECK (
    team_a_points IS NULL OR (team_a_points + team_b_points = 10)
  ),
  CONSTRAINT nhgl_match_teams_distinct CHECK (
    team_a_id IS NULL OR team_b_id IS NULL OR team_a_id <> team_b_id
  )
);

CREATE INDEX nhgl_matches_week_id_idx ON nhgl.matches (week_id);

CREATE TABLE nhgl.score_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES nhgl.season_weeks (id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES nhgl.matches (id) ON DELETE CASCADE,
  team_a_id uuid NOT NULL REFERENCES nhgl.teams (id) ON DELETE CASCADE,
  team_b_id uuid NOT NULL REFERENCES nhgl.teams (id) ON DELETE CASCADE,
  team_a_points int NOT NULL CHECK (team_a_points >= 0 AND team_a_points <= 10),
  team_b_points int NOT NULL CHECK (team_b_points >= 0 AND team_b_points <= 10),
  scorecard_image_url text,
  notes text,
  submitter_label text,
  submitted_by_player_id uuid REFERENCES nhgl.players (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nhgl_score_submissions_sum_10 CHECK (team_a_points + team_b_points = 10)
);

CREATE UNIQUE INDEX nhgl_score_submissions_one_per_match ON nhgl.score_submissions (match_id);

CREATE TABLE nhgl.skins_week_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL UNIQUE REFERENCES nhgl.season_weeks (id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nhgl.skins_hole_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES nhgl.season_weeks (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES nhgl.players (id) ON DELETE CASCADE,
  hole int NOT NULL CHECK (hole >= 1 AND hole <= 18),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nhgl_skins_hole_wins_week_idx ON nhgl.skins_hole_wins (week_id);
CREATE INDEX nhgl_skins_hole_wins_player_idx ON nhgl.skins_hole_wins (player_id);

CREATE TABLE nhgl.skins_buyins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES nhgl.season_weeks (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES nhgl.players (id) ON DELETE CASCADE,
  amount numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, player_id)
);

CREATE TABLE nhgl.skins_week_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES nhgl.season_weeks (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES nhgl.players (id) ON DELETE CASCADE,
  amount_won numeric(12, 2) NOT NULL CHECK (amount_won >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, player_id)
);

-- ---------- RLS ----------
ALTER TABLE nhgl.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.season_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.score_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.skins_week_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.skins_hole_wins ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.skins_buyins ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.skins_week_payouts ENABLE ROW LEVEL SECURITY;

-- Read-mostly league data
CREATE POLICY nhgl_teams_select ON nhgl.teams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_players_select ON nhgl.players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_season_weeks_select ON nhgl.season_weeks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_matches_select ON nhgl.matches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_score_submissions_select ON nhgl.score_submissions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_skins_week_results_select ON nhgl.skins_week_results FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_skins_hole_wins_select ON nhgl.skins_hole_wins FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_skins_buyins_select ON nhgl.skins_buyins FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_skins_week_payouts_select ON nhgl.skins_week_payouts FOR SELECT TO anon, authenticated USING (true);

-- Public inserts (moderation via admin server routes using service role)
CREATE POLICY nhgl_score_submissions_insert ON nhgl.score_submissions FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY nhgl_skins_week_results_insert ON nhgl.skins_week_results FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY nhgl_skins_hole_wins_insert ON nhgl.skins_hole_wins FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY nhgl_skins_buyins_insert ON nhgl.skins_buyins FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY nhgl_skins_week_payouts_insert ON nhgl.skins_week_payouts FOR INSERT TO anon, authenticated
  WITH CHECK (true);

GRANT SELECT ON ALL TABLES IN SCHEMA nhgl TO anon, authenticated;
GRANT INSERT ON nhgl.score_submissions, nhgl.skins_week_results, nhgl.skins_hole_wins, nhgl.skins_buyins, nhgl.skins_week_payouts TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA nhgl GRANT SELECT ON TABLES TO anon, authenticated;

-- Standings: regular-season points from score submissions only (matches stay schedule-only for the public)
CREATE OR REPLACE VIEW nhgl.v_regular_season_team_points AS
SELECT
  t.id AS team_id,
  t.name AS team_name,
  COALESCE(SUM(x.pts), 0)::numeric AS regular_season_points
FROM nhgl.teams t
LEFT JOIN (
  SELECT ss.team_a_id AS team_id, ss.team_a_points::numeric AS pts
  FROM nhgl.score_submissions ss
  INNER JOIN nhgl.season_weeks sw ON sw.id = ss.week_id
  WHERE sw.phase = 'regular'
  UNION ALL
  SELECT ss.team_b_id, ss.team_b_points::numeric
  FROM nhgl.score_submissions ss
  INNER JOIN nhgl.season_weeks sw ON sw.id = ss.week_id
  WHERE sw.phase = 'regular'
) x ON x.team_id = t.id
GROUP BY t.id, t.name;

GRANT SELECT ON nhgl.v_regular_season_team_points TO anon, authenticated;

CREATE OR REPLACE VIEW nhgl.v_skins_player_stats AS
SELECT
  p.id AS player_id,
  p.name AS player_name,
  (SELECT COUNT(*)::bigint FROM nhgl.skins_hole_wins h WHERE h.player_id = p.id) AS skins_won,
  COALESCE(
    (SELECT SUM(py.amount_won)::numeric FROM nhgl.skins_week_payouts py WHERE py.player_id = p.id),
    0
  ) AS money_won,
  COALESCE(
    (SELECT SUM(COALESCE(b.amount, 0))::numeric FROM nhgl.skins_buyins b WHERE b.player_id = p.id),
    0
  ) AS money_buyin,
  COALESCE(
    (SELECT SUM(py.amount_won)::numeric FROM nhgl.skins_week_payouts py WHERE py.player_id = p.id),
    0
  ) - COALESCE(
    (SELECT SUM(COALESCE(b.amount, 0))::numeric FROM nhgl.skins_buyins b WHERE b.player_id = p.id),
    0
  ) AS net_money
FROM nhgl.players p;

GRANT SELECT ON nhgl.v_skins_player_stats TO anon, authenticated;
