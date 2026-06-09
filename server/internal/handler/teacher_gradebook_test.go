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

func TestTeacherGradebookScopesStatsAndKeepsCourseOptions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTeacherGradebookTestHandler(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/teacher/gradebook?groupId=grade-group-a&courseId=grade-course-a", nil)
	c.Set("userId", "grade-teacher-a")

	h.TeacherGradebook(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var body struct {
		Courses []struct {
			ID string `json:"id"`
		} `json:"courses"`
		Items []struct {
			Student struct {
				ID string `json:"id"`
			} `json:"student"`
			ProgressPercent  int    `json:"progressPercent"`
			CompletedCourses int    `json:"completedCourses"`
			CourseCount      int    `json:"courseCount"`
			SubmissionCount  int64  `json:"submissionCount"`
			PassedCount      int64  `json:"passedCount"`
			PendingCount     int64  `json:"pendingCount"`
			FailedCount      int64  `json:"failedCount"`
			AvgScorePercent  int    `json:"avgScorePercent"`
			RiskLevel        string `json:"riskLevel"`
		} `json:"items"`
		Summary struct {
			StudentCount       int   `json:"studentCount"`
			CourseCount        int   `json:"courseCount"`
			AvgProgressPercent int   `json:"avgProgressPercent"`
			AvgScorePercent    int   `json:"avgScorePercent"`
			PassedCount        int64 `json:"passedCount"`
			PendingCount       int64 `json:"pendingCount"`
			FailedCount        int64 `json:"failedCount"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}

	if len(body.Courses) != 2 {
		t.Fatalf("course selector should include all group courses, got %#v", body.Courses)
	}
	if len(body.Items) != 1 || body.Items[0].Student.ID != "grade-student-a" {
		t.Fatalf("expected only group A student, got %#v", body.Items)
	}
	item := body.Items[0]
	if item.ProgressPercent != 80 || item.CompletedCourses != 0 || item.CourseCount != 1 {
		t.Fatalf("unexpected progress fields: %#v", item)
	}
	if item.SubmissionCount != 2 || item.PassedCount != 1 || item.PendingCount != 1 || item.FailedCount != 0 {
		t.Fatalf("unexpected submission counts: %#v", item)
	}
	if item.AvgScorePercent != 40 || item.RiskLevel != "pending" {
		t.Fatalf("unexpected score/risk: avg=%d risk=%s", item.AvgScorePercent, item.RiskLevel)
	}
	if body.Summary.StudentCount != 1 || body.Summary.CourseCount != 1 || body.Summary.AvgProgressPercent != 80 || body.Summary.AvgScorePercent != 40 ||
		body.Summary.PassedCount != 1 || body.Summary.PendingCount != 1 || body.Summary.FailedCount != 0 {
		t.Fatalf("unexpected summary: %#v", body.Summary)
	}
}

func TestTeacherGradebookRejectsUnauthorizedTeacherAndForeignCourse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := newTeacherGradebookTestHandler(t)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/teacher/gradebook?groupId=grade-group-a", nil)
	c.Set("userId", "grade-teacher-b")
	h.TeacherGradebook(c)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for other teacher, got %d body=%s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/teacher/gradebook?groupId=grade-group-a&courseId=grade-course-b", nil)
	c.Set("userId", "grade-teacher-a")
	h.TeacherGradebook(c)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for foreign course, got %d body=%s", w.Code, w.Body.String())
	}
}

func newTeacherGradebookTestHandler(t *testing.T) *Handler {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "sparklab-teacher-gradebook-test.db"))
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
	mustCreate(t, database.Create(&model.User{ID: "grade-teacher-a", Username: "grade-teacher-a", DisplayName: "Teacher A", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.User{ID: "grade-teacher-b", Username: "grade-teacher-b", DisplayName: "Teacher B", Role: "TEACHER", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.User{ID: "grade-student-a", Username: "grade-student-a", DisplayName: "Student A", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)
	mustCreate(t, database.Create(&model.User{ID: "grade-student-b", Username: "grade-student-b", DisplayName: "Student B", Role: "STUDENT", CreatedAt: now, UpdatedAt: now, LastActiveAt: now}).Error)

	mustCreate(t, database.Create(&model.Class{ID: "grade-group-a", Name: "Group A", HomeroomTeacherID: strPtr("grade-teacher-a"), CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Class{ID: "grade-group-b", Name: "Group B", HomeroomTeacherID: strPtr("grade-teacher-b"), CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.GroupMembership{ID: "grade-gm-a", UserID: "grade-student-a", ClassID: "grade-group-a", CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.GroupMembership{ID: "grade-gm-b", UserID: "grade-student-b", ClassID: "grade-group-b", CreatedAt: now}).Error)

	mustCreate(t, database.Create(&model.Course{ID: "grade-course-a", Title: "Course A", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Course{ID: "grade-course-a2", Title: "Course A2", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Course{ID: "grade-course-b", Title: "Course B", IsActive: true, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.CourseClassLink{ID: "grade-link-a", CourseID: "grade-course-a", ClassID: "grade-group-a", CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.CourseClassLink{ID: "grade-link-a2", CourseID: "grade-course-a2", ClassID: "grade-group-a", CreatedAt: now}).Error)
	mustCreate(t, database.Create(&model.CourseClassLink{ID: "grade-link-b", CourseID: "grade-course-b", ClassID: "grade-group-b", CreatedAt: now}).Error)

	mustCreate(t, database.Create(&model.Lab{ID: "grade-lab-a", CourseID: "grade-course-a", Type: "exam", Title: "Exam A", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Lab{ID: "grade-lab-a2", CourseID: "grade-course-a2", Type: "lab", Title: "Lab A2", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)
	mustCreate(t, database.Create(&model.Lab{ID: "grade-lab-b", CourseID: "grade-course-b", Type: "exam", Title: "Exam B", Points: 10, CreatedAt: now, UpdatedAt: now}).Error)

	mustCreate(t, database.Create(&model.Enrollment{ID: "grade-enroll-a", UserID: "grade-student-a", CourseID: "grade-course-a", Progress: 80, StartedAt: now}).Error)
	mustCreate(t, database.Create(&model.Enrollment{ID: "grade-enroll-b", UserID: "grade-student-b", CourseID: "grade-course-b", Progress: 100, StartedAt: now}).Error)

	mustCreate(t, database.Create(&model.Submission{ID: "grade-sub-passed", UserID: "grade-student-a", LabID: "grade-lab-a", Score: 8, MaxScore: 10, Status: "passed", SubmittedAt: now}).Error)
	mustCreate(t, database.Create(&model.Submission{ID: "grade-sub-pending", UserID: "grade-student-a", LabID: "grade-lab-a", Score: 0, MaxScore: 10, Status: "pending", SubmittedAt: now}).Error)
	mustCreate(t, database.Create(&model.Submission{ID: "grade-sub-foreign-student", UserID: "grade-student-b", LabID: "grade-lab-a", Score: 10, MaxScore: 10, Status: "passed", SubmittedAt: now}).Error)
	mustCreate(t, database.Create(&model.Submission{ID: "grade-sub-foreign-course", UserID: "grade-student-a", LabID: "grade-lab-b", Score: 10, MaxScore: 10, Status: "passed", SubmittedAt: now}).Error)

	return &Handler{db: database}
}
