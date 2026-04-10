-- Atomic weekly skins submit (public callers use anon key + GRANT EXECUTE)

CREATE OR REPLACE FUNCTION nhgl.submit_skins_week(
  p_week_id uuid,
  p_notes text,
  p_hole_wins jsonb,
  p_buyins jsonb,
  p_payouts jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM nhgl.skins_week_results WHERE week_id = p_week_id) THEN
    RAISE EXCEPTION 'Skins already submitted for this week — ask an admin to fix.';
  END IF;

  INSERT INTO nhgl.skins_week_results (week_id, notes) VALUES (p_week_id, p_notes);

  INSERT INTO nhgl.skins_hole_wins (week_id, player_id, hole)
  SELECT
    p_week_id,
    (elem->>'player_id')::uuid,
    (elem->>'hole')::int
  FROM jsonb_array_elements(coalesce(p_hole_wins, '[]'::jsonb)) AS elem;

  INSERT INTO nhgl.skins_buyins (week_id, player_id, amount)
  SELECT
    p_week_id,
    (elem->>'player_id')::uuid,
    NULLIF(elem->>'amount', '')::numeric
  FROM jsonb_array_elements(coalesce(p_buyins, '[]'::jsonb)) AS elem;

  INSERT INTO nhgl.skins_week_payouts (week_id, player_id, amount_won)
  SELECT
    p_week_id,
    (elem->>'player_id')::uuid,
    (elem->>'amount_won')::numeric
  FROM jsonb_array_elements(coalesce(p_payouts, '[]'::jsonb)) AS elem;
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.submit_skins_week(uuid, text, jsonb, jsonb, jsonb) TO anon, authenticated;
