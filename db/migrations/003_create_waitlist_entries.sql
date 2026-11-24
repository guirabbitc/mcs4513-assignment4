-- 003: waitlist for full courses
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code  TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  position     INTEGER NOT NULL CHECK (position > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_code),
  UNIQUE (course_code, position)
);
