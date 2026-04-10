-- Ensure skins-only team never appears in v_regular_season_team_points (repair for older DBs).
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
WHERE t.name <> 'Skins substitutes'
GROUP BY t.id, t.name;

GRANT SELECT ON nhgl.v_regular_season_team_points TO anon, authenticated;
