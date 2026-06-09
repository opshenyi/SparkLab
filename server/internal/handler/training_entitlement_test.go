package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestStudentTrainingActionsRequireEnrollment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "entitle-student", Username: "entitle-student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "entitle-course", Title: "Public Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "entitle-lab", CourseID: "entitle-course", Type: "lab", Title: "Lab", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "entitle-exam", CourseID: "entitle-course", Type: "exam", Title: "Exam", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "entitle-video", CourseID: "entitle-course", Type: "video", Title: "Video", Points: 10, VideoDuration: 100, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Question{ID: "entitle-question", LabID: "entitle-exam", Type: "single", Title: "Question", Content: "Pick", Answer: `"yes"`, Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.CourseMaterial{ID: "entitle-material", CourseID: "entitle-course", Title: "Guide", OriginalName: "guide.pdf", StoredPath: "guide.pdf", MimeType: "application/pdf", FileKind: "pdf", CreatedAt: now}).Error)

	w := trainingRequest(http.MethodPost, "/containers", gin.H{"labId": "entitle-lab"}, "entitle-student", "STUDENT", nil, h.CreateContainer)
	assertForbidden(t, w)
	assertModelCount(t, h, &model.Container{}, "userId = ?", []any{"entitle-student"}, 0)

	w = trainingRequest(http.MethodPost, "/labs/entitle-lab/submit", gin.H{}, "entitle-student", "STUDENT", gin.Params{{Key: "id", Value: "entitle-lab"}}, h.SubmitLab)
	assertForbidden(t, w)
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ?", []any{"entitle-student", "entitle-lab"}, 0)

	w = trainingRequest(http.MethodPost, "/labs/entitle-exam/submit-exam", gin.H{
		"answers": []gin.H{{"questionId": "entitle-question", "answer": "yes"}},
	}, "entitle-student", "STUDENT", gin.Params{{Key: "id", Value: "entitle-exam"}}, h.SubmitExam)
	assertForbidden(t, w)
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ?", []any{"entitle-student", "entitle-exam"}, 0)

	w = trainingRequest(http.MethodPost, "/course-materials/entitle-material/complete", gin.H{}, "entitle-student", "STUDENT", gin.Params{{Key: "id", Value: "entitle-material"}}, h.CompleteCourseMaterial)
	assertForbidden(t, w)
	assertModelCount(t, h, &model.MaterialProgress{}, "userId = ? AND materialId = ?", []any{"entitle-student", "entitle-material"}, 0)

	w = trainingRequest(http.MethodPost, "/labs/entitle-video/complete-video", gin.H{
		"watchedDuration": 95,
		"totalDuration":   100,
		"progress":        95,
	}, "entitle-student", "STUDENT", gin.Params{{Key: "id", Value: "entitle-video"}}, h.CompleteVideo)
	assertForbidden(t, w)
	assertModelCount(t, h, &model.VideoProgress{}, "userId = ? AND labId = ?", []any{"entitle-student", "entitle-video"}, 0)
}

func TestEnrolledStudentCanSubmitLabAndExam(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()

	mustCreate(t, h.db.Create(&model.User{ID: "enrolled-student", Username: "enrolled-student", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "enrolled-course", Title: "Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Enrollment{ID: "enrolled-record", UserID: "enrolled-student", CourseID: "enrolled-course", StartedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "enrolled-lab", CourseID: "enrolled-course", Type: "lab", Title: "Lab", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "enrolled-exam", CourseID: "enrolled-course", Type: "exam", Title: "Exam", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Question{ID: "enrolled-question", LabID: "enrolled-exam", Type: "single", Title: "Question", Content: "Pick", Answer: `"yes"`, Points: 10, CreatedAt: now, UpdatedAt: now}).Error)

	w := trainingRequest(http.MethodPost, "/labs/enrolled-lab/submit", gin.H{}, "enrolled-student", "STUDENT", gin.Params{{Key: "id", Value: "enrolled-lab"}}, h.SubmitLab)
	if w.Code != http.StatusOK {
		t.Fatalf("expected enrolled lab submit 200, got %d body=%s", w.Code, w.Body.String())
	}
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ?", []any{"enrolled-student", "enrolled-lab"}, 1)

	w = trainingRequest(http.MethodPost, "/labs/enrolled-exam/submit-exam", gin.H{
		"answers": []gin.H{{"questionId": "enrolled-question", "answer": "yes"}},
	}, "enrolled-student", "STUDENT", gin.Params{{Key: "id", Value: "enrolled-exam"}}, h.SubmitExam)
	if w.Code != http.StatusOK {
		t.Fatalf("expected enrolled exam submit 200, got %d body=%s", w.Code, w.Body.String())
	}
	assertModelCount(t, h, &model.Submission{}, "userId = ? AND labId = ? AND status = ?", []any{"enrolled-student", "enrolled-exam", "passed"}, 1)
}

func trainingRequest(method, path string, body any, userID, role string, params gin.Params, call func(*gin.Context)) *httptest.ResponseRecorder {
	payload, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, bytes.NewReader(payload))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = params
	c.Set("userId", userID)
	c.Set("role", role)
	call(c)
	return w
}

func assertForbidden(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func assertModelCount(t *testing.T, h *Handler, modelValue any, query string, args []any, expected int64) {
	t.Helper()
	var count int64
	if err := h.db.Model(modelValue).Where(query, args...).Count(&count).Error; err != nil {
		t.Fatalf("count %T: %v", modelValue, err)
	}
	if count != expected {
		t.Fatalf("expected %T count %d, got %d", modelValue, expected, count)
	}
}
