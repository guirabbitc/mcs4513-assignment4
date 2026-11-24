import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db, getMigrationLevel } from "./db.js";
import { registerStudent, joinWaitlist, RegistrationError } from "./registrationService.js";
import { testSetupRouter } from "./testSetupRoutes.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
export const BUILD = `enrollmentnow-${pkg.version}`;

export const app = express();
app.use(express.json());

// Build and migration level, so every test run can record what it tested.
app.get("/api/health", async (req, res) => {
  res.json({ build: BUILD, migrationLevel: await getMigrationLevel() });
});

app.get("/api/courses/:code", async (req, res) => {
  const result = await db.query(
    "SELECT code, title, capacity, available_seats FROM courses WHERE code = $1",
    [req.params.code]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "COURSE_NOT_FOUND", message: "Course not found" });
  }
  const c = result.rows[0];
  res.json({ code: c.code, title: c.title, capacity: c.capacity, availableSeats: c.available_seats });
});

app.post("/api/registrations", async (req, res) => {
  const { studentId, courseCode } = req.body ?? {};
  if (!Number.isInteger(studentId) || typeof courseCode !== "string" || !courseCode.trim()) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "studentId (integer) and courseCode (text) are required",
    });
  }

  try {
    const registration = await registerStudent(studentId, courseCode);
    res.status(201).json({ message: "Registration successful", registration });
  } catch (error) {
    if (error instanceof RegistrationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Registration could not be completed" });
  }
});

app.post("/api/waitlist", async (req, res) => {
  const { studentId, courseCode } = req.body ?? {};
  if (!Number.isInteger(studentId) || typeof courseCode !== "string" || !courseCode.trim()) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "studentId (integer) and courseCode (text) are required",
    });
  }

  try {
    const entry = await joinWaitlist(studentId, courseCode);
    res.status(201).json({ message: "Added to waitlist", waitlist: entry });
  } catch (error) {
    if (error instanceof RegistrationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Could not join the waitlist" });
  }
});

// Fixture endpoints exist only in the test environment.
if (process.env.NODE_ENV === "test") {
  app.use("/test", testSetupRouter);
}

// Course page: /courses/MCS-2514 shows course "MCS 2514".
app.get("/courses/:slug", (req, res) => {
  res.sendFile(path.join(root, "public", "course.html"));
});
app.use(express.static(path.join(root, "public")));
