-- Match outcomes may include half-points (tied holes). Store as numeric summing to 10.
-- Must drop the view first: PostgreSQL blocks ALTER COLUMN when a view rule references the column.

DROP VIEW IF EXISTS nhgl.v_regular_season_team_points;

ALTER TABLE nhgl.score_submissions DROP CONSTRAINT IF EXISTS nhgl_score_submissions_sum_10;
ALTER TABLE nhgl.score_submissions DROP CONSTRAINT IF EXISTS nhgl_score_submissions_team_a_points_check;
ALTER TABLE nhgl.score_submissions DROP CONSTRAINT IF EXISTS nhgl_score_submissions_team_b_points_check;

ALTER TABLE nhgl.score_submissions
  ALTER COLUMN team_a_points TYPE numeric(5, 2) USING round(team_a_points::numeric, 2),
  ALTER COLUMN team_b_points TYPE numeric(5, 2) USING round(team_b_points::numeric, 2);

ALTER TABLE nhgl.score_submissions
  ADD CONSTRAINT nhgl_score_submissions_team_a_points_range CHECK (
    team_a_points >= 0 AND team_a_points <= 10
  ),
  ADD CONSTRAINT nhgl_score_submissions_team_b_points_range CHECK (
    team_b_points >= 0 AND team_b_points <= 10
  ),
  ADD CONSTRAINT nhgl_score_submissions_sum_10 CHECK (
    round(team_a_points + team_b_points, 2) = 10
  );

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
