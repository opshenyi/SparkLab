package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestSubmitLabRejectsDuplicatePendingOrPassedSubmission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	wallNow := time.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "lab-dup-student", Username: "lab-dup-student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "lab-dup-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Enrollment{ID: "lab-dup-enrollment", UserID: "lab-dup-student", CourseID: "lab-dup-course", StartedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "lab-dup-lab", CourseID: "lab-dup-course", Type: "lab", Title: "Lab", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Submission{ID: "lab-dup-pending", UserID: "lab-dup-student", LabID: "lab-dup-lab", Score: 0, MaxScore: 10, Status: "pending", SubmittedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Container{ID: "lab-dup-container", UserID: "lab-dup-student", LabID: "lab-dup-lab", Status: "creating", CreatedAt: wallNow, LastActiveAt: wallNow}).Error)

	w := submitLabRequest(h, "lab-dup-lab", "lab-dup-student")
	if w.Code != http.StatusConflict {
		t.Fatalf("expected duplicate pending lab submit 409, got %d body=%s", w.Code, w.Body.String())
	}
	assertDuplicateLabResponse(t, w.Body.Bytes(), "lab-dup-pending", "pending")
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ?", []any{"lab-dup-student", "lab-dup-lab"}, 1)
	assertModelCount(t, h, &model.Container{}, "userId = ? AND labId = ?", []any{"lab-dup-student", "lab-dup-lab"}, 1)

	mustCreate(t, h.db.Model(&model.Submission{}).Where("id = ?", "lab-dup-pending").Update("status", "passed").Error)
	w = submitLabRequest(h, "lab-dup-lab", "lab-dup-student")
	if w.Code != http.StatusConflict {
		t.Fatalf("expected duplicate passed lab submit 409, got %d body=%s", w.Code, w.Body.String())
	}
	assertDuplicateLabResponse(t, w.Body.Bytes(), "lab-dup-pending", "passed")
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ?", []any{"lab-dup-student", "lab-dup-lab"}, 1)
}

func TestSubmitLabAllowsRetryAfterFailedSubmission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "lab-retry-student", Username: "lab-retry-student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "lab-retry-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Enrollment{ID: "lab-retry-enrollment", UserID: "lab-retry-student", CourseID: "lab-retry-course", StartedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "lab-retry-lab", CourseID: "lab-retry-course", Type: "lab", Title: "Lab", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Submission{ID: "lab-retry-failed", UserID: "lab-retry-student", LabID: "lab-retry-lab", Score: 0, MaxScore: 10, Status: "failed", SubmittedAt: now}).Error)

	w := submitLabRequest(h, "lab-retry-lab", "lab-retry-student")
	if w.Code != http.StatusOK {
		t.Fatalf("expected retry after failed lab submit 200, got %d body=%s", w.Code, w.Body.String())
	}
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ?", []any{"lab-retry-student", "lab-retry-lab"}, 2)
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ? AND status = ?", []any{"lab-retry-student", "lab-retry-lab", "pending"}, 1)
}

func submitLabRequest(h *Handler, labID, userID string) *httptest.ResponseRecorder {
	return trainingRequest(http.MethodPost, "/labs/"+labID+"/submit", gin.H{}, userID, "STUDENT", gin.Params{{Key: "id", Value: labID}}, h.SubmitLab)
}

func assertDuplicateLabResponse(t *testing.T, body []byte, submissionID, status string) {
	t.Helper()
	var payload struct {
		SubmissionID string `json:"submissionId"`
		Status       string `json:"status"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode duplicate lab response: %v body=%s", err, string(body))
	}
	if payload.SubmissionID != submissionID || payload.Status != status {
		t.Fatalf("unexpected duplicate lab response: %#v", payload)
	}
}
