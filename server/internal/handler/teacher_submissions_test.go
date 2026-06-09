package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"sparklab/server/internal/db"
	"sparklab/server/internal/model"

	"github.com/gin-gonic/gin"
)

func TestTeacherListSubmissionsScopesQueueAndSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTeacherSubmissionsTestHandler(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/teacher/submissions?groupId=group-a&status=pending", nil)
	c.Set("userId", "teacher-a")

	h.TeacherListSubmissions(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var body struct {
		Items []struct {
			ID          string `json:"id"`
			Status      string `json:"status"`
			AnswerCount int64  `json:"answerCount"`
			Student     struct {
				ID string `json:"id"`
			} `json:"student"`
			Lab struct {
				ID string `json:"id"`
			} `json:"lab"`
			Course struct {
				ID string `json:"id"`
			} `json:"course"`
		} `json:"items"`
		Summary struct {
			Total   int `json:"total"`
			Pending int `json:"pending"`
			Passed  int `json:"passed"`
			Failed  int `json:"failed"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}

	if len(body.Items) != 1 {
		t.Fatalf("expected one pending item, got %#v", body.Items)
	}
	item := body.Items[0]
	if item.ID != "sub-pending" || item.Status != "pending" || item.Student.ID != "student-a" || item.Lab.ID != "lab-a" || item.Course.ID != "course-a" {
		t.Fatalf("unexpected pending item: %#v", item)
	}
	if item.AnswerCount != 2 {
		t.Fatalf("expected answer count 2, got %d", item.AnswerCount)
	}
	if body.Summary.Total != 2 || body.Summary.Pending != 1 || body.Summary.Passed != 1 || body.Summary.Failed != 0 {
		t.Fatalf("unexpected summary: %#v", body.Summary)
	}
}

func TestTeacherListSubmissionsRejectsOtherTeacher(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTeacherSubmissionsTestHandler(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/teacher/submissions?groupId=group-a", nil)
	c.Set("userId", "teacher-b")

	h.TeacherListSubmissions(c)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", w.Code, w.Body.String())
	}
}

func newTeacherSubmissionsTestHandler(t *testing.T) *Handler {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-teacher-submissions-test.db"))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("unwrap test db: %v", err)
	}
	t.Cleanup(func() {
		_ = sqlDB.Close()
	})

	now := model.Now()
	mustCreate(t, database.Create(&model.User{ID: "teacher-a", Username: "teacher-a", DisplayName: "Teacher A", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.User{ID: "teacher-b", Username: "teacher-b", DisplayName: "Teacher B", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.User{ID: "student-a", Username: "student-a", DisplayName: "Student A", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.User{ID: "student-b", Username: "student-b", DisplayName: "Student B", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)

	mustCreate(t, database.Create(&model.Class{ID: "group-a", Name: "Group A", HomeroomTeacherID: strPtr("teacher-a"), CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Class{ID: "group-b", Name: "Group B", HomeroomTeacherID: strPtr("teacher-b"), CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.GroupMembership{ID: "gm-a", UserID: "student-a", ClassID: "group-a", CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.GroupMembership{ID: "gm-b", UserID: "student-b", ClassID: "group-b", CreatedAt: now}).Error)

	mustCreate(t, database.Create(&model.Course{ID: "course-a", Title: "Course A", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Course{ID: "course-b", Title: "Course B", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.CourseClassLink{ID: "link-a", CourseID: "course-a", ClassID: "group-a", CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.CourseClassLink{ID: "link-b", CourseID: "course-b", ClassID: "group-b", CreatedAt: now}).Error)

	mustCreate(t, database.Create(&model.Lab{ID: "lab-a", CourseID: "course-a", Type: "exam", Title: "Exam A", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Lab{ID: "lab-b", CourseID: "course-b", Type: "exam", Title: "Exam B", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Question{ID: "question-a-1", LabID: "lab-a", Type: "essay", Title: "Essay 1", Content: "Explain A", Answer: `""`, Points: 5, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Question{ID: "question-a-2", LabID: "lab-a", Type: "essay", Title: "Essay 2", Content: "Explain B", Answer: `""`, Points: 5, CreatedAt: now, UpdatedAt: now}).Error)

	mustCreate(t, database.Create(&model.Submission{ID: "sub-pending", UserID: "student-a", LabID: "lab-a", Score: 0, MaxScore: 10, Status: "pending", SubmittedAt: now}).Error)
	mustCreate(t, database.Create(&model.Submission{ID: "sub-passed", UserID: "student-a", LabID: "lab-a", Score: 8, MaxScore: 10, Status: "passed", SubmittedAt: now}).Error)
	mustCreate(t, database.Create(&model.Submission{ID: "sub-other-student", UserID: "student-b", LabID: "lab-a", Score: 0, MaxScore: 10, Status: "pending", SubmittedAt: now}).Error)
	mustCreate(t, database.Create(&model.Submission{ID: "sub-other-course", UserID: "student-a", LabID: "lab-b", Score: 0, MaxScore: 10, Status: "pending", SubmittedAt: now}).Error)

	mustCreate(t, database.Create(&model.Answer{ID: "answer-a-1", UserID: "student-a", QuestionID: "question-a-1", SubmissionID: "sub-pending", Answer: `"a"`, Score: 0, CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Answer{ID: "answer-a-2", UserID: "student-a", QuestionID: "question-a-2", SubmissionID: "sub-pending", Answer: `"b"`, Score: 0, CreatedAt: now}).Error)

	return &Handler{db: database}
}
