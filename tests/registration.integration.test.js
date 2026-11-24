// API integration tests: real Express routing + real registration service + real PostgreSQL test database.
// Nothing is mocked. Each test starts from the same known state (beforeEach) and can run alone or in any order.
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { app, BUILD } from "../src/app.js";
import { getMigrationLevel } from "../src/db.js";
import {
  db,
  resetTestData,
  cleanTestData,
  registrationCount,
  availableSeats,
  waitlistEntries,
  auditCount,
  ELIGIBLE_STUDENT,
  NO_PREREQ_STUDENT,
  SECOND_STUDENT,
  OPEN_COURSE,
  FULL_COURSE,
  PREREQUISITE,
} from "./testData.js";

beforeAll(async () => {
  // Recorded in the test output as evidence of what was tested.
  console.log(`Build: ${BUILD} | Database migration level: ${await getMigrationLevel()}`);
});

beforeEach(resetTestData);

afterAll(async () => {
  await cleanTestData();
  await db.end();
});

function register(studentId, courseCode) {
  return request(app).post("/api/registrations").send({ studentId, courseCode });
}

function joinWaitlist(studentId, courseCode) {
  return request(app).post("/api/waitlist").send({ studentId, courseCode });
}

describe("POST /api/registrations - success", () => {
  test("registers an eligible student and decreases seats from 2 to 1", async () => {
    // Arrange (beforeEach): student 41 completed MCS 1100; MCS 2514 has 2 seats.
    expect(await availableSeats(OPEN_COURSE)).toBe(2);

    // Act
    const response = await register(ELIGIBLE_STUDENT, OPEN_COURSE);

    // Assert: response
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Registration successful");
    expect(response.body.registration).toEqual({
      studentId: ELIGIBLE_STUDENT,
      courseCode: OPEN_COURSE,
      availableSeats: 1,
    });

    // Assert: persistent side effects
    expect(await registrationCount(ELIGIBLE_STUDENT, OPEN_COURSE)).toBe(1);
    expect(await availableSeats(OPEN_COURSE)).toBe(1);

    const audit = await db.query(
      "SELECT event_type FROM audit_events WHERE student_id = $1 AND course_code = $2",
      [ELIGIBLE_STUDENT, OPEN_COURSE]
    );
    expect(audit.rows).toEqual([{ event_type: "REGISTERED" }]);
  });
});

describe("POST /api/registrations - negative cases", () => {
  test("course full returns 409, creates no registration, and leaves capacity unchanged", async () => {
    const response = await register(ELIGIBLE_STUDENT, FULL_COURSE);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("COURSE_FULL");
    expect(await registrationCount(ELIGIBLE_STUDENT, FULL_COURSE)).toBe(0);
    expect(await availableSeats(FULL_COURSE)).toBe(0);
  });

  test("missing prerequisite returns 422 naming the missing course, and creates no registration", async () => {
    const response = await register(NO_PREREQ_STUDENT, OPEN_COURSE);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("MISSING_PREREQUISITE");
    expect(response.body.message).toContain(PREREQUISITE);
    expect(await registrationCount(NO_PREREQ_STUDENT, OPEN_COURSE)).toBe(0);
    expect(await availableSeats(OPEN_COURSE)).toBe(2);
  });

  test("duplicate registration returns 409 and only one registration remains", async () => {
    const first = await register(ELIGIBLE_STUDENT, OPEN_COURSE);
    expect(first.status).toBe(201);

    const second = await register(ELIGIBLE_STUDENT, OPEN_COURSE);

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("ALREADY_REGISTERED");
    expect(await registrationCount(ELIGIBLE_STUDENT, OPEN_COURSE)).toBe(1);
    expect(await availableSeats(OPEN_COURSE)).toBe(1); // seat taken once, not twice
  });

  test("unknown course returns 404 and corrupts no seat count or audit record", async () => {
    const auditBefore = await auditCount();

    const response = await register(ELIGIBLE_STUDENT, "MCS 9999");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COURSE_NOT_FOUND");
    expect(await registrationCount(ELIGIBLE_STUDENT, "MCS 9999")).toBe(0);
    expect(await availableSeats(OPEN_COURSE)).toBe(2);
    expect(await availableSeats(FULL_COURSE)).toBe(0);
    expect(await auditCount()).toBe(auditBefore);
  });
});

// The scenario says a student can join a waitlist when the course is full.
// These tests follow the same pattern: check the response and what was saved.
describe("POST /api/waitlist", () => {
  test("student joins the waitlist of a full course at position 1, and no seat or registration changes", async () => {
    const response = await joinWaitlist(ELIGIBLE_STUDENT, FULL_COURSE);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Added to waitlist");
    expect(response.body.waitlist).toEqual({
      studentId: ELIGIBLE_STUDENT,
      courseCode: FULL_COURSE,
      position: 1,
    });

    expect(await waitlistEntries(FULL_COURSE)).toEqual([{ student_id: ELIGIBLE_STUDENT, position: 1 }]);
    expect(await registrationCount(ELIGIBLE_STUDENT, FULL_COURSE)).toBe(0);
    expect(await availableSeats(FULL_COURSE)).toBe(0);

    const audit = await db.query(
      "SELECT event_type FROM audit_events WHERE student_id = $1 AND course_code = $2",
      [ELIGIBLE_STUDENT, FULL_COURSE]
    );
    expect(audit.rows).toEqual([{ event_type: "WAITLISTED" }]);
  });

  test("positions follow the order students joined", async () => {
    expect((await joinWaitlist(ELIGIBLE_STUDENT, FULL_COURSE)).body.waitlist.position).toBe(1);
    expect((await joinWaitlist(SECOND_STUDENT, FULL_COURSE)).body.waitlist.position).toBe(2);

    expect(await waitlistEntries(FULL_COURSE)).toEqual([
      { student_id: ELIGIBLE_STUDENT, position: 1 },
      { student_id: SECOND_STUDENT, position: 2 },
    ]);
  });

  test("duplicate waitlist entry returns 409 and the student stays on the list only once", async () => {
    const first = await joinWaitlist(ELIGIBLE_STUDENT, FULL_COURSE);
    expect(first.status).toBe(201);

    const second = await joinWaitlist(ELIGIBLE_STUDENT, FULL_COURSE);

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("ALREADY_WAITLISTED");
    expect(await waitlistEntries(FULL_COURSE)).toEqual([{ student_id: ELIGIBLE_STUDENT, position: 1 }]);
  });

  test("course with open seats returns 409 and creates no waitlist entry", async () => {
    const response = await joinWaitlist(ELIGIBLE_STUDENT, OPEN_COURSE);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("COURSE_NOT_FULL");
    expect(await waitlistEntries(OPEN_COURSE)).toEqual([]);
    expect(await availableSeats(OPEN_COURSE)).toBe(2);
  });
});
