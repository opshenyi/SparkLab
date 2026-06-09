package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestGetExamQuestionsRequiresTrainingAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newCourseProgressTestHandler(t)
	now := model.Now()
	options := `["A","B"]`
	explanation := "Because"

	mustCreate(t, h.db.Create(&model.User{ID: "exam-unenrolled", Username: "exam-unenrolled", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.User{ID: "exam-enrolled", Username: "exam-enrolled", DisplayName: "Student", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.User{ID: "exam-admin", Username: "exam-admin", DisplayName: "Admin", Role: "ADMIN", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Course{ID: "exam-public-course", Title: "Public Course", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Enrollment{ID: "exam-enrollment", UserID: "exam-enrolled", CourseID: "exam-public-course", StartedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Lab{ID: "exam-public-lab", CourseID: "exam-public-course", Type: "exam", Title: "Exam", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, h.db.Create(&model.Question{
		ID:          "exam-public-question",
		LabID:       "exam-public-lab",
		Type:        "single",
		Title:       "Pick one",
		Content:     "Pick A",
		Options:     &options,
		Answer:      `"A"`,
		Explanation: &explanation,
		Points:      10,
		CreatedAt:   now,
		UpdatedAt:   now,
	}).Error)

	w := examQuestionsRequest(h, "", "")
	assertForbidden(t, w)

	w = examQuestionsRequest(h, "exam-unenrolled", "STUDENT")
	assertForbidden(t, w)

	w = examQuestionsRequest(h, "exam-enrolled", "STUDENT")
	if w.Code != http.StatusOK {
		t.Fatalf("expected enrolled student 200, got %d body=%s", w.Code, w.Body.String())
	}
	studentQuestions := decodeExamQuestions(t, w)
	if len(studentQuestions) != 1 {
		t.Fatalf("expected one question for enrolled student, got %d", len(studentQuestions))
	}
	if _, ok := studentQuestions[0]["answer"]; ok {
		t.Fatalf("expected enrolled student response to omit answer: %#v", studentQuestions[0])
	}
	if _, ok := studentQuestions[0]["explanation"]; ok {
		t.Fatalf("expected enrolled student response to omit explanation: %#v", studentQuestions[0])
	}

	w = examQuestionsRequest(h, "exam-admin", "ADMIN")
	if w.Code != http.StatusOK {
		t.Fatalf("expected admin 200, got %d body=%s", w.Code, w.Body.String())
	}
	adminQuestions := decodeExamQuestions(t, w)
	if len(adminQuestions) != 1 {
		t.Fatalf("expected one question for admin, got %d", len(adminQuestions))
	}
	if adminQuestions[0]["answer"] != "A" || adminQuestions[0]["explanation"] != explanation {
		t.Fatalf("expected admin response to include answer and explanation: %#v", adminQuestions[0])
	}
}

func TestSameStringSetRequiresExactMultiplicity(t *testing.T) {
	if !sameStringSet([]string{"A", "B"}, []string{"B", "A"}) {
		t.Fatal("expected same options in different order to match")
	}
	if sameStringSet([]string{"A", "A"}, []string{"A", "B"}) {
		t.Fatal("expected duplicated student option to be rejected")
	}
	if sameStringSet([]string{"A"}, []string{"A", "B"}) {
		t.Fatal("expected missing option to be rejected")
	}
}

func examQuestionsRequest(h *Handler, userID, role string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/labs/exam-public-lab/questions", nil)
	c.Params = gin.Params{{Key: "id", Value: "exam-public-lab"}}
	if userID != "" {
		c.Set("userId", userID)
	}
	if role != "" {
		c.Set("role", role)
	}
	h.GetExamQuestions(c)
	return w
}

func decodeExamQuestions(t *testing.T, w *httptest.ResponseRecorder) []map[string]any {
	t.Helper()
	var questions []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &questions); err != nil {
		t.Fatalf("decode questions: %v body=%s", err, w.Body.String())
	}
	return questions
}
