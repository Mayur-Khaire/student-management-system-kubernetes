"use strict";

// Nginx forwards /api requests to the Flask backend.
const API_BASE_URL = "/api";

const elements = {
    totalStudents: document.getElementById("total-students"),
    totalCourses: document.getElementById("total-courses"),
    backendStatus: document.getElementById("backend-status"),
    apiStatus: document.getElementById("api-status"),
    studentCount: document.getElementById("student-count"),
    tableBody: document.getElementById("students-table-body"),
    searchInput: document.getElementById("search-input"),
    refreshButton: document.getElementById("refresh-students"),
    openAddModal: document.getElementById("open-add-modal"),
    modal: document.getElementById("student-modal"),
    modalTitle: document.getElementById("modal-title"),
    closeModal: document.getElementById("close-modal"),
    cancelModal: document.getElementById("cancel-modal"),
    studentForm: document.getElementById("student-form"),
    studentId: document.getElementById("student-id"),
    studentName: document.getElementById("student-name"),
    studentEmail: document.getElementById("student-email"),
    studentCourse: document.getElementById("student-course"),
    saveStudent: document.getElementById("save-student"),
    message: document.getElementById("message")
};

let students = [];
let messageTimer = null;

// Make API requests and handle HTTP errors.
async function apiRequest(path, options = {}) {
    const response = await fetch(API_BASE_URL + path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const responseText = await response.text();
    let data = null;

    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch (error) {
            throw new Error("The server returned an invalid response.");
        }
    }

    if (!response.ok) {
        throw new Error(
            (data && data.error) ||
            (data && data.message) ||
            ("Request failed with HTTP " + response.status + ".")
        );
    }

    return data;
}

// Display temporary success or error messages.
function showMessage(text, type = "success") {
    if (!elements.message) {
        console.error(text);
        return;
    }

    clearTimeout(messageTimer);

    elements.message.textContent = text;
    elements.message.className = "message " + type;
    elements.message.hidden = false;

    messageTimer = setTimeout(function () {
        elements.message.hidden = true;
    }, 5000);
}

// Update the backend connection indicators.
function setBackendStatus(connected) {
    const statusText = connected ? "Online" : "Offline";
    const statusColor = connected ? "#15956a" : "#dc3545";

    if (elements.backendStatus) {
        elements.backendStatus.textContent = statusText;
        elements.backendStatus.style.color = statusColor;
    }

    if (elements.apiStatus) {
        elements.apiStatus.textContent = statusText;
        elements.apiStatus.style.color = connected ? "#6ee7b7" : "#fca5a5";
    }
}

// Check whether the API and database are available.
async function checkHealth() {
    try {
        const health = await apiRequest("/health");

        const connected =
            health &&
            health.status === "ok" &&
            health.database === "connected";

        setBackendStatus(connected);
        return connected;
    } catch (error) {
        setBackendStatus(false);
        console.error("Health check failed:", error.message);
        return false;
    }
}

// Load all student records from the backend.
async function loadStudents(showNotification = false) {
    if (elements.refreshButton) {
        elements.refreshButton.disabled = true;
    }

    if (elements.studentCount) {
        elements.studentCount.textContent = "Loading records...";
    }

    try {
        const data = await apiRequest("/students");

        if (!Array.isArray(data)) {
            throw new Error("The API returned an unexpected student list.");
        }

        students = data;
        renderStudents();

        const connected = await checkHealth();

        if (!connected) {
            showMessage(
                "Student records loaded, but the database health check failed.",
                "error"
            );
        } else if (showNotification) {
            showMessage("Student records refreshed successfully.");
        }
    } catch (error) {
        students = [];
        renderStudents();

        if (elements.studentCount) {
            elements.studentCount.textContent = "Unable to load records";
        }

        setBackendStatus(false);

        showMessage(
            "Could not load students: " + error.message,
            "error"
        );

        console.error("Student loading failed:", error);
    } finally {
        if (elements.refreshButton) {
            elements.refreshButton.disabled = false;
        }
    }
}

// Render the student table and dashboard statistics.
function renderStudents() {
    if (!elements.searchInput || !elements.tableBody) {
        console.error("Student table or search input was not found in the HTML.");
        return;
    }

    const searchTerm = elements.searchInput.value.trim().toLowerCase();

    const filteredStudents = students.filter(function (student) {
        const name = String(student.name || "").toLowerCase();
        const email = String(student.email || "").toLowerCase();
        const course = String(student.course || "").toLowerCase();

        return (
            name.includes(searchTerm) ||
            email.includes(searchTerm) ||
            course.includes(searchTerm)
        );
    });

    if (elements.totalStudents) {
        elements.totalStudents.textContent = students.length;
    }

    const uniqueCourses = new Set(
        students
            .map(function (student) {
                return String(student.course || "").trim();
            })
            .filter(function (course) {
                return course.length > 0;
            })
            .map(function (course) {
                return course.toLowerCase();
            })
    );

    if (elements.totalCourses) {
        elements.totalCourses.textContent = uniqueCourses.size;
    }

    if (elements.studentCount) {
        if (searchTerm) {
            elements.studentCount.textContent =
                filteredStudents.length +
                " of " +
                students.length +
                " students";
        } else {
            elements.studentCount.textContent =
                students.length +
                " student" +
                (students.length === 1 ? "" : "s");
        }
    }

    elements.tableBody.replaceChildren();

    if (filteredStudents.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.className = "empty-state";

        cell.textContent = searchTerm
            ? "No students match your search."
            : "No student records found. Add your first student.";

        row.appendChild(cell);
        elements.tableBody.appendChild(row);
        return;
    }

    filteredStudents.forEach(function (student) {
        const row = document.createElement("tr");

        // Student ID
        const idCell = document.createElement("td");
        idCell.textContent = student.id;

        // Student name and avatar
        const studentCell = document.createElement("td");
        const studentInfo = document.createElement("div");

        studentInfo.className = "student-cell";

        const avatar = document.createElement("div");
        avatar.className = "student-avatar";

        const name = String(student.name || "Unknown");

        avatar.textContent = name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(function (part) {
                return part.charAt(0);
            })
            .join("")
            .toUpperCase();

        const details = document.createElement("div");

        const nameElement = document.createElement("div");
        nameElement.className = "student-name";
        nameElement.textContent = name;

        const idElement = document.createElement("div");
        idElement.className = "student-id";
        idElement.textContent = "Student #" + student.id;

        details.append(nameElement, idElement);
        studentInfo.append(avatar, details);
        studentCell.appendChild(studentInfo);

        // Email
        const emailCell = document.createElement("td");
        emailCell.textContent = student.email || "";

        // Course
        const courseCell = document.createElement("td");
        const courseBadge = document.createElement("span");

        courseBadge.className = "course-badge";
        courseBadge.textContent = student.course || "Not specified";

        courseCell.appendChild(courseBadge);

        // Actions
        const actionsCell = document.createElement("td");
        const actions = document.createElement("div");

        actions.className = "actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "action-button edit-button";
        editButton.textContent = "Edit";

        editButton.addEventListener("click", function () {
            openEditModal(student.id);
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "action-button delete-button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", function () {
            deleteStudent(student.id);
        });

        actions.append(editButton, deleteButton);
        actionsCell.appendChild(actions);

        row.append(
            idCell,
            studentCell,
            emailCell,
            courseCell,
            actionsCell
        );

        elements.tableBody.appendChild(row);
    });
}

// Open the modal for creating a student.
function openAddStudentModal() {
    elements.studentForm.reset();
    elements.studentId.value = "";

    elements.modalTitle.textContent = "Add Student";
    elements.saveStudent.textContent = "Save Student";

    elements.modal.hidden = false;
    elements.studentName.focus();
}

// Open the modal and fill it with an existing student's information.
function openEditModal(studentId) {
    const student = students.find(function (item) {
        return Number(item.id) === Number(studentId);
    });

    if (!student) {
        showMessage(
            "Student record not found. Refresh and try again.",
            "error"
        );
        return;
    }

    elements.studentForm.reset();

    elements.studentId.value = student.id;
    elements.studentName.value = student.name || "";
    elements.studentEmail.value = student.email || "";
    elements.studentCourse.value = student.course || "";

    elements.modalTitle.textContent = "Edit Student";
    elements.saveStudent.textContent = "Update Student";

    elements.modal.hidden = false;
    elements.studentName.focus();
}

// Close the add/edit modal.
function closeStudentModal() {
    elements.modal.hidden = true;
    elements.studentForm.reset();
    elements.studentId.value = "";
}

// Create a new student or update an existing one.
async function saveStudent(event) {
    event.preventDefault();

    const studentId = elements.studentId.value;

    const studentData = {
        name: elements.studentName.value.trim(),
        email: elements.studentEmail.value.trim(),
        course: elements.studentCourse.value.trim()
    };

    if (
        !studentData.name ||
        !studentData.email ||
        !studentData.course
    ) {
        showMessage("Please complete all student fields.", "error");
        return;
    }

    const isEditing = Boolean(studentId);

    elements.saveStudent.disabled = true;
    elements.saveStudent.textContent = isEditing
        ? "Updating..."
        : "Saving...";

    try {
        if (isEditing) {
            await apiRequest(
                "/students/" + encodeURIComponent(studentId),
                {
                    method: "PUT",
                    body: JSON.stringify(studentData)
                }
            );
        } else {
            await apiRequest("/students", {
                method: "POST",
                body: JSON.stringify(studentData)
            });
        }

        closeStudentModal();
        await loadStudents();

        showMessage(
            isEditing
                ? "Student updated successfully."
                : "Student added successfully."
        );
    } catch (error) {
        showMessage(
            "Unable to save student: " + error.message,
            "error"
        );

        console.error("Student save failed:", error);
    } finally {
        elements.saveStudent.disabled = false;
        elements.saveStudent.textContent = isEditing
            ? "Update Student"
            : "Save Student";
    }
}

// Delete a student after explicit confirmation.
async function deleteStudent(studentId) {
    const student = students.find(function (item) {
        return Number(item.id) === Number(studentId);
    });

    if (!student) {
        showMessage(
            "Student record not found. Refresh and try again.",
            "error"
        );
        return;
    }

    const confirmed = window.confirm(
        'Delete the record for "' +
        student.name +
        '"?\n\nThis action cannot be undone.'
    );

    if (!confirmed) {
        return;
    }

    try {
        await apiRequest(
            "/students/" + encodeURIComponent(studentId),
            {
                method: "DELETE"
            }
        );

        await loadStudents();
        showMessage("Student deleted successfully.");
    } catch (error) {
        showMessage(
            "Unable to delete student: " + error.message,
            "error"
        );

        console.error("Student deletion failed:", error);
    }
}

// Event listeners
elements.openAddModal.addEventListener("click", openAddStudentModal);

elements.closeModal.addEventListener("click", closeStudentModal);
elements.cancelModal.addEventListener("click", closeStudentModal);

elements.studentForm.addEventListener("submit", saveStudent);

elements.refreshButton.addEventListener("click", function () {
    loadStudents(true);
});

elements.searchInput.addEventListener("input", renderStudents);

// Close the modal when the user clicks outside the form.
elements.modal.addEventListener("click", function (event) {
    if (event.target === elements.modal) {
        closeStudentModal();
    }
});

// Close the modal with Escape.
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !elements.modal.hidden) {
        closeStudentModal();
    }
});

// Initial dashboard load.
loadStudents();