-- Team + RPC so visitors can add a name for handicap tracking without direct INSERT on nhgl.players.

INSERT INTO nhgl.teams (name)
VALUES ('Handicap helper')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION nhgl.create_handicap_helper_player(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nhgl, public
AS $$
DECLARE
  v_team_id uuid;
  v_id uuid;
  v_trim text;
BEGIN
  v_trim := trim(p_name);
  IF v_trim = '' THEN
    RAISE EXCEPTION 'Player name is required.';
  END IF;

  SELECT id INTO v_team_id FROM nhgl.teams WHERE name = 'Handicap helper' LIMIT 1;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Handicap helper team missing — apply migrations.';
  END IF;

  INSERT INTO nhgl.players (name, team_id)
  VALUES (v_trim, v_team_id)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A player named "%" already exists.', v_trim;
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.create_handicap_helper_player(text) TO anon, authenticated;
