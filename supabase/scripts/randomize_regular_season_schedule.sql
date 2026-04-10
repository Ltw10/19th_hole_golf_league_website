-- Randomize regular-season matchups (weeks 1–15) by permuting the 5 round-robin rounds
-- across three cycles, so the order is not identical every 5 weeks.
--
-- Constraint: consecutive weeks must not use the same round template. If two weeks in a row
-- shared the same round, every pairing would repeat (same opponent two weeks in a row).
--
-- Run against your DB (e.g. psql or Supabase SQL editor). The script opens a transaction;
-- change the final COMMIT to ROLLBACK to dry-run (updates are visible only until rollback in
-- the same session when using psql with a single transaction block).
--
-- SAFETY: Refuses to run if any week 1–15 match already has a score_submissions row.

BEGIN;

DO $$
DECLARE
  match_count int;
BEGIN
  SELECT COUNT(*) INTO match_count
  FROM nhgl.matches m
  INNER JOIN nhgl.season_weeks sw ON sw.id = m.week_id
  WHERE sw.week_number BETWEEN 1 AND 15
    AND m.team_a_id IS NOT NULL
    AND m.team_b_id IS NOT NULL;

  IF match_count <> 45 THEN
    RAISE EXCEPTION
      'Expected 45 regular-season matches (15 weeks × 3), found %.',
      match_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM nhgl.score_submissions ss
    INNER JOIN nhgl.matches m ON m.id = ss.match_id
    INNER JOIN nhgl.season_weeks sw ON sw.id = m.week_id
    WHERE sw.week_number BETWEEN 1 AND 15
  ) THEN
    RAISE EXCEPTION
      'Refusing to reshuffle: score submissions exist for regular-season matches (weeks 1–15).';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM nhgl.matches m
    INNER JOIN nhgl.season_weeks sw ON sw.id = m.week_id
    WHERE sw.week_number BETWEEN 1 AND 15
      AND m.status = 'final'
  ) THEN
    RAISE EXCEPTION
      'Refusing to reshuffle: at least one regular-season match is marked final.';
  END IF;
END $$;

-- Five rounds × 3 matches (same pairings as the original seed; only week order changes).
WITH round_pairings AS (
  SELECT *
  FROM (
    VALUES
      (1, 1, 'Luke & Jordan'::text, 'Garrett & Carson'::text),
      (1, 2, 'Allen & Tanner', 'Bryson & Jake'),
      (1, 3, 'Crew & Tyler', 'Kasen & Kason'),
      (2, 1, 'Luke & Jordan', 'Allen & Tanner'),
      (2, 2, 'Garrett & Carson', 'Crew & Tyler'),
      (2, 3, 'Bryson & Jake', 'Kasen & Kason'),
      (3, 1, 'Luke & Jordan', 'Bryson & Jake'),
      (3, 2, 'Garrett & Carson', 'Kasen & Kason'),
      (3, 3, 'Allen & Tanner', 'Crew & Tyler'),
      (4, 1, 'Luke & Jordan', 'Crew & Tyler'),
      (4, 2, 'Garrett & Carson', 'Bryson & Jake'),
      (4, 3, 'Allen & Tanner', 'Kasen & Kason'),
      (5, 1, 'Luke & Jordan', 'Kasen & Kason'),
      (5, 2, 'Garrett & Carson', 'Allen & Tanner'),
      (5, 3, 'Bryson & Jake', 'Crew & Tyler')
  ) AS t(round_idx, pairing_order, team_a_name, team_b_name)
),
-- Cycle 1: 1,2,3,4,5 — Cycle 2: 2,4,1,3,5 — Cycle 3: 1,3,5,2,4
-- (consecutive weeks always differ; week 5→6 and 10→11 do not repeat a round).
week_round AS (
  SELECT *
  FROM (
    VALUES
      (1, 1),
      (2, 2),
      (3, 3),
      (4, 4),
      (5, 5),
      (6, 2),
      (7, 4),
      (8, 1),
      (9, 3),
      (10, 5),
      (11, 1),
      (12, 3),
      (13, 5),
      (14, 2),
      (15, 4)
  ) AS w(week_number, round_idx)
),
matches_numbered AS (
  SELECT
    m.id AS match_id,
    sw.week_number,
    row_number() OVER (
      PARTITION BY m.week_id
      ORDER BY m.id
    )::int AS slot
  FROM nhgl.matches m
  INNER JOIN nhgl.season_weeks sw ON sw.id = m.week_id
  WHERE sw.week_number BETWEEN 1 AND 15
    AND m.team_a_id IS NOT NULL
    AND m.team_b_id IS NOT NULL
),
targets AS (
  SELECT
    mn.match_id,
    ta.id AS team_a_id,
    tb.id AS team_b_id
  FROM matches_numbered mn
  INNER JOIN week_round wr
    ON wr.week_number = mn.week_number
  INNER JOIN round_pairings rp
    ON rp.round_idx = wr.round_idx
    AND rp.pairing_order = mn.slot
  INNER JOIN nhgl.teams ta ON ta.name = rp.team_a_name
  INNER JOIN nhgl.teams tb ON tb.name = rp.team_b_name
)
UPDATE nhgl.matches m
SET
  team_a_id = t.team_a_id,
  team_b_id = t.team_b_id
FROM targets t
WHERE m.id = t.match_id;

-- Expect 45 rows updated (15 weeks × 3 matches).

COMMIT;
