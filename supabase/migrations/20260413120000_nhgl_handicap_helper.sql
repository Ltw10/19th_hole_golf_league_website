-- Handicap helper: personal 9-hole (or other) scores; rolling average of last 5 for display.

CREATE TABLE nhgl.handicap_helper_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES nhgl.players (id) ON DELETE CASCADE,
  played_date date NOT NULL,
  score int NOT NULL CHECK (score >= 18 AND score <= 200),
  par int NOT NULL DEFAULT 36 CHECK (par >= 18 AND par <= 144),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nhgl_handicap_helper_scores_player_idx ON nhgl.handicap_helper_scores (player_id);
CREATE INDEX nhgl_handicap_helper_scores_player_date_idx ON nhgl.handicap_helper_scores (player_id, played_date DESC, created_at DESC);

ALTER TABLE nhgl.handicap_helper_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhgl_handicap_helper_scores_select ON nhgl.handicap_helper_scores FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY nhgl_handicap_helper_scores_insert ON nhgl.handicap_helper_scores FOR INSERT TO anon, authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT ON nhgl.handicap_helper_scores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nhgl.handicap_helper_scores TO service_role;

-- One row per league player who has at least one score; handicap = avg (score - par) over up to 5 most recent rounds.
CREATE OR REPLACE VIEW nhgl.v_handicap_helper_summary AS
WITH ranked AS (
  SELECT
    h.player_id,
    (h.score - h.par)::numeric AS versus_par,
    ROW_NUMBER() OVER (
      PARTITION BY h.player_id
      ORDER BY h.played_date DESC, h.created_at DESC
    ) AS rn
  FROM nhgl.handicap_helper_scores h
)
SELECT
  p.id AS player_id,
  p.name AS player_name,
  ROUND(AVG(ranked.versus_par)::numeric, 1) AS handicap,
  COUNT(*)::int AS rounds_in_avg
FROM nhgl.players p
INNER JOIN nhgl.teams t ON t.id = p.team_id
INNER JOIN ranked ON ranked.player_id = p.id AND ranked.rn <= 5
WHERE t.name <> 'Skins substitutes'
GROUP BY p.id, p.name;

GRANT SELECT ON nhgl.v_handicap_helper_summary TO anon, authenticated;
