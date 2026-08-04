-- Unify "Skins substitutes" + "Handicap helper" into one "Substitutes" guest team.
-- Matchup add-guest and Handicap helper add-name both create players on this team.

INSERT INTO nhgl.teams (name)
VALUES ('Substitutes')
ON CONFLICT (name) DO NOTHING;

UPDATE nhgl.players p
SET
  team_id = (SELECT id FROM nhgl.teams WHERE name = 'Substitutes' LIMIT 1),
  is_league_member = false
WHERE p.team_id IN (
  SELECT id FROM nhgl.teams WHERE name IN ('Skins substitutes', 'Handicap helper')
);

DELETE FROM nhgl.teams t
WHERE t.name IN ('Skins substitutes', 'Handicap helper')
  AND NOT EXISTS (SELECT 1 FROM nhgl.players p WHERE p.team_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM nhgl.matches m WHERE m.team_a_id = t.id OR m.team_b_id = t.id);

CREATE OR REPLACE FUNCTION nhgl.create_substitute_player(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
DECLARE
  v_team_id uuid;
  v_id uuid;
  v_trim text;
BEGIN
  v_trim := trim(p_name);
  IF v_trim = '' THEN
    RAISE EXCEPTION 'Player name is required.';
  END IF;

  SELECT id INTO v_team_id FROM nhgl.teams WHERE name = 'Substitutes' LIMIT 1;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Substitutes team missing — apply migrations.';
  END IF;

  INSERT INTO nhgl.players (name, team_id, is_league_member)
  VALUES (v_trim, v_team_id, false)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A player named "%" already exists.', v_trim;
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.create_substitute_player(text) TO anon, authenticated;

-- Keep legacy RPC names as thin wrappers (older clients / cached bundles).
CREATE OR REPLACE FUNCTION nhgl.create_skins_substitute_player(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
BEGIN
  RETURN nhgl.create_substitute_player(p_name);
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.create_skins_substitute_player(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION nhgl.create_handicap_helper_player(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
BEGIN
  RETURN nhgl.create_substitute_player(p_name);
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.create_handicap_helper_player(text) TO anon, authenticated;

-- Include all players with helper scores (substitutes + league members).
DROP VIEW IF EXISTS nhgl.v_handicap_helper_summary;

CREATE VIEW nhgl.v_handicap_helper_summary AS
WITH ranked AS (
  SELECT
    h.player_id,
    (h.score - h.par)::numeric AS versus_par,
    ROW_NUMBER() OVER (
      PARTITION BY h.player_id
      ORDER BY h.played_date DESC, h.created_at DESC
    ) AS rn
  FROM nhgl.handicap_helper_scores h
),
submitted AS (
  SELECT h.player_id, COUNT(*)::int AS rounds_submitted
  FROM nhgl.handicap_helper_scores h
  GROUP BY h.player_id
)
SELECT
  p.id AS player_id,
  p.name AS player_name,
  ROUND((AVG(ranked.versus_par) * 0.8)::numeric)::int AS handicap,
  COUNT(*)::int AS rounds_in_avg,
  s.rounds_submitted,
  p.is_league_member
FROM nhgl.players p
INNER JOIN ranked ON ranked.player_id = p.id AND ranked.rn <= 5
INNER JOIN submitted s ON s.player_id = p.id
GROUP BY p.id, p.name, s.rounds_submitted, p.is_league_member;

GRANT SELECT ON nhgl.v_handicap_helper_summary TO anon, authenticated;

-- Guest bucket must not appear in regular-season standings.
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
WHERE t.name <> 'Substitutes'
GROUP BY t.id, t.name;

GRANT SELECT ON nhgl.v_regular_season_team_points TO anon, authenticated;
