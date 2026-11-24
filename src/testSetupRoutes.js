// Test-only fixture API. Mounted at /test only when NODE_ENV=test.
// The UI test uses it to create a known student and course before opening the browser,
// and to remove exactly those records afterwards.
import express from "express";
import { db } from "./db.js";

export const testSetupRouter = express.Router();

testSetupRouter.post("/setup/course", async (req, res) => {
  const {
    code,
    title = "Software Engineering",
    availableSeats = 2,
    capacity = 30,
    prerequisiteCode = null,
    studentId,
    studentName = "Test Student",
    completedCourses = [],
  } = req.body;

  await db.query(
    "INSERT INTO courses (code, title, capacity, available_seats, prerequisite_code) VALUES ($1, $2, $3, $4, $5)",
    [code, title, capacity, availableSeats, prerequisiteCode]
  );
  if (studentId) {
    await db.query("INSERT INTO students (id, name) VALUES ($1, $2)", [studentId, studentName]);
    for (const done of completedCourses) {
      await db.query(
        "INSERT INTO completed_courses (student_id, course_code) VALUES ($1, $2)",
        [studentId, done]
      );
    }
  }
  res.status(201).json({ code, availableSeats, studentId });
});

testSetupRouter.post("/cleanup", async (req, res) => {
  const { courseCode, studentId } = req.body;
  await db.query("DELETE FROM audit_events WHERE course_code = $1", [courseCode]);
  await db.query("DELETE FROM waitlist_entries WHERE course_code = $1", [courseCode]);
  await db.query("DELETE FROM registrations WHERE course_code = $1", [courseCode]);
  await db.query("DELETE FROM courses WHERE code = $1", [courseCode]);
  if (studentId) await db.query("DELETE FROM students WHERE id = $1", [studentId]);
  res.status(204).end();
});
