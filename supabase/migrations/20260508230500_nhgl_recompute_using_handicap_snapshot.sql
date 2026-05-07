-- Use frozen handicap snapshots when computing per-hole net for skins/match recompute.
-- Falls back to historical handicap calculation for legacy rows where snapshot is null.

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
    v_h := GREATEST(0, nhgl._handicap_for_strokes(v_pid, p_exclude_played_date));
  ELSE
    v_h := GREATEST(0, v_snapshot);
  END IF;

  v_str := nhgl._strokes_received_on_hole(p_course_id, v_h, p_hole_number, v_which);
  RETURN v_gross::numeric - v_str::numeric;
END;
$$;

-- Backfill missing snapshot handicaps so legacy rounds also freeze a value.
UPDATE nhgl.player_rounds pr
SET handicap_at_submission = GREATEST(0, nhgl._handicap_for_strokes(pr.player_id, sw.week_date))
FROM nhgl.season_weeks sw
WHERE sw.id = pr.week_id
  AND pr.handicap_at_submission IS NULL;

-- Recompute all existing skins and match score rows using snapshot-aware net logic.
DO $$
DECLARE
  w record;
  m record;
BEGIN
  FOR w IN SELECT id FROM nhgl.season_weeks LOOP
    PERFORM nhgl._recompute_skins_for_week(w.id);
  END LOOP;

  FOR m IN SELECT id FROM nhgl.matches LOOP
    PERFORM nhgl._recompute_match_points(m.id);
  END LOOP;
END;
$$;
