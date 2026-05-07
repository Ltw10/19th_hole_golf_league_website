-- Hickory Sticks course + hole metadata (par + stroke index). Edit values as needed.

CREATE TABLE nhgl.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  holes int NOT NULL DEFAULT 9 CHECK (holes >= 1 AND holes <= 18),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nhgl.course_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES nhgl.courses (id) ON DELETE CASCADE,
  hole_number int NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  par int NOT NULL CHECK (par >= 3 AND par <= 6),
  stroke_index int NOT NULL CHECK (stroke_index >= 1 AND stroke_index <= 18),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, hole_number),
  UNIQUE (course_id, stroke_index)
);

CREATE INDEX nhgl_course_holes_course_idx ON nhgl.course_holes (course_id);

ALTER TABLE nhgl.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhgl.course_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nhgl_courses_select ON nhgl.courses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY nhgl_course_holes_select ON nhgl.course_holes FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON nhgl.courses, nhgl.course_holes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nhgl.courses, nhgl.course_holes TO service_role;

INSERT INTO nhgl.courses (name, holes)
VALUES ('Hickory Sticks', 9)
ON CONFLICT (name) DO NOTHING;

INSERT INTO nhgl.course_holes (course_id, hole_number, par, stroke_index)
SELECT c.id, gs.n, 4, gs.n
FROM nhgl.courses c
CROSS JOIN generate_series(1, 9) AS gs(n)
WHERE c.name = 'Hickory Sticks'
ON CONFLICT (course_id, hole_number) DO NOTHING;
