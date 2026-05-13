-- Front nine vs back nine: store choice on each round; extend course to 18 holes for stroke index / par.

ALTER TABLE nhgl.player_rounds
  ADD COLUMN IF NOT EXISTS which_nine text NOT NULL DEFAULT 'front'
    CHECK (which_nine IN ('front', 'back'));

COMMENT ON COLUMN nhgl.player_rounds.which_nine IS 'Which side was played: front (holes 1–9) or back (holes 10–18).';

INSERT INTO nhgl.course_holes (course_id, hole_number, par, stroke_index)
SELECT c.id, gs.n, 4, gs.n
FROM nhgl.courses c
CROSS JOIN generate_series(10, 18) AS gs(n)
WHERE c.name = 'Hickory Sticks'
ON CONFLICT (course_id, hole_number) DO NOTHING;

-- Replace stroke helper: handicap strokes apply within the nine holes played (stroke index ranked within that side).
DROP FUNCTION IF EXISTS nhgl._strokes_received_on_hole(uuid, int, int);

CREATE OR REPLACE FUNCTION nhgl._strokes_received_on_hole(
  p_course_id uuid,
  p_handicap_eff int,
  p_hole_number int,
  p_which_nine text DEFAULT 'front'
) RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = nhgl, public
AS $$
DECLARE
  v_base int;
  v_extra int;
  v_si int;
  v_lower int;
  v_min_hole int;
  v_max_hole int;
  w text;
BEGIN
  v_base := p_handicap_eff / 9;
  v_extra := p_handicap_eff % 9;
  w := lower(trim(coalesce(p_which_nine, 'front')));
  IF w = 'back' THEN
    v_min_hole := 10;
    v_max_hole := 18;
  ELSE
    v_min_hole := 1;
    v_max_hole := 9;
  END IF;
  IF p_hole_number < v_min_hole OR p_hole_number > v_max_hole THEN
    RETURN v_base;
  END IF;
  IF v_extra = 0 THEN
    RETURN v_base;
  END IF;
  SELECT stroke_index INTO v_si
  FROM nhgl.course_holes
  WHERE course_id = p_course_id AND hole_number = p_hole_number;
  IF v_si IS NULL THEN
    RETURN v_base;
  END IF;
  SELECT COUNT(*)::int INTO v_lower
  FROM nhgl.course_holes ch
  WHERE ch.course_id = p_course_id
    AND ch.hole_number BETWEEN v_min_hole AND v_max_hole
    AND ch.stroke_index < v_si;
  IF v_lower < v_extra THEN
    RETURN v_base + 1;
  END IF;
  RETURN v_base;
END;
$$;

CREATE OR REPLACE FUNCTION nhgl._hole_net_for_round(
  p_round_id uuid,
  p_hole_number int,
  p_exclude_played_date date,
  p_course_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = nhgl, public
AS $$
DECLARE
  v_pid uuid;
  v_gross int;
  v_h int;
  v_str int;
  v_which text;
BEGIN
  SELECT player_id, coalesce(which_nine, 'front') INTO v_pid, v_which
  FROM nhgl.player_rounds WHERE id = p_round_id;
  SELECT strokes INTO v_gross
  FROM nhgl.player_hole_scores
  WHERE player_round_id = p_round_id AND hole_number = p_hole_number;
  IF v_gross IS NULL THEN
    RETURN NULL;
  END IF;
  v_h := GREATEST(0, nhgl._handicap_for_strokes(v_pid, p_exclude_played_date));
  v_str := nhgl._strokes_received_on_hole(p_course_id, v_h, p_hole_number, v_which);
  RETURN v_gross::numeric - v_str::numeric;
END;
$$;

CREATE OR REPLACE FUNCTION nhgl._recompute_skins_for_week(p_week_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
DECLARE
  v_week_date date;
  v_course_id uuid;
  v_buyin numeric;
  slot int;
  min_net numeric;
  win_count int;
  winner uuid;
  skin_total int := 0;
  total_pot numeric;
  buyer_count int;
  v_actual int;
  v_which text;
  distinct_nines int;
BEGIN
  DELETE FROM nhgl.skins_hole_wins WHERE week_id = p_week_id;
  DELETE FROM nhgl.skins_buyins WHERE week_id = p_week_id;
  DELETE FROM nhgl.skins_week_payouts WHERE week_id = p_week_id;
  DELETE FROM nhgl.skins_week_results WHERE week_id = p_week_id;

  SELECT week_date INTO v_week_date FROM nhgl.season_weeks WHERE id = p_week_id;
  IF v_week_date IS NULL THEN
    RETURN;
  END IF;

  v_course_id := nhgl._default_course_id();
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'No default course — apply migrations and seed Hickory Sticks.';
  END IF;

  v_buyin := nhgl._skins_buyin_amount();

  SELECT COUNT(*) INTO buyer_count
  FROM nhgl.player_rounds pr
  WHERE pr.week_id = p_week_id AND pr.played_skins = true;

  IF buyer_count = 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT coalesce(which_nine, 'front')) INTO distinct_nines
  FROM nhgl.player_rounds pr
  WHERE pr.week_id = p_week_id AND pr.played_skins = true;

  IF distinct_nines > 1 THEN
    RAISE EXCEPTION 'All skins players for this week must select the same nine (front or back).';
  END IF;

  SELECT coalesce(which_nine, 'front') INTO v_which
  FROM nhgl.player_rounds pr
  WHERE pr.week_id = p_week_id AND pr.played_skins = true
  LIMIT 1;

  INSERT INTO nhgl.skins_week_results (week_id, notes) VALUES (p_week_id, NULL);

  DROP TABLE IF EXISTS _skins_net;
  CREATE TEMP TABLE _skins_net (
    player_id uuid NOT NULL,
    hole int NOT NULL,
    net numeric NOT NULL,
    PRIMARY KEY (player_id, hole)
  ) ON COMMIT DROP;

  INSERT INTO _skins_net (player_id, hole, net)
  SELECT
    pr.player_id,
    phs.hole_number,
    phs.strokes::numeric
      - nhgl._strokes_received_on_hole(
          v_course_id,
          GREATEST(0, nhgl._handicap_for_strokes(pr.player_id, v_week_date)),
          phs.hole_number,
          coalesce(pr.which_nine, 'front')
        )::numeric
  FROM nhgl.player_rounds pr
  INNER JOIN nhgl.player_hole_scores phs ON phs.player_round_id = pr.id
  WHERE pr.week_id = p_week_id AND pr.played_skins = true;

  FOR slot IN 1..9 LOOP
    v_actual := CASE WHEN lower(trim(coalesce(v_which, 'front'))) = 'back' THEN slot + 9 ELSE slot END;
    SELECT MIN(net) INTO min_net FROM _skins_net WHERE hole = v_actual;
    IF min_net IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COUNT(DISTINCT player_id) INTO win_count
    FROM _skins_net
    WHERE hole = v_actual AND net = min_net;

    IF win_count <> 1 THEN
      CONTINUE;
    END IF;

    SELECT player_id INTO winner FROM _skins_net WHERE hole = v_actual AND net = min_net LIMIT 1;
    skin_total := skin_total + 1;
    INSERT INTO nhgl.skins_hole_wins (week_id, player_id, hole) VALUES (p_week_id, winner, v_actual);
  END LOOP;

  INSERT INTO nhgl.skins_buyins (week_id, player_id, amount)
  SELECT pr.week_id, pr.player_id, v_buyin
  FROM nhgl.player_rounds pr
  WHERE pr.week_id = p_week_id AND pr.played_skins = true;

  total_pot := v_buyin * buyer_count::numeric;

  IF skin_total > 0 AND total_pot > 0 THEN
    INSERT INTO nhgl.skins_week_payouts (week_id, player_id, amount_won)
    SELECT
      p_week_id,
      w.player_id,
      ROUND((total_pot * COUNT(*)::numeric / skin_total::numeric)::numeric, 2)
    FROM nhgl.skins_hole_wins w
    WHERE w.week_id = p_week_id
    GROUP BY w.player_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION nhgl._recompute_match_points(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
DECLARE
  v_week_id uuid;
  v_week_date date;
  v_course_id uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_cnt int;
  pa1 uuid;
  pa2 uuid;
  pb1 uuid;
  pb2 uuid;
  ra1 uuid;
  ra2 uuid;
  rb1 uuid;
  rb2 uuid;
  h int;
  v_actual int;
  v_which text;
  distinct_nines int;
  na numeric;
  nb numeric;
  pts_a numeric := 0;
  pts_b numeric := 0;
  tot_a numeric := 0;
  tot_b numeric := 0;
  card_url text;
BEGIN
  SELECT m.week_id, m.team_a_id, m.team_b_id
  INTO v_week_id, v_team_a, v_team_b
  FROM nhgl.matches m
  WHERE m.id = p_match_id;

  IF v_team_a IS NULL OR v_team_b IS NULL THEN
    RETURN;
  END IF;

  SELECT week_date INTO v_week_date FROM nhgl.season_weeks WHERE id = v_week_id;
  v_course_id := nhgl._default_course_id();

  SELECT COUNT(*) INTO v_cnt FROM nhgl.player_rounds pr WHERE pr.match_id = p_match_id;
  IF v_cnt <> 4 THEN
    DELETE FROM nhgl.score_submissions WHERE match_id = p_match_id;
    RETURN;
  END IF;

  SELECT player_id, id INTO pa1, ra1 FROM nhgl.player_rounds
  WHERE match_id = p_match_id AND played_for_team_id = v_team_a ORDER BY player_id LIMIT 1;
  SELECT player_id, id INTO pa2, ra2 FROM nhgl.player_rounds
  WHERE match_id = p_match_id AND played_for_team_id = v_team_a ORDER BY player_id LIMIT 1 OFFSET 1;
  SELECT player_id, id INTO pb1, rb1 FROM nhgl.player_rounds
  WHERE match_id = p_match_id AND played_for_team_id = v_team_b ORDER BY player_id LIMIT 1;
  SELECT player_id, id INTO pb2, rb2 FROM nhgl.player_rounds
  WHERE match_id = p_match_id AND played_for_team_id = v_team_b ORDER BY player_id LIMIT 1 OFFSET 1;

  IF pa1 IS NULL OR pa2 IS NULL OR pb1 IS NULL OR pb2 IS NULL THEN
    RAISE EXCEPTION 'Match requires two players per team.';
  END IF;

  SELECT COUNT(DISTINCT coalesce(which_nine, 'front')) INTO distinct_nines
  FROM nhgl.player_rounds WHERE match_id = p_match_id;

  IF distinct_nines > 1 THEN
    RAISE EXCEPTION 'All four players in a match must play the same nine (front or back).';
  END IF;

  SELECT coalesce(which_nine, 'front') INTO v_which FROM nhgl.player_rounds WHERE id = ra1;

  FOR h IN 1..9 LOOP
    v_actual := CASE WHEN lower(trim(coalesce(v_which, 'front'))) = 'back' THEN h + 9 ELSE h END;
    na := COALESCE(nhgl._hole_net_for_round(ra1, v_actual, v_week_date, v_course_id), 0)
      + COALESCE(nhgl._hole_net_for_round(ra2, v_actual, v_week_date, v_course_id), 0);
    nb := COALESCE(nhgl._hole_net_for_round(rb1, v_actual, v_week_date, v_course_id), 0)
      + COALESCE(nhgl._hole_net_for_round(rb2, v_actual, v_week_date, v_course_id), 0);
    tot_a := tot_a + na;
    tot_b := tot_b + nb;
    IF na < nb THEN
      pts_a := pts_a + 1;
    ELSIF nb < na THEN
      pts_b := pts_b + 1;
    ELSE
      pts_a := pts_a + 0.5;
      pts_b := pts_b + 0.5;
    END IF;
  END LOOP;

  IF tot_a < tot_b THEN
    pts_a := pts_a + 1;
  ELSIF tot_b < tot_a THEN
    pts_b := pts_b + 1;
  ELSE
    pts_a := pts_a + 0.5;
    pts_b := pts_b + 0.5;
  END IF;

  SELECT image_url INTO card_url FROM nhgl.match_scorecards WHERE match_id = p_match_id LIMIT 1;

  INSERT INTO nhgl.score_submissions (
    week_id,
    match_id,
    team_a_id,
    team_b_id,
    team_a_points,
    team_b_points,
    scorecard_image_url,
    notes,
    submitter_label,
    submitted_by_player_id
  )
  VALUES (
    v_week_id,
    p_match_id,
    v_team_a,
    v_team_b,
    ROUND(pts_a::numeric, 2),
    ROUND(pts_b::numeric, 2),
    card_url,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (match_id) DO UPDATE SET
    week_id = EXCLUDED.week_id,
    team_a_id = EXCLUDED.team_a_id,
    team_b_id = EXCLUDED.team_b_id,
    team_a_points = EXCLUDED.team_a_points,
    team_b_points = EXCLUDED.team_b_points,
    scorecard_image_url = COALESCE(EXCLUDED.scorecard_image_url, nhgl.score_submissions.scorecard_image_url);
END;
$$;

DROP FUNCTION IF EXISTS nhgl.submit_player_round(uuid, uuid, uuid, uuid, boolean, jsonb, text);

CREATE OR REPLACE FUNCTION nhgl.submit_player_round(
  p_week_id uuid,
  p_player_id uuid,
  p_match_id uuid,
  p_played_for_team_id uuid,
  p_played_skins boolean,
  p_holes jsonb,
  p_scorecard_image_url text DEFAULT NULL,
  p_which_nine text DEFAULT 'front'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
DECLARE
  v_week_date date;
  v_course_id uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_match_week uuid;
  v_round_id uuid;
  sum_gross int := 0;
  sum_par int := 0;
  elem jsonb;
  hn int;
  st int;
  v_par int;
  actual_hole int;
  v_side text;
  seen int[] := ARRAY[]::int[];
  hole_list int[];
BEGIN
  IF p_week_id IS NULL OR p_player_id IS NULL OR p_match_id IS NULL OR p_played_for_team_id IS NULL THEN
    RAISE EXCEPTION 'week_id, player_id, match_id, and played_for_team_id are required.';
  END IF;

  v_side := lower(trim(coalesce(p_which_nine, 'front')));
  IF v_side NOT IN ('front', 'back') THEN
    RAISE EXCEPTION 'which_nine must be front or back.';
  END IF;

  SELECT week_date INTO v_week_date FROM nhgl.season_weeks WHERE id = p_week_id;
  IF v_week_date IS NULL THEN
    RAISE EXCEPTION 'Invalid week_id.';
  END IF;

  SELECT m.team_a_id, m.team_b_id, m.week_id
  INTO v_team_a, v_team_b, v_match_week
  FROM nhgl.matches m
  WHERE m.id = p_match_id;

  IF v_match_week IS DISTINCT FROM p_week_id THEN
    RAISE EXCEPTION 'match does not belong to this week.';
  END IF;

  IF p_played_for_team_id NOT IN (v_team_a, v_team_b) THEN
    RAISE EXCEPTION 'played_for_team_id must be one of the teams in this match.';
  END IF;

  v_course_id := nhgl._default_course_id();
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'No default course configured.';
  END IF;

  DELETE FROM nhgl.handicap_helper_scores h
  WHERE h.player_id = p_player_id AND h.played_date = v_week_date;

  DELETE FROM nhgl.player_rounds pr
  WHERE pr.week_id = p_week_id AND pr.player_id = p_player_id;

  INSERT INTO nhgl.player_rounds (
    week_id,
    match_id,
    player_id,
    played_for_team_id,
    played_skins,
    scorecard_image_url,
    which_nine
  )
  VALUES (
    p_week_id,
    p_match_id,
    p_player_id,
    p_played_for_team_id,
    p_played_skins,
    NULLIF(trim(p_scorecard_image_url), ''),
    v_side
  )
  RETURNING id INTO v_round_id;

  FOR elem IN SELECT * FROM jsonb_array_elements(coalesce(p_holes, '[]'::jsonb))
  LOOP
    hn := (elem->>'hole')::int;
    st := (elem->>'strokes')::int;
    IF hn IS NULL OR hn < 1 OR hn > 9 OR st IS NULL OR st < 1 OR st > 20 THEN
      RAISE EXCEPTION 'Invalid hole/strokes in p_holes (expect holes 1–9 for the nine played).';
    END IF;
    IF hn = ANY(seen) THEN
      RAISE EXCEPTION 'Duplicate hole % in p_holes.', hn;
    END IF;
    seen := array_append(seen, hn);
    actual_hole := CASE WHEN v_side = 'back' THEN hn + 9 ELSE hn END;
    SELECT par INTO v_par FROM nhgl.course_holes
    WHERE course_id = v_course_id AND hole_number = actual_hole;
    IF v_par IS NULL THEN
      RAISE EXCEPTION 'Hole % is not configured on the league course (course hole %).', hn, actual_hole;
    END IF;
    sum_gross := sum_gross + st;
    sum_par := sum_par + v_par;
    INSERT INTO nhgl.player_hole_scores (player_round_id, hole_number, strokes)
    VALUES (v_round_id, actual_hole, st);
  END LOOP;

  SELECT ARRAY_AGG(hole_number ORDER BY hole_number)
  INTO hole_list
  FROM nhgl.player_hole_scores
  WHERE player_round_id = v_round_id;

  IF v_side = 'back' THEN
    IF hole_list IS DISTINCT FROM ARRAY[10, 11, 12, 13, 14, 15, 16, 17, 18]::int[] THEN
      RAISE EXCEPTION 'Submit scores for all nine holes on the side you played.';
    END IF;
  ELSE
    IF hole_list IS DISTINCT FROM ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9]::int[] THEN
      RAISE EXCEPTION 'Submit scores for all nine holes on the side you played.';
    END IF;
  END IF;

  INSERT INTO nhgl.handicap_helper_scores (player_id, played_date, score, par)
  VALUES (p_player_id, v_week_date, sum_gross, sum_par);

  IF p_scorecard_image_url IS NOT NULL AND trim(p_scorecard_image_url) <> '' THEN
    INSERT INTO nhgl.match_scorecards (match_id, image_url, uploaded_by_player_id, uploaded_at)
    VALUES (p_match_id, trim(p_scorecard_image_url), p_player_id, now())
    ON CONFLICT (match_id) DO UPDATE SET
      image_url = EXCLUDED.image_url,
      uploaded_by_player_id = EXCLUDED.uploaded_by_player_id,
      uploaded_at = EXCLUDED.uploaded_at;
  END IF;

  PERFORM nhgl._recompute_skins_for_week(p_week_id);
  PERFORM nhgl._recompute_match_points(p_match_id);
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.submit_player_round(uuid, uuid, uuid, uuid, boolean, jsonb, text, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION nhgl._strokes_received_on_hole(uuid, int, int, text) TO service_role;
