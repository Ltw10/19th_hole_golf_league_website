-- Plus handicaps: keep negative handicap snapshots, allocate "given" strokes on
-- easiest holes (highest stroke index), and use them in skins / match recompute.

COMMENT ON COLUMN nhgl.player_rounds.handicap_at_submission IS
  'Effective handicap at submission. Positive = strokes received; negative = plus handicap (strokes given).';

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
  v_h int;
  v_mag int;
  v_base int;
  v_extra int;
  v_si int;
  v_rank int;
  v_min_hole int;
  v_max_hole int;
  w text;
BEGIN
  v_h := coalesce(p_handicap_eff, 0);
  IF v_h = 0 THEN
    RETURN 0;
  END IF;

  w := lower(trim(coalesce(p_which_nine, 'front')));
  IF w = 'back' THEN
    v_min_hole := 10;
    v_max_hole := 18;
  ELSE
    v_min_hole := 1;
    v_max_hole := 9;
  END IF;

  IF p_hole_number < v_min_hole OR p_hole_number > v_max_hole THEN
    RETURN 0;
  END IF;

  SELECT stroke_index INTO v_si
  FROM nhgl.course_holes
  WHERE course_id = p_course_id AND hole_number = p_hole_number;
  IF v_si IS NULL THEN
    RETURN 0;
  END IF;

  v_mag := abs(v_h);
  v_base := v_mag / 9;
  v_extra := v_mag % 9;

  IF v_h > 0 THEN
    -- Receive strokes on hardest holes first (lowest stroke index).
    IF v_extra = 0 THEN
      RETURN v_base;
    END IF;
    SELECT COUNT(*)::int INTO v_rank
    FROM nhgl.course_holes ch
    WHERE ch.course_id = p_course_id
      AND ch.hole_number BETWEEN v_min_hole AND v_max_hole
      AND ch.stroke_index < v_si;
    IF v_rank < v_extra THEN
      RETURN v_base + 1;
    END IF;
    RETURN v_base;
  END IF;

  -- Plus handicap: give strokes on easiest holes first (highest stroke index).
  IF v_extra = 0 THEN
    RETURN -v_base;
  END IF;
  SELECT COUNT(*)::int INTO v_rank
  FROM nhgl.course_holes ch
  WHERE ch.course_id = p_course_id
    AND ch.hole_number BETWEEN v_min_hole AND v_max_hole
    AND ch.stroke_index > v_si;
  IF v_rank < v_extra THEN
    RETURN -(v_base + 1);
  END IF;
  RETURN -v_base;
END;
$$;

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
    RETURN coalesce(nhgl._handicap_for_strokes(v_pid, p_exclude_played_date), 0);
  END IF;

  RETURN v_snapshot;
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
  v_snapshot int;
BEGIN
  SELECT player_id, coalesce(which_nine, 'front'), handicap_at_submission
  INTO v_pid, v_which, v_snapshot
  FROM nhgl.player_rounds
  WHERE id = p_round_id;

  SELECT strokes INTO v_gross
  FROM nhgl.player_hole_scores
  WHERE player_round_id = p_round_id AND hole_number = p_hole_number;

  IF v_gross IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_snapshot IS NULL THEN
    v_h := coalesce(nhgl._handicap_for_strokes(v_pid, p_exclude_played_date), 0);
  ELSE
    v_h := v_snapshot;
  END IF;

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
  gross_zero_count int;
  stroke_user_count int;
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
    strokes_on_hole int NOT NULL,
    PRIMARY KEY (player_id, hole)
  ) ON COMMIT DROP;

  INSERT INTO _skins_net (player_id, hole, net, strokes_on_hole)
  SELECT
    pr.player_id,
    phs.hole_number,
    phs.strokes::numeric
      - nhgl._strokes_received_on_hole(
          v_course_id,
          COALESCE(
            pr.handicap_at_submission,
            nhgl._handicap_for_strokes(pr.player_id, v_week_date),
            0
          ),
          phs.hole_number,
          coalesce(pr.which_nine, 'front')
        )::numeric,
    nhgl._strokes_received_on_hole(
      v_course_id,
      COALESCE(
        pr.handicap_at_submission,
        nhgl._handicap_for_strokes(pr.player_id, v_week_date),
        0
      ),
      phs.hole_number,
      coalesce(pr.which_nine, 'front')
    )
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

    IF win_count = 1 THEN
      SELECT player_id INTO winner FROM _skins_net WHERE hole = v_actual AND net = min_net LIMIT 1;
      skin_total := skin_total + 1;
      INSERT INTO nhgl.skins_hole_wins (week_id, player_id, hole) VALUES (p_week_id, winner, v_actual);
      CONTINUE;
    END IF;

    IF win_count = 2 THEN
      SELECT COUNT(*) INTO gross_zero_count
      FROM _skins_net
      WHERE hole = v_actual AND net = min_net AND strokes_on_hole = 0;

      SELECT COUNT(*) INTO stroke_user_count
      FROM _skins_net
      WHERE hole = v_actual AND net = min_net AND strokes_on_hole > 0;

      IF gross_zero_count = 1 AND stroke_user_count = 1 THEN
        SELECT player_id INTO winner
        FROM _skins_net
        WHERE hole = v_actual AND net = min_net AND strokes_on_hole = 0
        LIMIT 1;

        skin_total := skin_total + 1;
        INSERT INTO nhgl.skins_hole_wins (week_id, player_id, hole) VALUES (p_week_id, winner, v_actual);
      END IF;
    END IF;
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

CREATE OR REPLACE FUNCTION nhgl.submit_player_round(
  p_week_id uuid,
  p_player_id uuid,
  p_match_id uuid,
  p_played_for_team_id uuid,
  p_played_skins boolean,
  p_holes jsonb,
  p_scorecard_image_url text DEFAULT NULL,
  p_which_nine text DEFAULT 'front',
  p_subbing_for_player_id uuid DEFAULT NULL
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
  v_submitter_team_id uuid;
  v_submitter_is_member boolean;
  v_subbed_for_team_id uuid;
  v_subbed_for_is_member boolean;
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

  IF EXISTS (SELECT 1 FROM nhgl.score_submissions ss WHERE ss.match_id = p_match_id) THEN
    RAISE EXCEPTION 'This match already has submitted scores. Changes must be made through the admin page.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM nhgl.player_rounds pr
    WHERE pr.week_id = p_week_id AND pr.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'You already submitted a round for this week. Scores can only be changed by an admin.';
  END IF;

  IF p_subbing_for_player_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM nhgl.player_rounds pr
    WHERE pr.week_id = p_week_id
      AND (
        pr.player_id = p_subbing_for_player_id
        OR pr.subbing_for_player_id = p_subbing_for_player_id
      )
  ) THEN
    RAISE EXCEPTION 'A score is already on file for the player you are subbing for this week. Ask an admin to edit or delete it.';
  END IF;

  SELECT team_id, is_league_member INTO v_submitter_team_id, v_submitter_is_member FROM nhgl.players WHERE id = p_player_id;
  IF v_submitter_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid player_id.';
  END IF;

  IF coalesce(v_submitter_is_member, false) = false AND p_subbing_for_player_id IS NULL THEN
    RAISE EXCEPTION 'Substitutes must select which player they are subbing for.';
  END IF;

  IF p_subbing_for_player_id IS NOT NULL THEN
    IF p_subbing_for_player_id = p_player_id THEN
      RAISE EXCEPTION 'subbing_for_player_id cannot be the submitting player.';
    END IF;
    SELECT team_id, is_league_member INTO v_subbed_for_team_id, v_subbed_for_is_member
    FROM nhgl.players
    WHERE id = p_subbing_for_player_id;
    IF v_subbed_for_team_id IS NULL THEN
      RAISE EXCEPTION 'Invalid subbing_for_player_id.';
    END IF;
    IF v_subbed_for_team_id IS DISTINCT FROM p_played_for_team_id THEN
      RAISE EXCEPTION 'subbing_for_player_id must belong to the team played for.';
    END IF;
    IF coalesce(v_subbed_for_is_member, false) = false THEN
      RAISE EXCEPTION 'subbing_for_player_id must be a roster player, not a substitute.';
    END IF;
  END IF;

  v_course_id := nhgl._default_course_id();
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'No default course configured.';
  END IF;

  INSERT INTO nhgl.player_rounds (
    week_id,
    match_id,
    player_id,
    played_for_team_id,
    played_skins,
    scorecard_image_url,
    which_nine,
    subbing_for_player_id,
    handicap_at_submission
  )
  VALUES (
    p_week_id,
    p_match_id,
    p_player_id,
    p_played_for_team_id,
    p_played_skins,
    NULLIF(trim(p_scorecard_image_url), ''),
    v_side,
    p_subbing_for_player_id,
    coalesce(nhgl._handicap_for_strokes(p_player_id, v_week_date), 0)
  )
  RETURNING id INTO v_round_id;

  FOR elem IN SELECT * FROM jsonb_array_elements(coalesce(p_holes, '[]'::jsonb))
  LOOP
    hn := (elem->>'hole')::int;
    st := (elem->>'strokes')::int;
    IF hn IS NULL OR hn < 1 OR hn > 9 OR st IS NULL OR st < 1 OR st > 20 THEN
      RAISE EXCEPTION 'Invalid hole/strokes in p_holes (expect holes 1-9 for the nine played).';
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
