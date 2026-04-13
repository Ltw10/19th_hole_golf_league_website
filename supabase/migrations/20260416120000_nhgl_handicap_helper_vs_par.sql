-- Handicap = average strokes over/under par (score - par), not average raw score.

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
