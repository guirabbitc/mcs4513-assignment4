// UI test: a student registers for an available course through the browser.
// State is created through the test-only fixture API before the browser opens,
// and removed afterwards. Each run uses a unique course code and student ID,
// so this test can run in parallel with itself or with the integration tests.
import { test, expect } from "@playwright/test";

test.describe("Course registration page", () => {
  let courseCode;
  let studentId;

  test.beforeEach(async ({ request }, testInfo) => {
    const unique = `${Date.now()}`.slice(-5) + testInfo.workerIndex;
    courseCode = `UI ${unique}`;             // e.g. "UI 482170"
    studentId = 900000 + Number(unique);      // never collides with fixture students 41/42

    const health = await (await request.get("/api/health")).json();
    console.log(`Build: ${health.build} | Database migration level: ${health.migrationLevel} | Browser: ${testInfo.project.name}`);

    const setup = await request.post("/test/setup/course", {
      data: { code: courseCode, availableSeats: 2, studentId, completedCourses: [] },
    });
    expect(setup.status()).toBe(201);
  });

  test.afterEach(async ({ request }) => {
    await request.post("/test/cleanup", { data: { courseCode, studentId } });
  });

  test("student registers for an available course", async ({ page }) => {
    const slug = courseCode.replace(/ /g, "-");
    await page.goto(`/courses/${slug}?studentId=${studentId}`);

    // Starting state the student can see
    await expect(page.getByRole("heading", { level: 1 })).toContainText(courseCode);
    await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");

    // Register and confirm, using what the student perceives: roles and accessible names
    await page.getByRole("button", { name: "Register" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm registration" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm" }).click();

    // Visible outcome (these assertions retry until the page reaches the state, up to 5 s)
    await expect(page.getByRole("status")).toHaveText("Registration successful");
    await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
    await expect(page.getByRole("button", { name: "Registered" })).toBeDisabled();
  });
});
