import { db } from "./db.js";

// Each rule failure carries the HTTP status the API should return.
export class RegistrationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Registers one student in one course. Everything happens in one transaction:
// either the registration, the seat update, and the audit event are all saved,
// or nothing is saved.
export async function registerStudent(studentId, courseCode) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Lock the course row so two requests cannot take the last seat at the same time.
    const courseResult = await client.query(
      "SELECT * FROM courses WHERE code = $1 FOR UPDATE",
      [courseCode]
    );
    const course = courseResult.rows[0];
    if (!course) {
      throw new RegistrationError(404, "COURSE_NOT_FOUND", `Course ${courseCode} does not exist`);
    }

    const student = await client.query("SELECT id FROM students WHERE id = $1", [studentId]);
    if (student.rowCount === 0) {
      throw new RegistrationError(404, "STUDENT_NOT_FOUND", `Student ${studentId} does not exist`);
    }

    const existing = await client.query(
      "SELECT 1 FROM registrations WHERE student_id = $1 AND course_code = $2",
      [studentId, courseCode]
    );
    if (existing.rowCount > 0) {
      throw new RegistrationError(409, "ALREADY_REGISTERED", `Student is already registered for ${courseCode}`);
    }

    if (course.prerequisite_code) {
      const done = await client.query(
        "SELECT 1 FROM completed_courses WHERE student_id = $1 AND course_code = $2",
        [studentId, course.prerequisite_code]
      );
      if (done.rowCount === 0) {
        throw new RegistrationError(
          422,
          "MISSING_PREREQUISITE",
          `Missing prerequisite: ${course.prerequisite_code}`
        );
      }
    }

    if (course.available_seats === 0) {
      throw new RegistrationError(409, "COURSE_FULL", `${courseCode} has no available seats`);
    }

    await client.query(
      "INSERT INTO registrations (student_id, course_code) VALUES ($1, $2)",
      [studentId, courseCode]
    );
    const updated = await client.query(
      "UPDATE courses SET available_seats = available_seats - 1 WHERE code = $1 RETURNING available_seats",
      [courseCode]
    );
    await client.query(
      "INSERT INTO audit_events (event_type, student_id, course_code) VALUES ('REGISTERED', $1, $2)",
      [studentId, courseCode]
    );

    await client.query("COMMIT");
    return { studentId, courseCode, availableSeats: updated.rows[0].available_seats };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Adds a student to the waitlist of a full course, at the end of the queue.
// Same idea as registration: one transaction, and the course row is locked so two
// students joining at the same time cannot get the same position.
export async function joinWaitlist(studentId, courseCode) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const courseResult = await client.query(
      "SELECT * FROM courses WHERE code = $1 FOR UPDATE",
      [courseCode]
    );
    const course = courseResult.rows[0];
    if (!course) {
      throw new RegistrationError(404, "COURSE_NOT_FOUND", `Course ${courseCode} does not exist`);
    }

    const student = await client.query("SELECT id FROM students WHERE id = $1", [studentId]);
    if (student.rowCount === 0) {
      throw new RegistrationError(404, "STUDENT_NOT_FOUND", `Student ${studentId} does not exist`);
    }

    if (course.available_seats > 0) {
      throw new RegistrationError(
        409,
        "COURSE_NOT_FULL",
        `${courseCode} still has available seats. Register instead of joining the waitlist`
      );
    }

    const registered = await client.query(
      "SELECT 1 FROM registrations WHERE student_id = $1 AND course_code = $2",
      [studentId, courseCode]
    );
    if (registered.rowCount > 0) {
      throw new RegistrationError(409, "ALREADY_REGISTERED", `Student is already registered for ${courseCode}`);
    }

    const waiting = await client.query(
      "SELECT 1 FROM waitlist_entries WHERE student_id = $1 AND course_code = $2",
      [studentId, courseCode]
    );
    if (waiting.rowCount > 0) {
      throw new RegistrationError(409, "ALREADY_WAITLISTED", `Student is already on the waitlist for ${courseCode}`);
    }

    const next = await client.query(
      "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM waitlist_entries WHERE course_code = $1",
      [courseCode]
    );
    const position = next.rows[0].position;

    await client.query(
      "INSERT INTO waitlist_entries (student_id, course_code, position) VALUES ($1, $2, $3)",
      [studentId, courseCode, position]
    );
    await client.query(
      "INSERT INTO audit_events (event_type, student_id, course_code) VALUES ('WAITLISTED', $1, $2)",
      [studentId, courseCode]
    );

    await client.query("COMMIT");
    return { studentId, courseCode, position };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
