-- Persist handicap value used at score submission time.

ALTER TABLE nhgl.player_rounds
  ADD COLUMN IF NOT EXISTS handicap_at_submission int;

COMMENT ON COLUMN nhgl.player_rounds.handicap_at_submission IS 'Effective handicap used at the time this round was submitted.';

DROP FUNCTION IF EXISTS nhgl.submit_player_round(uuid, uuid, uuid, uuid, boolean, jsonb, text, text, uuid);

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
  v_handicap_eff int := 0;
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

  DELETE FROM nhgl.handicap_helper_scores h
  WHERE h.player_id = p_player_id AND h.played_date = v_week_date;

  DELETE FROM nhgl.player_rounds pr
  WHERE pr.week_id = p_week_id AND pr.player_id = p_player_id;

  v_handicap_eff := GREATEST(0, nhgl._handicap_for_strokes(p_player_id, v_week_date));

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
    v_handicap_eff
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

GRANT EXECUTE ON FUNCTION nhgl.submit_player_round(uuid, uuid, uuid, uuid, boolean, jsonb, text, text, uuid) TO anon, authenticated, service_role;
