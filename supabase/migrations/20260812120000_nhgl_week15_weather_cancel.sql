-- Week 15 cancelled (tornado warning / severe storms). Shift remaining calendar:
-- Week 16 becomes final regular-season week; championship moves to week 17.

ALTER TABLE nhgl.season_weeks
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

-- Drop championship placeholder on week 16 before moving postponed matchups onto it.
DELETE FROM nhgl.matches m
USING nhgl.season_weeks sw
WHERE m.week_id = sw.id
  AND sw.week_number = 16
  AND sw.phase = 'championship'
  AND m.team_a_id IS NULL
  AND m.team_b_id IS NULL;

-- Postponed Week 15 matchups play on Week 16.
UPDATE nhgl.matches m
SET week_id = w16.id
FROM nhgl.season_weeks w15
CROSS JOIN nhgl.season_weeks w16
WHERE m.week_id = w15.id
  AND w15.week_number = 15
  AND w16.week_number = 16;

UPDATE nhgl.season_weeks
SET
  is_cancelled = true,
  is_complete = true,
  notes = 'Cancelled — tornado warning and severe thunderstorms. Matchups postponed to Week 16.'
WHERE week_number = 15;

UPDATE nhgl.season_weeks
SET
  phase = 'regular',
  notes = 'Final regular-season week (Week 15 matchups postponed from Aug 11 weather cancel).'
WHERE week_number = 16;

-- Championship one week later (Tuesday after Week 16).
INSERT INTO nhgl.season_weeks (week_number, week_date, phase, is_complete, notes)
SELECT
  17,
  (w16.week_date + interval '7 days')::date,
  'championship'::nhgl.season_phase,
  false,
  'Championship — top two teams by Regular Season points.'
FROM nhgl.season_weeks w16
WHERE w16.week_number = 16
  AND NOT EXISTS (
    SELECT 1 FROM nhgl.season_weeks WHERE week_number = 17
  );

INSERT INTO nhgl.matches (week_id, team_a_id, team_b_id, status)
SELECT sw.id, NULL, NULL, 'scheduled'
FROM nhgl.season_weeks sw
WHERE sw.week_number = 17
  AND NOT EXISTS (
    SELECT 1 FROM nhgl.matches m WHERE m.week_id = sw.id
  );

-- Cancelled weeks must not count toward regular-season standings.
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
    AND NOT sw.is_cancelled
  UNION ALL
  SELECT ss.team_b_id, ss.team_b_points::numeric
  FROM nhgl.score_submissions ss
  INNER JOIN nhgl.season_weeks sw ON sw.id = ss.week_id
  WHERE sw.phase = 'regular'
    AND NOT sw.is_cancelled
) x ON x.team_id = t.id
WHERE t.name <> 'Substitutes'
GROUP BY t.id, t.name;

GRANT SELECT ON nhgl.v_regular_season_team_points TO anon, authenticated;
