-- Unified round submission: hole scores, handicap row, skins + match recompute.

CREATE OR REPLACE FUNCTION nhgl._handicap_for_strokes(p_player_id uuid, p_exclude_played_date date)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = nhgl, public
AS $$
  SELECT COALESCE(
    (
      WITH ranked AS (
        SELECT
          (h.score - h.par)::numeric AS versus_par,
          ROW_NUMBER() OVER (
            ORDER BY h.played_date DESC, h.created_at DESC
          ) AS rn
        FROM nhgl.handicap_helper_scores h
        WHERE h.player_id = p_player_id
          AND (
            p_exclude_played_date IS NULL
            OR h.played_date IS DISTINCT FROM p_exclude_played_date
          )
      )
      SELECT ROUND((AVG(ranked.versus_par) * 0.8)::numeric)::int
      FROM ranked
      WHERE rn <= 5
      HAVING COUNT(*) > 0
    ),
    0
  );
$$;

-- Extra strokes go to lowest stroke_index holes first (hardest holes).
CREATE OR REPLACE FUNCTION nhgl._strokes_received_on_hole(
  p_course_id uuid,
  p_handicap_eff int,
  p_hole_number int
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
BEGIN
  v_base := p_handicap_eff / 9;
  v_extra := p_handicap_eff % 9;
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
  WHERE ch.course_id = p_course_id AND ch.stroke_index < v_si;
  IF v_lower < v_extra THEN
    RETURN v_base + 1;
  END IF;
  RETURN v_base;
END;
$$;

CREATE OR REPLACE FUNCTION nhgl._default_course_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = nhgl, public
AS $$
  SELECT COALESCE(
    (SELECT value::uuid FROM nhgl.league_settings WHERE key = 'default_course_id' LIMIT 1),
    (SELECT id FROM nhgl.courses WHERE name = 'Hickory Sticks' LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION nhgl._skins_buyin_amount()
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = nhgl, public
AS $$
  SELECT COALESCE(
    (
      SELECT NULLIF(trim(value), '')::numeric
      FROM nhgl.league_settings
      WHERE key = 'skins_buyin_amount'
      LIMIT 1
    ),
    5::numeric
  );
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
BEGIN
  SELECT player_id INTO v_pid FROM nhgl.player_rounds WHERE id = p_round_id;
  SELECT strokes INTO v_gross
  FROM nhgl.player_hole_scores
  WHERE player_round_id = p_round_id AND hole_number = p_hole_number;
  IF v_gross IS NULL THEN
    RETURN NULL;
  END IF;
  v_h := GREATEST(0, nhgl._handicap_for_strokes(v_pid, p_exclude_played_date));
  v_str := nhgl._strokes_received_on_hole(p_course_id, v_h, p_hole_number);
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
  h int;
  min_net numeric;
  win_count int;
  winner uuid;
  skin_total int := 0;
  total_pot numeric;
  buyer_count int;
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
          phs.hole_number
        )::numeric
  FROM nhgl.player_rounds pr
  INNER JOIN nhgl.player_hole_scores phs ON phs.player_round_id = pr.id
  WHERE pr.week_id = p_week_id AND pr.played_skins = true;

  FOR h IN 1..9 LOOP
    SELECT MIN(net) INTO min_net FROM _skins_net WHERE hole = h;
    IF min_net IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COUNT(DISTINCT player_id) INTO win_count
    FROM _skins_net
    WHERE hole = h AND net = min_net;

    IF win_count <> 1 THEN
      CONTINUE;
    END IF;

    SELECT player_id INTO winner FROM _skins_net WHERE hole = h AND net = min_net LIMIT 1;
    skin_total := skin_total + 1;
    INSERT INTO nhgl.skins_hole_wins (week_id, player_id, hole) VALUES (p_week_id, winner, h);
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

  FOR h IN 1..9 LOOP
    na := COALESCE(nhgl._hole_net_for_round(ra1, h, v_week_date, v_course_id), 0)
      + COALESCE(nhgl._hole_net_for_round(ra2, h, v_week_date, v_course_id), 0);
    nb := COALESCE(nhgl._hole_net_for_round(rb1, h, v_week_date, v_course_id), 0)
      + COALESCE(nhgl._hole_net_for_round(rb2, h, v_week_date, v_course_id), 0);
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

CREATE OR REPLACE FUNCTION nhgl.submit_player_round(
  p_week_id uuid,
  p_player_id uuid,
  p_match_id uuid,
  p_played_for_team_id uuid,
  p_played_skins boolean,
  p_holes jsonb,
  p_scorecard_image_url text DEFAULT NULL
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
  seen int[] := ARRAY[]::int[];
  hole_list int[];
BEGIN
  IF p_week_id IS NULL OR p_player_id IS NULL OR p_match_id IS NULL OR p_played_for_team_id IS NULL THEN
    RAISE EXCEPTION 'week_id, player_id, match_id, and played_for_team_id are required.';
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
    scorecard_image_url
  )
  VALUES (
    p_week_id,
    p_match_id,
    p_player_id,
    p_played_for_team_id,
    p_played_skins,
    NULLIF(trim(p_scorecard_image_url), '')
  )
  RETURNING id INTO v_round_id;

  FOR elem IN SELECT * FROM jsonb_array_elements(coalesce(p_holes, '[]'::jsonb))
  LOOP
    hn := (elem->>'hole')::int;
    st := (elem->>'strokes')::int;
    IF hn IS NULL OR hn < 1 OR hn > 18 OR st IS NULL OR st < 1 OR st > 20 THEN
      RAISE EXCEPTION 'Invalid hole/strokes in p_holes.';
    END IF;
    IF hn = ANY(seen) THEN
      RAISE EXCEPTION 'Duplicate hole % in p_holes.', hn;
    END IF;
    seen := array_append(seen, hn);
    SELECT par INTO v_par FROM nhgl.course_holes
    WHERE course_id = v_course_id AND hole_number = hn;
    IF v_par IS NULL THEN
      RAISE EXCEPTION 'Hole % is not on the league course.', hn;
    END IF;
    sum_gross := sum_gross + st;
    sum_par := sum_par + v_par;
    INSERT INTO nhgl.player_hole_scores (player_round_id, hole_number, strokes)
    VALUES (v_round_id, hn, st);
  END LOOP;

  SELECT ARRAY_AGG(hole_number ORDER BY hole_number)
  INTO hole_list
  FROM nhgl.player_hole_scores
  WHERE player_round_id = v_round_id;

  IF hole_list IS DISTINCT FROM ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9]::int[] THEN
    RAISE EXCEPTION 'Submit scores for holes 1 through 9 exactly once.';
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

GRANT EXECUTE ON FUNCTION nhgl.submit_player_round(uuid, uuid, uuid, uuid, boolean, jsonb, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION nhgl._handicap_for_strokes(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION nhgl._strokes_received_on_hole(uuid, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION nhgl._hole_net_for_round(uuid, int, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION nhgl._default_course_id() TO service_role;
GRANT EXECUTE ON FUNCTION nhgl._skins_buyin_amount() TO service_role;
GRANT EXECUTE ON FUNCTION nhgl._recompute_skins_for_week(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION nhgl._recompute_match_points(uuid) TO service_role;
