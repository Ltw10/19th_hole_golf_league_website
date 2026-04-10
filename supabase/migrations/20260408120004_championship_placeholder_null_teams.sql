-- Championship match: no teams until top two are set (replaces older seed that used placeholder teams)

UPDATE nhgl.matches m
SET team_a_id = NULL, team_b_id = NULL
FROM nhgl.season_weeks sw
WHERE m.week_id = sw.id
  AND sw.week_number = 19
  AND m.team_a_id IS NOT NULL;
