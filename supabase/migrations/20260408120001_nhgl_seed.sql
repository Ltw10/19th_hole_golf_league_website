-- Seed: teams, players, season weeks, matches (round-robin × 3), championship placeholder

INSERT INTO nhgl.teams (name) VALUES
  ('Luke & Jordan'),
  ('Garrett & Carson'),
  ('Allen & Tanner'),
  ('Bryson & Jake'),
  ('Crew & Tyler'),
  ('Kasen & Kason');

INSERT INTO nhgl.players (name, team_id)
SELECT p.name, t.id FROM nhgl.teams t
JOIN (VALUES
  ('Luke & Jordan', 'Luke'),
  ('Luke & Jordan', 'Jordan'),
  ('Garrett & Carson', 'Garrett'),
  ('Garrett & Carson', 'Carson'),
  ('Allen & Tanner', 'Allen'),
  ('Allen & Tanner', 'Tanner'),
  ('Bryson & Jake', 'Bryson'),
  ('Bryson & Jake', 'Jake'),
  ('Crew & Tyler', 'Crew'),
  ('Crew & Tyler', 'Tyler'),
  ('Kasen & Kason', 'Kasen'),
  ('Kasen & Kason', 'Kason')
) AS p(team_name, name) ON p.team_name = t.name;

INSERT INTO nhgl.season_weeks (week_number, week_date, phase, is_complete)
SELECT
  gs.n,
  ('2026-04-14'::date + (gs.n - 1) * interval '7 days')::date,
  CASE
    WHEN gs.n <= 3 THEN 'handicap'::nhgl.season_phase
    WHEN gs.n <= 18 THEN 'regular'::nhgl.season_phase
    ELSE 'championship'::nhgl.season_phase
  END,
  false
FROM generate_series(1, 19) AS gs(n);

-- Teams T1..T6 are roster order below. Round-robin (5 rounds × 3 matches) repeated 3× on weeks 4–18.
-- R1: T1-T2, T3-T4, T5-T6 | R2: T1-T3, T2-T5, T4-T6 | R3: T1-T4, T2-T6, T3-T5 | R4: T1-T5, T2-T4, T3-T6 | R5: T1-T6, T2-T3, T4-T5
INSERT INTO nhgl.matches (week_id, team_a_id, team_b_id, status)
SELECT sw.id, ta.id, tb.id, 'scheduled'
FROM (
  VALUES
    -- week 4–8: cycle 1
    (4, 'Luke & Jordan', 'Garrett & Carson'),
    (4, 'Allen & Tanner', 'Bryson & Jake'),
    (4, 'Crew & Tyler', 'Kasen & Kason'),
    (5, 'Luke & Jordan', 'Allen & Tanner'),
    (5, 'Garrett & Carson', 'Crew & Tyler'),
    (5, 'Bryson & Jake', 'Kasen & Kason'),
    (6, 'Luke & Jordan', 'Bryson & Jake'),
    (6, 'Garrett & Carson', 'Kasen & Kason'),
    (6, 'Allen & Tanner', 'Crew & Tyler'),
    (7, 'Luke & Jordan', 'Crew & Tyler'),
    (7, 'Garrett & Carson', 'Bryson & Jake'),
    (7, 'Allen & Tanner', 'Kasen & Kason'),
    (8, 'Luke & Jordan', 'Kasen & Kason'),
    (8, 'Garrett & Carson', 'Allen & Tanner'),
    (8, 'Bryson & Jake', 'Crew & Tyler'),
    -- weeks 9–13: cycle 2
    (9, 'Luke & Jordan', 'Garrett & Carson'),
    (9, 'Allen & Tanner', 'Bryson & Jake'),
    (9, 'Crew & Tyler', 'Kasen & Kason'),
    (10, 'Luke & Jordan', 'Allen & Tanner'),
    (10, 'Garrett & Carson', 'Crew & Tyler'),
    (10, 'Bryson & Jake', 'Kasen & Kason'),
    (11, 'Luke & Jordan', 'Bryson & Jake'),
    (11, 'Garrett & Carson', 'Kasen & Kason'),
    (11, 'Allen & Tanner', 'Crew & Tyler'),
    (12, 'Luke & Jordan', 'Crew & Tyler'),
    (12, 'Garrett & Carson', 'Bryson & Jake'),
    (12, 'Allen & Tanner', 'Kasen & Kason'),
    (13, 'Luke & Jordan', 'Kasen & Kason'),
    (13, 'Garrett & Carson', 'Allen & Tanner'),
    (13, 'Bryson & Jake', 'Crew & Tyler'),
    -- weeks 14–18: cycle 3
    (14, 'Luke & Jordan', 'Garrett & Carson'),
    (14, 'Allen & Tanner', 'Bryson & Jake'),
    (14, 'Crew & Tyler', 'Kasen & Kason'),
    (15, 'Luke & Jordan', 'Allen & Tanner'),
    (15, 'Garrett & Carson', 'Crew & Tyler'),
    (15, 'Bryson & Jake', 'Kasen & Kason'),
    (16, 'Luke & Jordan', 'Bryson & Jake'),
    (16, 'Garrett & Carson', 'Kasen & Kason'),
    (16, 'Allen & Tanner', 'Crew & Tyler'),
    (17, 'Luke & Jordan', 'Crew & Tyler'),
    (17, 'Garrett & Carson', 'Bryson & Jake'),
    (17, 'Allen & Tanner', 'Kasen & Kason'),
    (18, 'Luke & Jordan', 'Kasen & Kason'),
    (18, 'Garrett & Carson', 'Allen & Tanner'),
    (18, 'Bryson & Jake', 'Crew & Tyler')
) AS m(week_number, team_a_name, team_b_name)
JOIN nhgl.season_weeks sw ON sw.week_number = m.week_number
JOIN nhgl.teams ta ON ta.name = m.team_a_name
JOIN nhgl.teams tb ON tb.name = m.team_b_name;

-- Championship week 19 — TBD until regular season ends (top two filled by admin / refresh)
INSERT INTO nhgl.matches (week_id, team_a_id, team_b_id, status)
SELECT sw.id, NULL, NULL, 'scheduled'
FROM nhgl.season_weeks sw
WHERE sw.week_number = 19;
