# Defect Report — BUG-001

**Student:** Guilherme Soares Leite Coelho · MCS 4513 · Assignment 4

| Field | Content |
|---|---|
| **Title** | Seat count on the course page does not update after a successful registration |
| **Environment** | Build enrollmentnow-1.0.0 · Chromium (Chrome for Testing 153) via Playwright 1.63.0 · Linux · PostgreSQL 16.15, database `enrollmentnow_test` · migration level `002_create_audit_events` · NODE_ENV=test |
| **Preconditions** | Test student (unique ID, no prerequisites needed) exists and is not registered. Course `UI 564100` exists with capacity 30, 2 available seats, no prerequisite. Student is identified by `?studentId=` in the URL (this build has no login). All created through `POST /test/setup/course`. |
| **Steps** | 1. Open `/courses/UI-564100?studentId=1464100`. 2. Select **Register**. 3. Select **Confirm** in the "Confirm registration" dialog. |
| **Expected result** | "Registration successful" appears and the seat count changes from "2 seats available" to "1 seat available". |
| **Actual result** | "Registration successful" appears and the button changes to "Registered", but the page still shows **"2 seats available"**. The database is correct: the API returned `201` with `"availableSeats": 1`, and the integration test confirms the seat count really goes from 2 to 1. Only the page is wrong. |
| **Evidence** | Test `tests/registration.spec.js › student registers for an available course`, failed on 2026-11-20 at 17:37 EST. Error: `expect(getByTestId('seat-count')).toHaveText("1 seat available")`, received `"2 seats available"` after retrying for 5 s (14 checks). Files: `test-results/screenshot.png`, `test-results/trace.zip` (open with `npx playwright show-trace test-results/trace.zip`; the Network tab shows the POST response with `availableSeats: 1`), and `test-results/test-output.txt` (Run 1). |
| **Severity** | **Medium.** The registration itself is saved correctly and no data is lost. But the student sees wrong information right after registering, and on enrollment day other students would think there are more seats than there really are. Workaround: reload the page. |

## Diagnosis

Before calling this a product defect, I ruled out the other options:

- **Test defect?** No. The locator finds the right element (`seat-count`), and "1 seat available" is the correct expected text for 2 seats minus 1.
- **Timing problem?** No. `toHaveText` kept retrying for 5 seconds and the text never changed. It wasn't "too early", it was just wrong.
- **Environment failure?** No. The server, database, and fixture setup all worked, and the API answered 201.
- **Requirement gap?** No. The assignment and the acceptance criterion say the seat count has to decrease.
- **Product defect?** Yes. The API sent back the new seat count (1), but the page ignored it and redrew the value it loaded *before* registering (`renderSeats(course.availableSeats)` in `public/course.js`).

This is a good example of why we need both test levels. The integration test passed because the database was right. Only the UI test could see that the student was being shown the wrong number.

## Fix and retest

- **Fix (build 1.0.1):** `public/course.js` now saves `body.registration.availableSeats` from the API response before redrawing the seat count.
- **Retest:** same test, build enrollmentnow-1.0.1, same environment, 2026-11-20 at 17:38 EST → **passed** ("1 seat available" shown).
- **Regression:** all 5 API integration tests passed on 1.0.1. The UI test also passed 5 times in a row on 3 parallel workers, so the fix is stable.
- **Latest run:** on build 1.0.2 (which added the waitlist), 2026-11-23, the UI test still passes and all 9 integration tests pass. This is Run 2 in `test-results/test-output.txt`.
- **Status:** Closed (fix verified on the correct build).
- **Root cause and prevention:** the page kept its own copy of the data instead of trusting the server's answer. Every UI test that changes data should assert the new value on screen, not only the success message.
