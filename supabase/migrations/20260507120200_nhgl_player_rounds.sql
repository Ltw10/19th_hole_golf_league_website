-- Per-player per-week round: hole-by-hole strokes, skins opt-in, optional scorecard URL.
-- match_scorecards: one image per match (latest upload wins via RPC).

CREATE TABLE nhgl.player_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES nhgl.season_weeks (id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES nhgl.matches (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES nhgl.players (id) ON DELETE CASCADE,
  played_for_team_id uuid NOT NULL REFERENCES nhgl.teams (id) ON DELETE CASCADE,
  played_skins boolean NOT NULL DEFAULT false,
  scorecard_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, player_id)
);

CREATE INDEX nhgl_player_rounds_week_idx ON nhgl.player_rounds (week_id);
CREATE INDEX nhgl_player_rounds_match_idx ON nhgl.player_rounds (match_id);

CREATE TABLE nhgl.player_hole_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_round_id uuid NOT NULL REFERENCES nhgl.player_rounds (id) ON DELETE CASCADE,
  hole_number int NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  strokes int NOT NULL CHECK (strokes >= 1 AND strokes <= 20),
  UNIQUE (player_round_id, hole_number)
);

CREATE INDEX nhgl_player_hole_scores_round_idx ON nhgl.player_hole_scores (player_round_id);

CREATE TABLE nhgl.match_scorecards (
  match_id uuid PRIMARY KEY REFERENCES nhgl.matches (id) ON DELETE CASCADE,
  image_url text NOT NULL,
  uploaded_by_player_id uuid REFERENCES nhgl.players (id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nhgl.player_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.player_hole_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.match_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhgl_player_rounds_select ON nhgl.player_rounds FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_player_hole_scores_select ON nhgl.player_hole_scores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_match_scorecards_select ON nhgl.match_scorecards FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON nhgl.player_rounds, nhgl.player_hole_scores, nhgl.match_scorecards TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nhgl.player_rounds, nhgl.player_hole_scores, nhgl.match_scorecards TO service_role;
