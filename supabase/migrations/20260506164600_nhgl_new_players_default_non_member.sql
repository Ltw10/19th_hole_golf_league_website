-- Ensure players created via public helper RPCs are always marked as non-members.

CREATE OR REPLACE FUNCTION nhgl.create_skins_substitute_player(p_name text)
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

  SELECT id INTO v_team_id FROM nhgl.teams WHERE name = 'Skins substitutes' LIMIT 1;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Skins substitutes team missing — apply migrations.';
  END IF;

  INSERT INTO nhgl.players (name, team_id, is_league_member)
  VALUES (v_trim, v_team_id, false)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A player named "%" already exists.', v_trim;
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.create_skins_substitute_player(text) TO anon, authenticated;

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

  INSERT INTO nhgl.players (name, team_id, is_league_member)
  VALUES (v_trim, v_team_id, false)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A player named "%" already exists.', v_trim;
END;
$$;

GRANT EXECUTE ON FUNCTION nhgl.create_handicap_helper_player(text) TO anon, authenticated;
