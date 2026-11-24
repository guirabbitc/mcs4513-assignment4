// Known starting state for the API integration tests (registration and waitlist).
// resetTestData() deletes and recreates ONLY the fixture records below, so it never
// touches data created by other tests (the UI test uses its own unique records).
import { db } from "../src/db.js";

export { db };

export const ELIGIBLE_STUDENT = 41;     // has completed MCS 1100
export const NO_PREREQ_STUDENT = 42;    // has completed nothing
export const SECOND_STUDENT = 43;       // has completed MCS 1100 (used for waitlist order)

export const OPEN_COURSE = "MCS 2514";  // 2 seats, needs MCS 1100
export const FULL_COURSE = "MCS 2999";  // 0 seats, no prerequisite
export const PREREQUISITE = "MCS 1100";

const FIXTURE_STUDENTS = [ELIGIBLE_STUDENT, NO_PREREQ_STUDENT, SECOND_STUDENT];
const FIXTURE_COURSES = [OPEN_COURSE, FULL_COURSE];

export async function cleanTestData() {
  await db.query("DELETE FROM audit_events WHERE student_id = ANY($1) OR course_code = ANY($2)", [
    FIXTURE_STUDENTS,
    FIXTURE_COURSES,
  ]);
  await db.query("DELETE FROM waitlist_entries WHERE student_id = ANY($1) OR course_code = ANY($2)", [
    FIXTURE_STUDENTS,
    FIXTURE_COURSES,
  ]);
  await db.query("DELETE FROM registrations WHERE student_id = ANY($1) OR course_code = ANY($2)", [
    FIXTURE_STUDENTS,
    FIXTURE_COURSES,
  ]);
  await db.query("DELETE FROM courses WHERE code = ANY($1)", [FIXTURE_COURSES]);
  await db.query("DELETE FROM students WHERE id = ANY($1)", [FIXTURE_STUDENTS]); // cascades completed_courses
}

export async function resetTestData() {
  await cleanTestData();

  await db.query(
    "INSERT INTO students (id, name) VALUES ($1, 'Ana Eligible'), ($2, 'Ben NoPrereq'), ($3, 'Carla Second')",
    [ELIGIBLE_STUDENT, NO_PREREQ_STUDENT, SECOND_STUDENT]
  );
  await db.query("INSERT INTO completed_courses (student_id, course_code) VALUES ($1, $3), ($2, $3)", [
    ELIGIBLE_STUDENT,
    SECOND_STUDENT,
    PREREQUISITE,
  ]);
  await db.query(
    `INSERT INTO courses (code, title, capacity, available_seats, prerequisite_code) VALUES
       ($1, 'Software Engineering', 30, 2, $2),
       ($3, 'Special Topics', 25, 0, NULL)`,
    [OPEN_COURSE, PREREQUISITE, FULL_COURSE]
  );
}

// Small helpers so assertions read clearly.
export async function registrationCount(studentId, courseCode) {
  const r = await db.query(
    "SELECT * FROM registrations WHERE student_id = $1 AND course_code = $2",
    [studentId, courseCode]
  );
  return r.rowCount;
}

export async function availableSeats(courseCode) {
  const r = await db.query("SELECT available_seats FROM courses WHERE code = $1", [courseCode]);
  return r.rows[0]?.available_seats;
}

// Counts audit events for the fixture students only, so a UI test running at the
// same time (with its own unique records) cannot change this number.
export async function waitlistEntries(courseCode) {
  const r = await db.query(
    "SELECT student_id, position FROM waitlist_entries WHERE course_code = $1 ORDER BY position",
    [courseCode]
  );
  return r.rows;
}

export async function auditCount() {
  const r = await db.query(
    "SELECT count(*)::int AS n FROM audit_events WHERE student_id = ANY($1)",
    [FIXTURE_STUDENTS]
  );
  return r.rows[0].n;
}
