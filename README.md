# EnrollmentNow — Automated Integration and UI Tests

**Student:** Guilherme Soares Leite Coelho · MCS 4513 · Assignment 4

In this assignment I wrote automated tests for EnrollmentNow at two levels. The API integration tests send real HTTP requests through Express, run the real registration rules, and check the real PostgreSQL test database. The Playwright UI test registers a student through the browser the same way a student would. In both I check the message and also what actually changed: the registration row, the seat count, and the audit record. Because the scenario says a student can join a waitlist when a course is full, I also added integration tests for the waitlist.

## What's in the folder

```
assignment/
  tests/
    registration.integration.test.js   API integration tests (registration: 1 success + 4 negative; waitlist: 4)
    registration.spec.js               Playwright UI test
    testData.js                        Test data setup and cleanup
  test-results/
    test-output.txt                    Output of the final run and of the failed run
    screenshot.png                     Screenshot of the failed UI test
    trace.zip                          Playwright trace of the failed UI test
  defect-report.md                     BUG-001: report, diagnosis, fix, and retest
  README.md
  src/  public/  db/  scripts/         The small EnrollmentNow app the tests run against
  package.json  vitest.config.js  playwright.config.js
```

## Assumption: the application

I didn't have an instructor-supplied app, so I built a small EnrollmentNow that follows the architecture from the lecture: an Express API, a registration service, PostgreSQL, and a simple course page in the browser (plain HTML and JavaScript instead of React, to keep it small). The endpoint, tables, and messages match the assignment's starter code:

- `POST /api/registrations` with `{ studentId, courseCode }` → `201 { message: "Registration successful", registration: {...} }`
- Errors: `409 COURSE_FULL`, `422 MISSING_PREREQUISITE`, `409 ALREADY_REGISTERED`, `404 COURSE_NOT_FOUND`, `400 INVALID_REQUEST`
- `POST /api/waitlist` with `{ studentId, courseCode }` → `201 { message: "Added to waitlist", waitlist: { position } }`. Errors: `409 ALREADY_WAITLISTED`, `409 COURSE_NOT_FULL` (the student should register instead), `404 COURSE_NOT_FOUND`
- Tables: `students`, `courses`, `completed_courses`, `registrations`, `waitlist_entries`, `audit_events`, `schema_migrations`
- Course page: `/courses/MCS-2514?studentId=41`. There is no login in this build, so the student is passed in the URL.

The registration, the seat update, and the audit event all happen in **one transaction**, so a failed request rolls back and leaves nothing half-saved. Joining the waitlist works the same way, and it locks the course row so two students can't get the same position.

## Environment

| Item | Version |
|---|---|
| Build tested | `enrollmentnow-1.0.2` (the failure was on `1.0.0`, fixed in `1.0.1`; `1.0.2` added the waitlist) |
| Database | PostgreSQL 16.15, separate database `enrollmentnow_test` |
| Migration level | `003_create_waitlist_entries` (it was `002_create_audit_events` when the failure happened) |
| Runtime | Node.js 22, Linux |
| Test tools | Vitest 5.1, Supertest 7.3, Playwright 1.63.0 |
| Browser | Chromium (Chrome for Testing 153) |

Every run prints the build and the migration level at the top of the output (see `test-results/test-output.txt`). You can also check them at `GET /api/health`.

## Setup

You need Node.js 20 or newer and PostgreSQL running locally.

```bash
npm install
npx playwright install chromium

# create the separate test database (one time)
createdb enrollmentnow_test

# optional: if your database user/password is different
export DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/enrollmentnow_test

npm run db:migrate
```

## Running the tests

```bash
npm test                    # migrate, then integration tests, then UI test
npm run test:integration    # only the API integration tests (Vitest)
npm run test:ui             # only the Playwright UI test (starts the server on port 5173 by itself)

npx vitest run --sequence.shuffle            # integration tests in random order
npx vitest run -t "duplicate"                # one test by itself
npx playwright test --repeat-each=5 --workers=3   # UI test repeated in parallel
npx playwright show-trace test-results/trace.zip  # open the saved trace
```

## How I kept the tests isolated

- **Separate test database.** `src/db.js` refuses to connect to any database whose name doesn't end in `_test`. That way the tests can never run against production data by accident.
- **Known starting state.** Before each integration test, `resetTestData()` creates the same fixtures: student 41 (completed MCS 1100), student 42 (completed nothing), student 43 (completed MCS 1100, used to check waitlist order), course MCS 2514 with 2 seats that requires MCS 1100, and course MCS 2999 with 0 seats and an empty waitlist.
- **Cleanup that only touches its own data.** The reset and cleanup delete only those fixture IDs, never the whole table. `afterAll` removes them at the end.
- **Unique IDs for the UI test.** Each UI run creates its own course (for example `UI 564100`) and student ID through the test-only `/test/setup/course` endpoint, then deletes exactly those records in `afterEach`. The `/test` routes only exist when `NODE_ENV=test`.
- **Order and parallel runs checked.** I ran the integration tests in shuffled order, ran single tests alone, and ran the UI test 5 times on 3 workers while the integration tests were running. Everything passed every time.

## Locators and timing

- The UI test finds things the way a student sees them: `getByRole("button", { name: "Register" })`, `getByRole("dialog", { name: "Confirm registration" })`, `getByRole("status")`, and `getByRole("heading")`. I only used `getByTestId("seat-count")` for the seat count, because that line has no role or label of its own. No CSS selectors.
- There are **no fixed sleeps**. Every check is a Playwright web assertion (`toBeVisible`, `toHaveText`, `toBeDisabled`) that keeps retrying for up to 5 seconds until the page reaches the expected state. Animations are turned off with `reducedMotion: "reduce"`.
- Screenshots and traces are saved automatically when a test fails (`screenshot: "only-on-failure"`, `trace: "retain-on-failure"`).

## What I found

On build 1.0.0 the UI test failed. The page said "Registration successful" but kept showing "2 seats available". The integration test passed on the same build, and the trace shows the API answered `availableSeats: 1`, so the database was right and the bug was only on the page. I classified it as a **product defect**, fixed it in 1.0.1, and retested. Everything passes now (9 integration tests and the UI test on 1.0.2). The full write-up is in `defect-report.md`.

To me this is the main lesson of the assignment. If I had only checked the success message, I would have missed it. If I had only tested the API, I would have missed it too. It's like a scoreboard that says "Goal!" but doesn't change the score.

## Checking that the tests can fail

To make sure the integration tests aren't passing by accident, I temporarily removed the seat decrement from the registration service. Two tests failed right away (the success test and the duplicate test). Then I put the code back and they passed again. I did the same for the waitlist: I turned off the duplicate check and the duplicate waitlist test failed.

## Sources

Based on Abu Sayed Mahfuz, *Software Quality Assurance: Integrating Testing, Security, and Audit*, Chapters 3–5, and the course lectures "Creating Automated Integration and UI Tests" and "Test Execution, Defect Tracking, and Reporting". Tool documentation: Playwright (writing tests, locators), Vitest, and Supertest.
