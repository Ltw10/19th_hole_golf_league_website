-- Mark core roster players so UI can separate league members vs subs.

ALTER TABLE nhgl.players
ADD COLUMN IF NOT EXISTS is_league_member boolean NOT NULL DEFAULT false;

UPDATE nhgl.players p
SET is_league_member = CASE
  WHEN t.name IN ('Skins substitutes', 'Handicap helper') THEN false
  ELSE true
END
FROM nhgl.teams t
WHERE t.id = p.team_id;
