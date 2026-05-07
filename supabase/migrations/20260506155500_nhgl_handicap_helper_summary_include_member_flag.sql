-- Include player membership flag in handicap helper summary.

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
INNER JOIN nhgl.teams t ON t.id = p.team_id
INNER JOIN ranked ON ranked.player_id = p.id AND ranked.rn <= 5
INNER JOIN submitted s ON s.player_id = p.id
WHERE t.name <> 'Skins substitutes'
GROUP BY p.id, p.name, s.rounds_submitted, p.is_league_member;

GRANT SELECT ON nhgl.v_handicap_helper_summary TO anon, authenticated;
