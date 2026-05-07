-- Key/value settings: skins buy-in and default course (Hickory Sticks).

CREATE TABLE nhgl.league_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nhgl.league_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhgl_league_settings_select ON nhgl.league_settings FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON nhgl.league_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nhgl.league_settings TO service_role;

INSERT INTO nhgl.league_settings (key, value)
SELECT 'skins_buyin_amount', '5'
WHERE NOT EXISTS (SELECT 1 FROM nhgl.league_settings WHERE key = 'skins_buyin_amount');

INSERT INTO nhgl.league_settings (key, value)
SELECT 'default_course_id', c.id::text
FROM nhgl.courses c
WHERE c.name = 'Hickory Sticks'
  AND NOT EXISTS (SELECT 1 FROM nhgl.league_settings WHERE key = 'default_course_id');
