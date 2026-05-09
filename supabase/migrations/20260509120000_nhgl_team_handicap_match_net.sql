-- Match scoring: allocate handicap strokes by team (sum of partners) once per hole,
-- instead of summing each player's net (strokes minus individual dots).

CREATE OR REPLACE FUNCTION nhgl._effective_handicap_for_round(
  p_round_id uuid,
  p_exclude_played_date date
) RETURNS int
LANGUAGE plpgsql
STABLE
SET search_path = nhgl, public
AS $$
DECLARE
  v_snapshot int;
  v_pid uuid;
BEGIN
  SELECT player_id, handicap_at_submission
  INTO v_pid, v_snapshot
  FROM nhgl.player_rounds
  WHERE id = p_round_id;

  IF v_pid IS NULL THEN
    RETURN 0;
  END IF;

  IF v_snapshot IS NULL THEN
    RETURN GREATEST(0, nhgl._handicap_for_strokes(v_pid, p_exclude_played_date));
  END IF;

  RETURN GREATEST(0, v_snapshot);
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
  ga1 int;
  ga2 int;
  gb1 int;
  gb2 int;
  ha_team int;
  hb_team int;
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

  ha_team :=
    nhgl._effective_handicap_for_round(ra1, v_week_date)
    + nhgl._effective_handicap_for_round(ra2, v_week_date);
  hb_team :=
    nhgl._effective_handicap_for_round(rb1, v_week_date)
    + nhgl._effective_handicap_for_round(rb2, v_week_date);

  FOR h IN 1..9 LOOP
    v_actual := CASE WHEN lower(trim(coalesce(v_which, 'front'))) = 'back' THEN h + 9 ELSE h END;

    SELECT strokes INTO ga1 FROM nhgl.player_hole_scores
    WHERE player_round_id = ra1 AND hole_number = v_actual;
    SELECT strokes INTO ga2 FROM nhgl.player_hole_scores
    WHERE player_round_id = ra2 AND hole_number = v_actual;
    SELECT strokes INTO gb1 FROM nhgl.player_hole_scores
    WHERE player_round_id = rb1 AND hole_number = v_actual;
    SELECT strokes INTO gb2 FROM nhgl.player_hole_scores
    WHERE player_round_id = rb2 AND hole_number = v_actual;

    na :=
      COALESCE(ga1, 0)::numeric + COALESCE(ga2, 0)::numeric
      - nhgl._strokes_received_on_hole(v_course_id, ha_team, v_actual, v_which)::numeric;

    nb :=
      COALESCE(gb1, 0)::numeric + COALESCE(gb2, 0)::numeric
      - nhgl._strokes_received_on_hole(v_course_id, hb_team, v_actual, v_which)::numeric;

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

GRANT EXECUTE ON FUNCTION nhgl._effective_handicap_for_round(uuid, date) TO service_role;

DO $$
DECLARE
  m record;
BEGIN
  FOR m IN SELECT id FROM nhgl.matches LOOP
    PERFORM nhgl._recompute_match_points(m.id);
  END LOOP;
END;
$$;
