// Course page: /courses/MCS-2514?studentId=41
const slug = decodeURIComponent(location.pathname.split("/").pop());
const courseCode = slug.replace(/-/g, " ");
const studentId = Number(new URLSearchParams(location.search).get("studentId") || 41);

const heading = document.getElementById("course-heading");
const seatCount = document.getElementById("seat-count");
const registerButton = document.getElementById("register-button");
const dialog = document.getElementById("confirm-dialog");
const confirmText = document.getElementById("confirm-text");
const confirmButton = document.getElementById("confirm-button");
const cancelButton = document.getElementById("cancel-button");
const statusMessage = document.getElementById("status-message");

let course;

function renderSeats(n) {
  if (n === 0) seatCount.textContent = "Course full";
  else seatCount.textContent = `${n} ${n === 1 ? "seat" : "seats"} available`;
}

function showStatus(text, kind) {
  statusMessage.textContent = text;
  statusMessage.className = kind;
}

async function loadCourse() {
  const res = await fetch(`/api/courses/${encodeURIComponent(courseCode)}`);
  if (!res.ok) {
    heading.textContent = "Course not found";
    registerButton.disabled = true;
    return;
  }
  course = await res.json();
  heading.textContent = `${course.code} — ${course.title}`;
  renderSeats(course.availableSeats);
}

registerButton.addEventListener("click", () => {
  confirmText.textContent = `Register for ${course.code}?`;
  dialog.hidden = false;
  confirmButton.focus();
});

cancelButton.addEventListener("click", () => {
  dialog.hidden = true;
  registerButton.focus();
});

confirmButton.addEventListener("click", async () => {
  confirmButton.disabled = true; // prevents a double-click from sending two requests
  const res = await fetch("/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, courseCode: course.code }),
  });
  const body = await res.json();
  dialog.hidden = true;
  confirmButton.disabled = false;

  if (res.status === 201) {
    showStatus(body.message, "success");
    // Fix for BUG-001 (build 1.0.1): show the seat count the server just saved,
    // not the value loaded before registration.
    course.availableSeats = body.registration.availableSeats;
    renderSeats(course.availableSeats);
    registerButton.disabled = true;
    registerButton.textContent = "Registered";
  } else {
    showStatus(`Registration failed: ${body.message}`, "error");
  }
});

loadCourse();
