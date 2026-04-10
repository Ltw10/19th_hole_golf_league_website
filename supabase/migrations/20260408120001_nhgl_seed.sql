-- Seed: league teams, skins substitute team, players, 16 weeks (15 regular + championship), matches

INSERT INTO nhgl.teams (name) VALUES
  ('Luke & Jordan'),
  ('Garrett & Carson'),
  ('Allen & Tanner'),
  ('Bryson & Jake'),
  ('Crew & Tyler'),
  ('Kasen & Kason'),
  ('Skins substitutes');

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

-- Week 1 starts 2026-04-14 (no separate handicap weeks in schedule).
INSERT INTO nhgl.season_weeks (week_number, week_date, phase, is_complete)
SELECT
  gs.n,
  ('2026-04-14'::date + (gs.n + 2) * interval '7 days')::date,
  CASE
    WHEN gs.n <= 15 THEN 'regular'::nhgl.season_phase
    ELSE 'championship'::nhgl.season_phase
  END,
  false
FROM generate_series(1, 16) AS gs(n);

-- Round-robin (5 rounds × 3 matches) repeated 3× on weeks 1–15.
INSERT INTO nhgl.matches (week_id, team_a_id, team_b_id, status)
SELECT sw.id, ta.id, tb.id, 'scheduled'
FROM (
  VALUES
    (1, 'Luke & Jordan', 'Garrett & Carson'),
    (1, 'Allen & Tanner', 'Bryson & Jake'),
    (1, 'Crew & Tyler', 'Kasen & Kason'),
    (2, 'Luke & Jordan', 'Allen & Tanner'),
    (2, 'Garrett & Carson', 'Crew & Tyler'),
    (2, 'Bryson & Jake', 'Kasen & Kason'),
    (3, 'Luke & Jordan', 'Bryson & Jake'),
    (3, 'Garrett & Carson', 'Kasen & Kason'),
    (3, 'Allen & Tanner', 'Crew & Tyler'),
    (4, 'Luke & Jordan', 'Crew & Tyler'),
    (4, 'Garrett & Carson', 'Bryson & Jake'),
    (4, 'Allen & Tanner', 'Kasen & Kason'),
    (5, 'Luke & Jordan', 'Kasen & Kason'),
    (5, 'Garrett & Carson', 'Allen & Tanner'),
    (5, 'Bryson & Jake', 'Crew & Tyler'),
    (6, 'Luke & Jordan', 'Garrett & Carson'),
    (6, 'Allen & Tanner', 'Bryson & Jake'),
    (6, 'Crew & Tyler', 'Kasen & Kason'),
    (7, 'Luke & Jordan', 'Allen & Tanner'),
    (7, 'Garrett & Carson', 'Crew & Tyler'),
    (7, 'Bryson & Jake', 'Kasen & Kason'),
    (8, 'Luke & Jordan', 'Bryson & Jake'),
    (8, 'Garrett & Carson', 'Kasen & Kason'),
    (8, 'Allen & Tanner', 'Crew & Tyler'),
    (9, 'Luke & Jordan', 'Crew & Tyler'),
    (9, 'Garrett & Carson', 'Bryson & Jake'),
    (9, 'Allen & Tanner', 'Kasen & Kason'),
    (10, 'Luke & Jordan', 'Kasen & Kason'),
    (10, 'Garrett & Carson', 'Allen & Tanner'),
    (10, 'Bryson & Jake', 'Crew & Tyler'),
    (11, 'Luke & Jordan', 'Garrett & Carson'),
    (11, 'Allen & Tanner', 'Bryson & Jake'),
    (11, 'Crew & Tyler', 'Kasen & Kason'),
    (12, 'Luke & Jordan', 'Allen & Tanner'),
    (12, 'Garrett & Carson', 'Crew & Tyler'),
    (12, 'Bryson & Jake', 'Kasen & Kason'),
    (13, 'Luke & Jordan', 'Bryson & Jake'),
    (13, 'Garrett & Carson', 'Kasen & Kason'),
    (13, 'Allen & Tanner', 'Crew & Tyler'),
    (14, 'Luke & Jordan', 'Crew & Tyler'),
    (14, 'Garrett & Carson', 'Bryson & Jake'),
    (14, 'Allen & Tanner', 'Kasen & Kason'),
    (15, 'Luke & Jordan', 'Kasen & Kason'),
    (15, 'Garrett & Carson', 'Allen & Tanner'),
    (15, 'Bryson & Jake', 'Crew & Tyler')
) AS m(week_number, team_a_name, team_b_name)
JOIN nhgl.season_weeks sw ON sw.week_number = m.week_number
JOIN nhgl.teams ta ON ta.name = m.team_a_name
JOIN nhgl.teams tb ON tb.name = m.team_b_name;

-- Championship week: teams set when regular season ends (admin / refresh)
INSERT INTO nhgl.matches (week_id, team_a_id, team_b_id, status)
SELECT sw.id, NULL, NULL, 'scheduled'
FROM nhgl.season_weeks sw
WHERE sw.week_number = 16;
