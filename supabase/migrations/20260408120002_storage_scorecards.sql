-- Storage bucket for scorecard images (name avoids collisions on shared Supabase projects)

INSERT INTO storage.buckets (id, name, public)
VALUES ('nhgl-scorecards', 'nhgl-scorecards', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY nhgl_scorecards_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'nhgl-scorecards');

CREATE POLICY nhgl_scorecards_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'nhgl-scorecards');
