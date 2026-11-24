-- 001: students, courses, prerequisites history, registrations, audit events
CREATE TABLE IF NOT EXISTS students (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  code               TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  capacity           INTEGER NOT NULL CHECK (capacity >= 0),
  available_seats    INTEGER NOT NULL CHECK (available_seats >= 0),
  prerequisite_code  TEXT
);

CREATE TABLE IF NOT EXISTS completed_courses (
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code  TEXT NOT NULL,
  PRIMARY KEY (student_id, course_code)
);

CREATE TABLE IF NOT EXISTS registrations (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code  TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_code)
);
