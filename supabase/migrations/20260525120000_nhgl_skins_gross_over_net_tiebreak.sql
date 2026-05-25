-- Skins: when exactly two players tie at the low net and one played straight up (no strokes
-- on the hole) while the other used handicap strokes, the straight-up gross score wins the skin.
-- Does not backfill or recompute prior weeks (new rule applies on future recompute only).

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
          GREATEST(
            0,
            COALESCE(
              pr.handicap_at_submission,
              nhgl._handicap_for_strokes(pr.player_id, v_week_date)
            )
          ),
          phs.hole_number,
          coalesce(pr.which_nine, 'front')
        )::numeric,
    nhgl._strokes_received_on_hole(
      v_course_id,
      GREATEST(
        0,
        COALESCE(
          pr.handicap_at_submission,
          nhgl._handicap_for_strokes(pr.player_id, v_week_date)
        )
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
