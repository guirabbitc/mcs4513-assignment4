-- 002: audit trail for registration attempts
CREATE TABLE IF NOT EXISTS audit_events (
  id           SERIAL PRIMARY KEY,
  event_type   TEXT NOT NULL,
  student_id   INTEGER,
  course_code  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
